-- Fase 4 — recibos (Receita Saúde) e relatórios.
--
-- O recibo oficial do psicólogo pessoa física é emitido no Receita Saúde (app
-- ou e-CAC); a Receita não oferece API de emissão. O PSI faz o resto: separa
-- todo pagamento ainda sem recibo, monta os dados na ordem dos campos e, depois
-- de emitido lá, registra aqui o número e a data, ligados às cobranças.
-- Pagador é o responsável marcado como "paga as sessões"; sem ele, o paciente.
-- Os dados de quem pagou e de quem foi atendido ficam copiados no recibo: mudar
-- o cadastro depois não reescreve um documento já emitido.

create table public.recibos (
  id                 uuid primary key default gen_random_uuid(),
  conta_id           uuid not null references public.contas (id) on delete restrict,
  paciente_id        uuid not null references public.pacientes (id) on delete restrict,
  numero             text not null check (length(btrim(numero)) between 1 and 60),
  emitido_em         date not null,
  valor              numeric(10, 2) not null check (valor >= 0),
  pagador_nome       text not null,
  pagador_cpf        text,
  beneficiario_nome  text not null,
  beneficiario_cpf   text,
  criado_em          timestamptz not null default now(),
  cancelado_em       timestamptz,
  cancelado_motivo   text check (length(cancelado_motivo) <= 300)
);
create unique index recibos_numero on public.recibos (conta_id, btrim(numero)) where cancelado_em is null;
create index recibos_conta_emitido on public.recibos (conta_id, emitido_em desc);

create table public.recibo_cobrancas (
  recibo_id    uuid not null references public.recibos (id) on delete restrict,
  cobranca_id  uuid not null references public.cobrancas (id) on delete restrict,
  primary key (recibo_id, cobranca_id)
);
create index recibo_cobrancas_cobranca on public.recibo_cobrancas (cobranca_id);

alter table public.recibos          enable row level security;
alter table public.recibo_cobrancas enable row level security;
revoke all on public.recibos, public.recibo_cobrancas from anon, authenticated;

-- A cobrança já está num recibo que vale (não cancelado)?
create function privado.tem_recibo(cb uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.recibo_cobrancas rc join public.recibos r on r.id = rc.recibo_id
                  where rc.cobranca_id = cb and r.cancelado_em is null);
$$;

-- Quem paga: o responsável marcado como financeiro; sem ele, o próprio paciente.
create function privado.pagador(p uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('nome', r.nome, 'cpf', r.cpf, 'responsavel', true)
       from public.responsaveis r where r.paciente_id = p and r.financeiro order by r.criado_em limit 1),
    (select jsonb_build_object('nome', pa.nome, 'cpf', pa.cpf, 'responsavel', false)
       from public.pacientes pa where pa.id = p));
$$;

revoke all on function privado.tem_recibo(uuid), privado.pagador(uuid) from public;

-- ------------------------------------------------------------ recibos

-- O que falta emitir: toda cobrança paga sem recibo, com os dados do recibo prontos.
create function public.recibos_fila(c uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', cb.id, 'origem', cb.origem, 'valor', cb.valor, 'paga_em', cb.paga_em, 'forma', cb.forma,
             'sessao_inicio', s.inicio, 'pacote_quantidade', pc.quantidade, 'referencia', cb.referencia,
             'paciente', jsonb_build_object('id', pa.id, 'nome', pa.nome, 'cpf', pa.cpf),
             'pagador', privado.pagador(pa.id)
           ) order by cb.paga_em, pa.nome)
      from public.cobrancas cb
      join public.pacientes pa on pa.id = cb.paciente_id
      left join public.sessoes s on s.id = cb.sessao_id
      left join public.pacotes pc on pc.id = cb.pacote_id
     where cb.conta_id = c and cb.situacao = 'paga' and not privado.tem_recibo(cb.id)), '[]'::jsonb);
end;
$$;

-- Registra o recibo emitido no Receita Saúde, para uma ou mais cobranças pagas do mesmo paciente.
-- d: {cobrancas: [uuid], numero, emitido_em}
create function public.recibo_registrar(c uuid, d jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  ids uuid[];
  v_paciente uuid;
  v_total numeric;
  v_emitido date := (d ->> 'emitido_em')::date;
  v_pagador jsonb;
  pa public.pacientes;
  v_id uuid;
begin
  perform public.exigir_membro(c);
  select array_agg(distinct x::uuid) into ids from jsonb_array_elements_text(coalesce(d -> 'cobrancas', '[]'::jsonb)) x;
  if ids is null then
    raise exception 'recibo_sem_cobranca' using errcode = 'P0001';
  end if;
  if coalesce(btrim(d ->> 'numero'), '') = '' then
    raise exception 'recibo_sem_numero' using errcode = 'P0001';
  end if;
  if v_emitido is null or v_emitido > privado.hoje() then
    raise exception 'recibo_data_invalida' using errcode = 'P0001';
  end if;
  perform 1 from public.cobrancas cb where cb.id = any (ids) for update;
  if (select count(*) from public.cobrancas cb
       where cb.id = any (ids) and cb.conta_id = c and cb.situacao = 'paga') <> cardinality(ids) then
    raise exception 'recibo_cobranca_invalida' using errcode = 'P0001';
  end if;
  if (select count(distinct cb.paciente_id) from public.cobrancas cb where cb.id = any (ids)) > 1 then
    raise exception 'recibo_pacientes_diferentes' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(ids) i where privado.tem_recibo(i)) then
    raise exception 'cobranca_com_recibo' using errcode = 'P0001';
  end if;
  select min(cb.paciente_id::text)::uuid, sum(cb.valor) into v_paciente, v_total from public.cobrancas cb where cb.id = any (ids);
  select * into pa from public.pacientes where id = v_paciente;
  v_pagador := privado.pagador(v_paciente);
  insert into public.recibos (conta_id, paciente_id, numero, emitido_em, valor, pagador_nome, pagador_cpf,
                              beneficiario_nome, beneficiario_cpf)
  values (c, v_paciente, btrim(d ->> 'numero'), v_emitido, v_total, v_pagador ->> 'nome', v_pagador ->> 'cpf',
          pa.nome, pa.cpf)
  returning id into v_id;
  insert into public.recibo_cobrancas (recibo_id, cobranca_id) select v_id, unnest(ids);
  perform privado.registrar('criar', 'recibos', v_id, c, v_paciente);
  return v_id;
end;
$$;

-- Cancela o registro (recibo cancelado também no Receita Saúde, ou número digitado errado).
-- As cobranças voltam para a fila; o registro fica, com o motivo.
create function public.recibo_cancelar(c uuid, r uuid, motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.recibos;
begin
  perform public.exigir_membro(c);
  select * into v from public.recibos where id = r and conta_id = c for update;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0001';
  end if;
  if v.cancelado_em is not null then
    raise exception 'recibo_cancelado' using errcode = 'P0001';
  end if;
  if motivo is null or btrim(motivo) = '' then
    raise exception 'motivo_obrigatorio' using errcode = 'P0001';
  end if;
  update public.recibos set cancelado_em = now(), cancelado_motivo = btrim(recibo_cancelar.motivo) where id = r;
  perform privado.registrar('editar', 'recibos', r, c, v.paciente_id);
end;
$$;

-- filtro: {de, ate (emissão), paciente_id}
create function public.recibos_listar(c uuid, filtro jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'paciente_id', r.paciente_id, 'numero', r.numero, 'emitido_em', r.emitido_em, 'valor', r.valor,
             'pagador_nome', r.pagador_nome, 'pagador_cpf', r.pagador_cpf,
             'beneficiario_nome', r.beneficiario_nome, 'beneficiario_cpf', r.beneficiario_cpf,
             'cancelado_em', r.cancelado_em, 'cancelado_motivo', r.cancelado_motivo,
             'cobrancas', (select count(*) from public.recibo_cobrancas rc where rc.recibo_id = r.id)
           ) order by r.emitido_em desc, r.criado_em desc)
      from public.recibos r
     where r.conta_id = c
       and (filtro ->> 'paciente_id' is null or r.paciente_id = (filtro ->> 'paciente_id')::uuid)
       and (filtro ->> 'de' is null or r.emitido_em >= (filtro ->> 'de')::date)
       and (filtro ->> 'ate' is null or r.emitido_em <= (filtro ->> 'ate')::date)), '[]'::jsonb);
end;
$$;

-- ------------------------------------------------------------ relatório

-- Um mês (o primeiro dia dele) e os 12 meses até ele. Sessões contam pelo dia
-- em que aconteceram; recebido, pelo dia do pagamento; a receber, pelo vencimento.
create function public.relatorio_mensal(c uuid, mes date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_de date := date_trunc('month', mes)::date;
  v_ate date := (date_trunc('month', mes) + interval '1 month')::date;  -- exclusivo
  v_ini timestamptz := privado.instante(v_de, time '00:00');
  v_fim timestamptz := privado.instante(v_ate, time '00:00');
begin
  perform public.exigir_membro(c);
  perform privado.gerar_mensalidades(c);
  return jsonb_build_object(
    'mes', v_de,
    'realizadas', (select count(*) from public.sessoes s
                    where s.conta_id = c and s.status = 'realizada' and s.inicio >= v_ini and s.inicio < v_fim),
    'faltas', (select count(*) from public.sessoes s
                where s.conta_id = c and s.status = 'falta' and s.inicio >= v_ini and s.inicio < v_fim),
    'desmarcadas', (select count(*) from public.sessoes s
                     where s.conta_id = c and s.status = 'cancelada' and s.inicio >= v_ini and s.inicio < v_fim),
    'online', (select count(*) from public.sessoes s
                where s.conta_id = c and s.status = 'realizada' and s.modalidade = 'online' and s.inicio >= v_ini and s.inicio < v_fim),
    'pacientes_atendidos', (select count(distinct s.paciente_id) from public.sessoes s
                             where s.conta_id = c and s.status = 'realizada' and s.inicio >= v_ini and s.inicio < v_fim),
    'pacientes_novos', (select count(*) from public.pacientes pa
                         where pa.conta_id = c and pa.criado_em >= v_ini and pa.criado_em < v_fim),
    'recebido', coalesce((select sum(cb.valor) from public.cobrancas cb
                           where cb.conta_id = c and cb.situacao = 'paga' and cb.paga_em >= v_de and cb.paga_em < v_ate), 0),
    'a_receber', coalesce((select sum(cb.valor) from public.cobrancas cb
                            where cb.conta_id = c and cb.situacao = 'pendente' and cb.vencimento >= v_de and cb.vencimento < v_ate), 0),
    'por_mes', (
      select jsonb_agg(jsonb_build_object(
               'mes', m.mes,
               'realizadas', (select count(*) from public.sessoes s
                               where s.conta_id = c and s.status = 'realizada'
                                 and s.inicio >= privado.instante(m.mes, time '00:00')
                                 and s.inicio < privado.instante((m.mes + interval '1 month')::date, time '00:00')),
               'faltas', (select count(*) from public.sessoes s
                           where s.conta_id = c and s.status = 'falta'
                             and s.inicio >= privado.instante(m.mes, time '00:00')
                             and s.inicio < privado.instante((m.mes + interval '1 month')::date, time '00:00')),
               'recebido', coalesce((select sum(cb.valor) from public.cobrancas cb
                                      where cb.conta_id = c and cb.situacao = 'paga'
                                        and cb.paga_em >= m.mes and cb.paga_em < (m.mes + interval '1 month')::date), 0)
             ) order by m.mes)
        from (select generate_series(v_de - interval '11 months', v_de, interval '1 month')::date as mes) m)
  );
end;
$$;

-- ------------------------------------------------------------ permissões

revoke execute on function
  public.recibos_fila(uuid), public.recibo_registrar(uuid, jsonb), public.recibo_cancelar(uuid, uuid, text),
  public.recibos_listar(uuid, jsonb), public.relatorio_mensal(uuid, date)
from public, anon;

grant execute on function
  public.recibos_fila(uuid), public.recibo_registrar(uuid, jsonb), public.recibo_cancelar(uuid, uuid, text),
  public.recibos_listar(uuid, jsonb), public.relatorio_mensal(uuid, date)
to authenticated;

-- ------------------------------------------------------------ funções que mudam

-- Desfazer pagamento já com recibo emitido: primeiro cancela o recibo.
create or replace function public.cobranca_desfazer(c uuid, cb uuid, motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.cobrancas;
begin
  perform public.exigir_membro(c);
  v := privado.exigir_cobranca(c, cb);
  if v.situacao <> 'paga' then
    raise exception 'cobranca_nao_paga' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.recibo_cobrancas rc join public.recibos r on r.id = rc.recibo_id
              where rc.cobranca_id = cb and r.cancelado_em is null) then
    raise exception 'cobranca_com_recibo' using errcode = 'P0001';
  end if;
  if motivo is null or btrim(motivo) = '' then
    raise exception 'motivo_obrigatorio' using errcode = 'P0001';
  end if;
  update public.cobrancas set situacao = 'pendente', forma = null, paga_em = null, motivo = btrim(cobranca_desfazer.motivo)
   where id = cb;
  perform privado.registrar('editar', 'cobrancas', cb, c, v.paciente_id);
end;
$$;

-- O painel conta os pagamentos ainda sem recibo.
create or replace function public.painel_financeiro(c uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  hoje date;
begin
  perform public.exigir_membro(c);
  perform privado.gerar_mensalidades(c);
  hoje := privado.hoje();
  return jsonb_build_object(
    'a_receber', coalesce((select sum(cb.valor) from public.cobrancas cb where cb.conta_id = c and cb.situacao = 'pendente'), 0),
    'vencidas', (select count(*) from public.cobrancas cb
                  where cb.conta_id = c and cb.situacao = 'pendente' and cb.vencimento < hoje),
    'valor_vencido', coalesce((select sum(cb.valor) from public.cobrancas cb
                                where cb.conta_id = c and cb.situacao = 'pendente' and cb.vencimento < hoje), 0),
    'sem_recibo', (select count(*) from public.cobrancas cb
                    where cb.conta_id = c and cb.situacao = 'paga' and not privado.tem_recibo(cb.id)),
    'recebido_mes', coalesce((select sum(cb.valor) from public.cobrancas cb
                               where cb.conta_id = c and cb.situacao = 'paga'
                                 and cb.paga_em >= date_trunc('month', hoje)::date), 0),
    -- pacote do paciente ativo acabando: soma do saldo de todos os pacotes dele até 1
    'pacotes_acabando', coalesce((
      select jsonb_agg(jsonb_build_object('paciente_id', x.id, 'paciente_nome', x.nome, 'restantes', x.restantes)
                       order by x.restantes, x.nome)
        from (
          select pa.id, pa.nome, sum(ps.restantes)::int as restantes
            from public.pacientes pa join privado.pacote_saldo ps on ps.paciente_id = pa.id
           where pa.conta_id = c and pa.situacao = 'ativo'
           group by pa.id, pa.nome
          having sum(ps.restantes) <= 1
        ) x), '[]'::jsonb)
  );
end;
$$;
