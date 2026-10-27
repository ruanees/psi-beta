-- Repetição quinzenal. O horário de sempre do paciente pode ser toda semana ou
-- a cada duas semanas (pedido das psicólogas do beta). A repetição guarda o
-- intervalo, e as sessões são geradas a partir do primeiro dia dela: numa
-- quinzenal, a semana do meio fica livre.
--
-- Quem lê a sessão recebe também `intervalo_semanas`, para a tela dizer
-- "toda semana" ou "a cada 15 dias" sem perguntar de novo.

alter table public.recorrencias
  add column intervalo_semanas smallint not null default 1 check (intervalo_semanas in (1, 2));
comment on column public.recorrencias.intervalo_semanas is '1 = toda semana, 2 = a cada 15 dias. Contado a partir de `inicio`.';

-- ------------------------------------------------------------ geração

-- Gera as sessões de uma recorrência até `ate`. Ocorrência que bate em outra
-- sessão (ou já existe) é pulada em silêncio: a agenda mostra o choque como
-- dia sem a sessão, e o psicólogo remarca aquela semana. Na quinzenal, a
-- primeira data gerada cai numa semana par a contar de `inicio`.
create or replace function privado.gerar_recorrencia(r uuid, ate date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  rc public.recorrencias;
  desde date;
  limite date;
begin
  select * into rc from public.recorrencias where id = r for update;
  desde := greatest(rc.inicio, rc.gerada_ate + 1);
  limite := least(coalesce(rc.fim, ate), ate);
  if limite < desde then
    return;
  end if;
  desde := desde + ((rc.dia_semana - extract(dow from desde)::int + 7) % 7);
  if ((desde - rc.inicio) / 7) % rc.intervalo_semanas <> 0 then
    desde := desde + 7 * (rc.intervalo_semanas - ((desde - rc.inicio) / 7) % rc.intervalo_semanas);
  end if;
  insert into public.sessoes (conta_id, paciente_id, profissional_id, recorrencia_id, inicio, fim, modalidade)
  select rc.conta_id, rc.paciente_id, rc.profissional_id, rc.id,
         privado.instante(d::date, rc.hora),
         privado.instante(d::date, rc.hora) + make_interval(mins => rc.duracao_min),
         rc.modalidade
    from generate_series(desde, limite, make_interval(days => 7 * rc.intervalo_semanas)) d
  on conflict do nothing;
  update public.recorrencias set gerada_ate = limite where id = r and gerada_ate < limite;
end;
$$;

-- Lê o intervalo pedido: sem ele, toda semana; fora de 1 ou 2, erro.
create function privado.intervalo_pedido(d jsonb, padrao smallint default 1) returns smallint
language plpgsql immutable set search_path = '' as $$
begin
  if d ->> 'intervalo_semanas' is null then
    return padrao;
  end if;
  if d ->> 'intervalo_semanas' not in ('1', '2') then
    raise exception 'intervalo_invalido' using errcode = 'P0001';
  end if;
  return (d ->> 'intervalo_semanas')::smallint;
end;
$$;
revoke all on function privado.intervalo_pedido(jsonb, smallint) from public;

-- ------------------------------------------------------------ criar e alterar

-- Cria uma sessão, ou a primeira de uma repetição e as próximas 8 semanas.
-- d: {paciente_id, inicio, duracao_min, modalidade, repetir_semanal, intervalo_semanas}
create or replace function public.sessao_criar(c uuid, d jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_membro uuid := public.exigir_membro(c);
  pa public.pacientes;
  v_inicio timestamptz := (d ->> 'inicio')::timestamptz;
  v_dur int := (d ->> 'duracao_min')::int;
  v_mod text := d ->> 'modalidade';
  v_intervalo smallint := privado.intervalo_pedido(d);
  v_local timestamp;
  v_rec uuid;
  v_id uuid;
begin
  pa := privado.exigir_paciente(c, (d ->> 'paciente_id')::uuid);
  if pa.situacao <> 'ativo' then
    raise exception 'paciente_inativo' using errcode = 'P0001';
  end if;
  if coalesce((d ->> 'repetir_semanal')::boolean, false) then
    v_local := v_inicio at time zone 'America/Sao_Paulo';
    insert into public.recorrencias (conta_id, paciente_id, profissional_id, dia_semana, hora, duracao_min,
                                     modalidade, inicio, gerada_ate, intervalo_semanas)
    values (c, pa.id, v_membro, extract(dow from v_local)::smallint, v_local::time, v_dur, v_mod,
            v_local::date, v_local::date, v_intervalo)
    returning id into v_rec;
  end if;
  -- A primeira sessão entra explicitamente: um choque nela é erro, não pulo silencioso.
  insert into public.sessoes (conta_id, paciente_id, profissional_id, recorrencia_id, inicio, fim, modalidade)
  values (c, pa.id, v_membro, v_rec, v_inicio, v_inicio + make_interval(mins => v_dur), v_mod)
  returning id into v_id;
  if v_rec is not null then
    perform privado.gerar_recorrencia(v_rec, privado.horizonte());
  end if;
  perform privado.registrar('criar', 'sessoes', v_id, c, pa.id);
  return v_id;
end;
$$;

-- Muda horário, duração ou modalidade. escopo 'esta' mexe só nela; 'proximas'
-- encerra a repetição antiga a partir daqui e começa outra com a regra nova,
-- que pode trocar também o intervalo (semanal para quinzenal e vice-versa).
create or replace function public.sessao_alterar(c uuid, s uuid, d jsonb, escopo text default 'esta') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  ss public.sessoes;
  rc public.recorrencias;
  v_inicio timestamptz;
  v_dur int;
  v_mod text;
  v_local timestamp;
  v_rec uuid;
  v_id uuid;
begin
  perform public.exigir_membro(c);
  select * into ss from public.sessoes where id = s and conta_id = c for update;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0001';
  end if;
  if ss.status not in ('agendada', 'confirmada') then
    raise exception 'sessao_encerrada' using errcode = 'P0001';
  end if;
  v_inicio := coalesce((d ->> 'inicio')::timestamptz, ss.inicio);
  v_dur := coalesce((d ->> 'duracao_min')::int, (extract(epoch from ss.fim - ss.inicio) / 60)::int);
  v_mod := coalesce(d ->> 'modalidade', ss.modalidade);

  if escopo = 'esta' then
    update public.sessoes
       set inicio = v_inicio, fim = v_inicio + make_interval(mins => v_dur), modalidade = v_mod, alterada_em = now()
     where id = s;
    perform privado.registrar('editar', 'sessoes', s, c, ss.paciente_id);
    return s;
  end if;

  if escopo <> 'proximas' or ss.recorrencia_id is null then
    raise exception 'sem_recorrencia' using errcode = 'P0001';
  end if;
  select * into rc from public.recorrencias where id = ss.recorrencia_id for update;
  update public.recorrencias set fim = (ss.inicio at time zone 'America/Sao_Paulo')::date - 1 where id = rc.id;
  delete from public.sessoes
   where recorrencia_id = rc.id and inicio >= ss.inicio and status in ('agendada', 'confirmada');
  v_local := v_inicio at time zone 'America/Sao_Paulo';
  insert into public.recorrencias (conta_id, paciente_id, profissional_id, dia_semana, hora, duracao_min,
                                   modalidade, inicio, fim, gerada_ate, intervalo_semanas)
  values (c, rc.paciente_id, rc.profissional_id, extract(dow from v_local)::smallint, v_local::time, v_dur, v_mod,
          v_local::date, rc.fim, v_local::date, privado.intervalo_pedido(d, rc.intervalo_semanas))
  returning id into v_rec;
  insert into public.sessoes (conta_id, paciente_id, profissional_id, recorrencia_id, inicio, fim, modalidade)
  values (c, rc.paciente_id, rc.profissional_id, v_rec, v_inicio, v_inicio + make_interval(mins => v_dur), v_mod)
  returning id into v_id;
  perform privado.gerar_recorrencia(v_rec, greatest(rc.gerada_ate, privado.horizonte()));
  perform privado.registrar('editar', 'recorrencias', v_rec, c, rc.paciente_id);
  return v_id;
end;
$$;

-- ------------------------------------------------------------ leituras

-- A ficha diz o intervalo da repetição.
create or replace function public.paciente_ler(c uuid, p uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pa public.pacientes;
  clinico boolean;
begin
  perform public.exigir_membro(c);
  pa := privado.exigir_paciente(c, p);
  clinico := public.pode_clinico(p);
  if clinico then
    perform privado.registrar('ler', 'pacientes', p, c, p);
  end if;
  return jsonb_build_object(
    'id', pa.id,
    'nome', pa.nome,
    'nascimento', pa.nascimento,
    'cpf', pa.cpf,
    'telefone', pa.telefone,
    'queixa_principal', case when clinico then pa.queixa_principal end,
    'pode_clinico', clinico,
    'valor_sessao', pa.valor_sessao,
    'plano', jsonb_build_object(
      'tipo', pa.plano,
      'sessoes', pa.plano_sessoes,
      'valor', case when pa.plano = 'avulsa' then pa.valor_sessao else pa.plano_valor end),
    'situacao', pa.situacao,
    'consentimento_em', pa.consentimento_em,
    'criado_em', pa.criado_em,
    'responsaveis', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'nome', r.nome, 'parentesco', r.parentesco,
               'telefone', r.telefone, 'cpf', r.cpf, 'financeiro', r.financeiro
             ) order by r.criado_em)
        from public.responsaveis r where r.paciente_id = p), '[]'::jsonb),
    'proxima_sessao', (
      select jsonb_build_object('id', s.id, 'inicio', s.inicio, 'fim', s.fim,
                                'modalidade', s.modalidade, 'status', s.status)
        from public.sessoes s
       where s.paciente_id = p and s.inicio >= now() and s.status in ('agendada', 'confirmada')
       order by s.inicio limit 1),
    'repeticao', (
      select jsonb_build_object('id', rc.id, 'dia_semana', rc.dia_semana, 'hora', to_char(rc.hora, 'HH24:MI'),
                                'duracao_min', rc.duracao_min, 'modalidade', rc.modalidade,
                                'intervalo_semanas', rc.intervalo_semanas)
        from public.recorrencias rc
       where rc.paciente_id = p and (rc.fim is null or rc.fim >= greatest(privado.hoje(), rc.inicio))
       order by rc.criada_em desc limit 1),
    'contagem', jsonb_build_object(
      'realizadas', (select count(*) from public.sessoes s where s.paciente_id = p and s.status = 'realizada'),
      'faltas', (select count(*) from public.sessoes s where s.paciente_id = p and s.status = 'falta'),
      'canceladas', (select count(*) from public.sessoes s where s.paciente_id = p and s.status = 'cancelada')
    )
  );
end;
$$;

-- As duas devolvem tabela: a coluna nova pede apagar e criar de novo.
drop function public.agenda_listar(uuid, timestamptz, timestamptz);
create function public.agenda_listar(c uuid, de timestamptz, ate timestamptz)
returns table (
  id uuid, paciente_id uuid, paciente_nome text, inicio timestamptz, fim timestamptz,
  modalidade text, status text, recorrencia_id uuid, intervalo_semanas smallint
)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  if ate <= de or ate - de > interval '62 days' then
    raise exception 'periodo_invalido' using errcode = 'P0001';
  end if;
  perform privado.estender_recorrencias(c, greatest((ate at time zone 'America/Sao_Paulo')::date, privado.horizonte()));
  return query
    select s.id, s.paciente_id, pa.nome, s.inicio, s.fim, s.modalidade, s.status, s.recorrencia_id, rc.intervalo_semanas
      from public.sessoes s
      join public.pacientes pa on pa.id = s.paciente_id
      left join public.recorrencias rc on rc.id = s.recorrencia_id
     where s.conta_id = c and s.inicio < ate and s.inicio > de - interval '8 hours' and s.fim > de
     order by s.inicio;
end;
$$;

drop function public.sessoes_do_paciente(uuid, uuid);
create function public.sessoes_do_paciente(c uuid, p uuid)
returns table (
  id uuid, inicio timestamptz, fim timestamptz, modalidade text, status text, recorrencia_id uuid,
  intervalo_semanas smallint
)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  perform privado.estender_recorrencias(c, privado.horizonte());
  return query
    select s.id, s.inicio, s.fim, s.modalidade, s.status, s.recorrencia_id, rc.intervalo_semanas
      from public.sessoes s
      left join public.recorrencias rc on rc.id = s.recorrencia_id
     where s.paciente_id = p
     order by s.inicio desc
     limit 500;
end;
$$;

revoke execute on function public.agenda_listar(uuid, timestamptz, timestamptz), public.sessoes_do_paciente(uuid, uuid)
  from public, anon;
grant execute on function public.agenda_listar(uuid, timestamptz, timestamptz), public.sessoes_do_paciente(uuid, uuid)
  to authenticated;

create or replace function public.proxima_online(c uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  return (
    select jsonb_build_object(
             'id', s.id, 'paciente_id', s.paciente_id, 'paciente_nome', pa.nome,
             'inicio', s.inicio, 'fim', s.fim, 'modalidade', s.modalidade, 'status', s.status,
             'recorrencia_id', s.recorrencia_id, 'intervalo_semanas', rc.intervalo_semanas,
             'link', privado.link_da_sessao(s.id))
      from public.sessoes s
      join public.pacientes pa on pa.id = s.paciente_id
      left join public.recorrencias rc on rc.id = s.recorrencia_id
     where s.conta_id = c and s.modalidade = 'online'
       and s.status in ('agendada', 'confirmada')
       and s.inicio > now() - interval '8 hours 15 minutes'
       and s.fim + interval '15 minutes' > now()
     order by s.inicio
     limit 1
  );
end;
$$;

-- Linha do tempo do paciente: tudo o que já aconteceu, da mais recente para a
-- mais antiga. O texto do relato só vem para o psicólogo do paciente.
create or replace function public.historico_paciente(c uuid, p uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  clinico boolean;
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  clinico := public.pode_clinico(p);
  if clinico and exists (select 1 from public.observacoes o where o.paciente_id = p) then
    perform privado.registrar('ler', 'observacoes', null, c, p);
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id, 'inicio', x.inicio, 'fim', x.fim, 'modalidade', x.modalidade, 'status', x.status,
             'recorrencia_id', x.recorrencia_id, 'intervalo_semanas', x.intervalo_semanas,
             'observacao', case when clinico then x.texto end,
             'alterada_em', case when clinico then x.alterada_em end,
             'versao', case when clinico then x.versao end,
             'adendos', case when clinico then x.adendos else 0 end,
             'editavel_ate', privado.trava(x.inicio)
           ) order by x.inicio desc)
      from (
        select s.id, s.inicio, s.fim, s.modalidade, s.status, s.recorrencia_id, rc.intervalo_semanas,
               o.texto, o.alterada_em, o.versao,
               (select count(*) from public.adendos a where a.sessao_id = s.id)::int as adendos
          from public.sessoes s
          left join public.observacoes o on o.sessao_id = s.id
          left join public.recorrencias rc on rc.id = s.recorrencia_id
         where s.paciente_id = p and s.inicio <= now()
         order by s.inicio desc
         limit 1000
      ) x), '[]'::jsonb);
end;
$$;

-- Sessões realizadas ainda sem relato nem adendo, dos pacientes de quem chama.
create or replace function public.pendencias_observacao(c uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_membro uuid;
begin
  v_membro := public.exigir_membro(c);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id, 'paciente_id', x.paciente_id, 'paciente_nome', x.nome, 'inicio', x.inicio, 'fim', x.fim,
             'modalidade', x.modalidade, 'status', x.status, 'recorrencia_id', x.recorrencia_id,
             'intervalo_semanas', x.intervalo_semanas, 'editavel_ate', privado.trava(x.inicio)
           ) order by x.inicio)
      from (
        select s.id, s.paciente_id, pa.nome, s.inicio, s.fim, s.modalidade, s.status, s.recorrencia_id,
               rc.intervalo_semanas
          from public.sessoes s
          join public.pacientes pa on pa.id = s.paciente_id
          left join public.recorrencias rc on rc.id = s.recorrencia_id
         where s.conta_id = c and pa.profissional_id = v_membro and s.status = 'realizada'
           and not exists (select 1 from public.observacoes o where o.sessao_id = s.id)
           and not exists (select 1 from public.adendos a where a.sessao_id = s.id)
         order by s.inicio
         limit 50
      ) x), '[]'::jsonb);
end;
$$;
