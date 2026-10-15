-- Fase 1 — pacientes, responsáveis, busca e agenda (pedidos 1, 8 e 9 do beta).
--
-- Toda leitura e escrita destas tabelas passa por RPC: nenhuma tem política
-- de RLS para o cliente, e as permissões diretas saem de anon e authenticated.
-- É o que garante que a queixa principal (dado clínico) só chega a quem é o
-- psicólogo do paciente, e que a leitura clínica fica registrada.
--
-- Regras que moram aqui, e só aqui:
--  - menor de idade sem responsável é recusado;
--  - duas sessões do mesmo profissional não se sobrepõem (constraint de exclusão);
--  - desmarcar com menos antecedência que configuracoes.aviso_minimo_horas é falta
--    (resposta dos psicólogos: falta sem aviso no prazo gasta sessão e é cobrada);
--  - presença e falta só se marcam depois do horário da sessão.

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- Minúsculas e sem acento: "João" e "joao" são a mesma busca.
create function public.sem_acento(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, '')));
$$;

-- ------------------------------------------------------------------ tabelas

create table public.pacientes (
  id                uuid primary key default gen_random_uuid(),
  conta_id          uuid not null references public.contas (id) on delete restrict,
  profissional_id   uuid not null references public.membros (id) on delete restrict,
  nome              text not null check (length(btrim(nome)) between 1 and 160),
  nascimento        date check (nascimento >= date '1900-01-01'),
  cpf               text check (cpf ~ '^[0-9]{11}$'),
  telefone          text check (length(telefone) <= 30),
  queixa_principal  text check (length(queixa_principal) <= 4000),
  valor_sessao      numeric(10, 2) check (valor_sessao >= 0 and valor_sessao < 100000),
  situacao          text not null default 'ativo' check (situacao in ('ativo', 'alta', 'arquivado')),
  consentimento_em  timestamptz not null,
  criado_em         timestamptz not null default now()
);
comment on column public.pacientes.queixa_principal is 'Dado clínico: só pode_clinico() lê, e a leitura é auditada.';
create index pacientes_conta_situacao on public.pacientes (conta_id, situacao);
create index pacientes_nome_busca on public.pacientes using gin (public.sem_acento(nome) extensions.gin_trgm_ops);

create table public.responsaveis (
  id           uuid primary key default gen_random_uuid(),
  paciente_id  uuid not null references public.pacientes (id) on delete restrict,
  nome         text not null check (length(btrim(nome)) between 1 and 160),
  parentesco   text check (length(parentesco) <= 40),
  telefone     text check (length(telefone) <= 30),
  cpf          text check (cpf ~ '^[0-9]{11}$'),
  financeiro   boolean not null default false,
  criado_em    timestamptz not null default now()
);
create index responsaveis_paciente on public.responsaveis (paciente_id);
create index responsaveis_nome_busca on public.responsaveis using gin (public.sem_acento(nome) extensions.gin_trgm_ops);

-- Repetição semanal. As sessões são geradas até `gerada_ate` e estendidas
-- quando a agenda é aberta mais à frente (privado.estender_recorrencias).
create table public.recorrencias (
  id               uuid primary key default gen_random_uuid(),
  conta_id         uuid not null references public.contas (id) on delete restrict,
  paciente_id      uuid not null references public.pacientes (id) on delete restrict,
  profissional_id  uuid not null references public.membros (id) on delete restrict,
  dia_semana       smallint not null check (dia_semana between 0 and 6), -- 0 = domingo
  hora             time not null,
  duracao_min      smallint not null check (duracao_min between 10 and 480),
  modalidade       text not null check (modalidade in ('presencial', 'online')),
  inicio           date not null,
  fim              date check (fim is null or fim >= inicio - 1),
  gerada_ate       date not null,
  criada_em        timestamptz not null default now()
);
create index recorrencias_conta on public.recorrencias (conta_id) where fim is null;

create table public.sessoes (
  id               uuid primary key default gen_random_uuid(),
  conta_id         uuid not null references public.contas (id) on delete restrict,
  paciente_id      uuid not null references public.pacientes (id) on delete restrict,
  profissional_id  uuid not null references public.membros (id) on delete restrict,
  recorrencia_id   uuid references public.recorrencias (id) on delete set null,
  inicio           timestamptz not null,
  fim              timestamptz not null,
  modalidade       text not null check (modalidade in ('presencial', 'online')),
  status           text not null default 'agendada'
                   check (status in ('agendada', 'confirmada', 'realizada', 'falta', 'cancelada')),
  desmarcada_em    timestamptz,
  criada_em        timestamptz not null default now(),
  alterada_em      timestamptz not null default now(),
  check (fim > inicio and fim - inicio <= interval '8 hours'),
  -- O profissional não atende duas sessões ao mesmo tempo. Desmarcada libera o horário.
  constraint sessoes_sem_choque exclude using gist (
    profissional_id extensions.gist_uuid_ops with =,
    tstzrange(inicio, fim) with &&
  ) where (status <> 'cancelada')
);
create unique index sessoes_recorrencia_inicio on public.sessoes (recorrencia_id, inicio) where recorrencia_id is not null;
create index sessoes_conta_inicio on public.sessoes (conta_id, inicio);
create index sessoes_paciente_inicio on public.sessoes (paciente_id, inicio);

alter table public.pacientes    enable row level security;
alter table public.responsaveis enable row level security;
alter table public.recorrencias enable row level security;
alter table public.sessoes      enable row level security;
-- Nenhuma política: o cliente não lê nem grava estas tabelas diretamente.
revoke all on public.pacientes, public.responsaveis, public.recorrencias, public.sessoes from anon, authenticated;

-- ------------------------------------------------------------ funções de apoio

-- É o psicólogo do paciente? Base de toda leitura e escrita clínica.
create function public.pode_clinico(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and public.aal_ok()
     and exists (
           select 1 from public.pacientes pa
             join public.membros m on m.id = pa.profissional_id
            where pa.id = p and m.user_id = auth.uid()
         );
$$;

create function privado.exigir_paciente(c uuid, p uuid) returns public.pacientes
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.pacientes;
begin
  select * into v from public.pacientes where id = p and conta_id = c;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

create function privado.conferir_menor(p uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (
       select 1 from public.pacientes pa
        where pa.id = p
          and pa.nascimento is not null
          and pa.nascimento > (now() at time zone 'America/Sao_Paulo')::date - interval '18 years'
          and not exists (select 1 from public.responsaveis r where r.paciente_id = pa.id)
     ) then
    raise exception 'menor_sem_responsavel' using errcode = 'P0001';
  end if;
end;
$$;

-- Hoje e instantes no fuso do consultório.
create function privado.hoje() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

create function privado.instante(d date, h time) returns timestamptz
language sql stable set search_path = '' as $$
  select (d + h) at time zone 'America/Sao_Paulo';
$$;

-- Gera as sessões de uma recorrência até `ate`. Ocorrência que bate em outra
-- sessão (ou já existe) é pulada em silêncio: a agenda mostra o choque como
-- dia sem a sessão, e o psicólogo remarca aquela semana.
create function privado.gerar_recorrencia(r uuid, ate date) returns void
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
  insert into public.sessoes (conta_id, paciente_id, profissional_id, recorrencia_id, inicio, fim, modalidade)
  select rc.conta_id, rc.paciente_id, rc.profissional_id, rc.id,
         privado.instante(d::date, rc.hora),
         privado.instante(d::date, rc.hora) + make_interval(mins => rc.duracao_min),
         rc.modalidade
    from generate_series(desde, limite, interval '7 days') d
  on conflict do nothing;
  update public.recorrencias set gerada_ate = limite where id = r and gerada_ate < limite;
end;
$$;

create function privado.estender_recorrencias(c uuid, ate date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r uuid;
begin
  for r in
    select id from public.recorrencias
     where conta_id = c and gerada_ate < ate and (fim is null or fim > gerada_ate)
  loop
    perform privado.gerar_recorrencia(r, ate);
  end loop;
end;
$$;

-- Horizonte mínimo das repetições: sempre há sessões geradas para as próximas 8 semanas.
create function privado.horizonte() returns date
language sql stable set search_path = '' as $$
  select privado.hoje() + 56;
$$;

revoke all on function privado.exigir_paciente(uuid, uuid), privado.conferir_menor(uuid), privado.hoje(),
  privado.instante(date, time), privado.gerar_recorrencia(uuid, date), privado.estender_recorrencias(uuid, date),
  privado.horizonte() from public;

-- ------------------------------------------------------------ pacientes

create function public.pacientes_listar(c uuid, busca text default null, filtro_situacao text default null)
returns table (
  id uuid, nome text, telefone text, nascimento date, situacao text,
  responsavel text, proxima_sessao timestamptz, ultima_sessao timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  termo text := nullif(public.sem_acento(btrim(busca)), '');
begin
  perform public.exigir_membro(c);
  return query
    select pa.id, pa.nome, pa.telefone, pa.nascimento, pa.situacao,
           (select r.nome from public.responsaveis r where r.paciente_id = pa.id
             order by r.financeiro desc, r.criado_em limit 1),
           (select min(s.inicio) from public.sessoes s
             where s.paciente_id = pa.id and s.inicio >= now() and s.status in ('agendada', 'confirmada')),
           (select max(s.inicio) from public.sessoes s
             where s.paciente_id = pa.id and s.inicio < now() and s.status in ('realizada', 'falta'))
      from public.pacientes pa
     where pa.conta_id = c
       and (filtro_situacao is null or pa.situacao = filtro_situacao)
       and (
             termo is null
          or public.sem_acento(pa.nome) like '%' || termo || '%'
          or extensions.word_similarity(termo, public.sem_acento(pa.nome)) >= 0.5
          or exists (
               select 1 from public.responsaveis r
                where r.paciente_id = pa.id
                  and (public.sem_acento(r.nome) like '%' || termo || '%'
                       or extensions.word_similarity(termo, public.sem_acento(r.nome)) >= 0.5)
             )
           )
     order by
       case when termo is null then 0
            else 1 - extensions.word_similarity(termo, public.sem_acento(pa.nome)) end,
       pa.nome
     limit 200;
end;
$$;

create function public.paciente_criar(c uuid, p jsonb, resps jsonb default '[]') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_membro uuid := public.exigir_membro(c);
  v_id uuid;
  r jsonb;
begin
  if coalesce((p ->> 'consentimento')::boolean, false) is not true then
    raise exception 'consentimento' using errcode = 'P0001';
  end if;
  insert into public.pacientes (conta_id, profissional_id, nome, nascimento, cpf, telefone,
                                queixa_principal, valor_sessao, consentimento_em)
  values (c, v_membro, btrim(p ->> 'nome'), (p ->> 'nascimento')::date, nullif(p ->> 'cpf', ''),
          nullif(p ->> 'telefone', ''), nullif(p ->> 'queixa_principal', ''),
          (p ->> 'valor_sessao')::numeric, now())
  returning id into v_id;
  for r in select * from jsonb_array_elements(coalesce(resps, '[]'::jsonb)) loop
    insert into public.responsaveis (paciente_id, nome, parentesco, telefone, cpf, financeiro)
    values (v_id, btrim(r ->> 'nome'), nullif(r ->> 'parentesco', ''), nullif(r ->> 'telefone', ''),
            nullif(r ->> 'cpf', ''), coalesce((r ->> 'financeiro')::boolean, false));
  end loop;
  perform privado.conferir_menor(v_id);
  perform privado.registrar('criar', 'pacientes', v_id, c, v_id);
  return v_id;
end;
$$;

-- A ficha. A queixa principal só vem para o psicólogo do paciente, e essa
-- leitura entra na auditoria — de dentro da função, não pelo Nest.
create function public.paciente_ler(c uuid, p uuid) returns jsonb
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
                                'duracao_min', rc.duracao_min, 'modalidade', rc.modalidade)
        from public.recorrencias rc
       where rc.paciente_id = p and (rc.fim is null or rc.fim >= privado.hoje())
       order by rc.criada_em desc limit 1),
    'contagem', jsonb_build_object(
      'realizadas', (select count(*) from public.sessoes s where s.paciente_id = p and s.status = 'realizada'),
      'faltas', (select count(*) from public.sessoes s where s.paciente_id = p and s.status = 'falta'),
      'canceladas', (select count(*) from public.sessoes s where s.paciente_id = p and s.status = 'cancelada')
    )
  );
end;
$$;

-- Grava só as chaves presentes em `campos`. Queixa principal exige ser o psicólogo do paciente.
create function public.paciente_gravar(c uuid, p uuid, campos jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  if campos ? 'queixa_principal' and not public.pode_clinico(p) then
    raise exception 'so_clinico' using errcode = 'P0001';
  end if;
  update public.pacientes set
    nome             = case when campos ? 'nome' then btrim(campos ->> 'nome') else nome end,
    nascimento       = case when campos ? 'nascimento' then (campos ->> 'nascimento')::date else nascimento end,
    cpf              = case when campos ? 'cpf' then nullif(campos ->> 'cpf', '') else cpf end,
    telefone         = case when campos ? 'telefone' then nullif(campos ->> 'telefone', '') else telefone end,
    queixa_principal = case when campos ? 'queixa_principal' then nullif(campos ->> 'queixa_principal', '')
                            else queixa_principal end,
    valor_sessao     = case when campos ? 'valor_sessao' then (campos ->> 'valor_sessao')::numeric else valor_sessao end
  where id = p;
  perform privado.conferir_menor(p);
  perform privado.registrar('editar', 'pacientes', p, c, p);
end;
$$;

-- Alta ou arquivo encerram a repetição e desmarcam as sessões futuras.
create function public.paciente_situacao(c uuid, p uuid, nova text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  if nova not in ('ativo', 'alta', 'arquivado') then
    raise exception 'transicao_invalida' using errcode = 'P0001';
  end if;
  update public.pacientes set situacao = nova where id = p;
  if nova <> 'ativo' then
    update public.recorrencias set fim = privado.hoje() - 1
     where paciente_id = p and (fim is null or fim >= privado.hoje());
    delete from public.sessoes
     where paciente_id = p and inicio > now() and status in ('agendada', 'confirmada') and recorrencia_id is not null;
    update public.sessoes set status = 'cancelada', desmarcada_em = now(), alterada_em = now()
     where paciente_id = p and inicio > now() and status in ('agendada', 'confirmada');
  end if;
  perform privado.registrar(case when nova = 'arquivado' then 'arquivar' else 'editar' end, 'pacientes', p, c, p);
end;
$$;

create function public.responsavel_salvar(c uuid, p uuid, r uuid, dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := r;
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  if v_id is null then
    insert into public.responsaveis (paciente_id, nome, parentesco, telefone, cpf, financeiro)
    values (p, btrim(dados ->> 'nome'), nullif(dados ->> 'parentesco', ''), nullif(dados ->> 'telefone', ''),
            nullif(dados ->> 'cpf', ''), coalesce((dados ->> 'financeiro')::boolean, false))
    returning id into v_id;
  else
    update public.responsaveis set
      nome       = case when dados ? 'nome' then btrim(dados ->> 'nome') else nome end,
      parentesco = case when dados ? 'parentesco' then nullif(dados ->> 'parentesco', '') else parentesco end,
      telefone   = case when dados ? 'telefone' then nullif(dados ->> 'telefone', '') else telefone end,
      cpf        = case when dados ? 'cpf' then nullif(dados ->> 'cpf', '') else cpf end,
      financeiro = case when dados ? 'financeiro' then (dados ->> 'financeiro')::boolean else financeiro end
    where id = v_id and paciente_id = p;
    if not found then
      raise exception 'nao_encontrado' using errcode = 'P0001';
    end if;
  end if;
  perform privado.registrar('editar', 'responsaveis', v_id, c, p);
  return v_id;
end;
$$;

create function public.responsavel_remover(c uuid, p uuid, r uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  delete from public.responsaveis where id = r and paciente_id = p;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0001';
  end if;
  perform privado.conferir_menor(p);
  perform privado.registrar('editar', 'responsaveis', r, c, p);
end;
$$;

-- ------------------------------------------------------------ agenda

-- Lê um período (até 62 dias) e, antes, estende as repetições até o fim dele.
create function public.agenda_listar(c uuid, de timestamptz, ate timestamptz)
returns table (
  id uuid, paciente_id uuid, paciente_nome text, inicio timestamptz, fim timestamptz,
  modalidade text, status text, recorrencia_id uuid
)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  if ate <= de or ate - de > interval '62 days' then
    raise exception 'periodo_invalido' using errcode = 'P0001';
  end if;
  perform privado.estender_recorrencias(c, greatest((ate at time zone 'America/Sao_Paulo')::date, privado.horizonte()));
  return query
    select s.id, s.paciente_id, pa.nome, s.inicio, s.fim, s.modalidade, s.status, s.recorrencia_id
      from public.sessoes s
      join public.pacientes pa on pa.id = s.paciente_id
     where s.conta_id = c and s.inicio < ate and s.fim > de
     order by s.inicio;
end;
$$;

-- Sessões de um paciente (aba Sessões da ficha), da mais recente para a mais antiga.
create function public.sessoes_do_paciente(c uuid, p uuid)
returns table (id uuid, inicio timestamptz, fim timestamptz, modalidade text, status text, recorrencia_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  perform privado.estender_recorrencias(c, privado.horizonte());
  return query
    select s.id, s.inicio, s.fim, s.modalidade, s.status, s.recorrencia_id
      from public.sessoes s
     where s.paciente_id = p
     order by s.inicio desc
     limit 500;
end;
$$;

-- Cria uma sessão, ou a primeira de uma repetição semanal e as próximas 8 semanas.
-- d: {paciente_id, inicio, duracao_min, modalidade, repetir_semanal}
create function public.sessao_criar(c uuid, d jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_membro uuid := public.exigir_membro(c);
  pa public.pacientes;
  v_inicio timestamptz := (d ->> 'inicio')::timestamptz;
  v_dur int := (d ->> 'duracao_min')::int;
  v_mod text := d ->> 'modalidade';
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
                                     modalidade, inicio, gerada_ate)
    values (c, pa.id, v_membro, extract(dow from v_local)::smallint, v_local::time, v_dur, v_mod,
            v_local::date, v_local::date)
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
-- encerra a repetição antiga a partir daqui e começa outra com a regra nova.
create function public.sessao_alterar(c uuid, s uuid, d jsonb, escopo text default 'esta') returns uuid
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
                                   modalidade, inicio, fim, gerada_ate)
  values (c, rc.paciente_id, rc.profissional_id, extract(dow from v_local)::smallint, v_local::time, v_dur, v_mod,
          v_local::date, rc.fim, v_local::date)
  returning id into v_rec;
  insert into public.sessoes (conta_id, paciente_id, profissional_id, recorrencia_id, inicio, fim, modalidade)
  values (c, rc.paciente_id, rc.profissional_id, v_rec, v_inicio, v_inicio + make_interval(mins => v_dur), v_mod)
  returning id into v_id;
  perform privado.gerar_recorrencia(v_rec, greatest(rc.gerada_ate, privado.horizonte()));
  perform privado.registrar('editar', 'recorrencias', v_rec, c, rc.paciente_id);
  return v_id;
end;
$$;

-- Confirmar, voltar para agendada, marcar presença ou falta. Desmarcar é sessao_desmarcar.
create function public.sessao_status(c uuid, s uuid, novo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ss public.sessoes;
begin
  perform public.exigir_membro(c);
  select * into ss from public.sessoes where id = s and conta_id = c for update;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0001';
  end if;
  if novo not in ('agendada', 'confirmada', 'realizada', 'falta') then
    raise exception 'transicao_invalida' using errcode = 'P0001';
  end if;
  if novo in ('realizada', 'falta') and ss.inicio > now() then
    raise exception 'sessao_futura' using errcode = 'P0001';
  end if;
  update public.sessoes
     set status = novo,
         desmarcada_em = case when novo in ('agendada', 'confirmada', 'realizada') then null else desmarcada_em end,
         alterada_em = now()
   where id = s;
  perform privado.registrar('editar', 'sessoes', s, c, ss.paciente_id);
end;
$$;

-- Desmarca. Com aviso dentro do prazo vira cancelada e libera o horário; com
-- menos antecedência vira falta (gasta sessão de pacote, é cobrada).
-- simular = true só responde o que aconteceria, para a tela avisar antes.
create function public.sessao_desmarcar(c uuid, s uuid, aviso_em timestamptz default now(), simular boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ss public.sessoes;
  prazo int;
  horas numeric;
  resultado text;
begin
  perform public.exigir_membro(c);
  select * into ss from public.sessoes where id = s and conta_id = c for update;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0001';
  end if;
  if ss.status not in ('agendada', 'confirmada') then
    raise exception 'sessao_encerrada' using errcode = 'P0001';
  end if;
  select cf.aviso_minimo_horas into prazo from public.configuracoes cf where cf.conta_id = c;
  horas := round((extract(epoch from ss.inicio - aviso_em) / 3600)::numeric, 1);
  resultado := case when horas >= prazo then 'cancelada' else 'falta' end;
  if not simular then
    update public.sessoes set status = resultado, desmarcada_em = aviso_em, alterada_em = now() where id = s;
    perform privado.registrar('editar', 'sessoes', s, c, ss.paciente_id);
  end if;
  return jsonb_build_object('resultado', resultado, 'horas_aviso', horas, 'prazo_horas', prazo);
end;
$$;

-- Encerra a repetição a partir desta sessão: ela e as próximas ainda não
-- acontecidas saem da agenda.
create function public.recorrencia_encerrar(c uuid, s uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  ss public.sessoes;
  n int;
begin
  perform public.exigir_membro(c);
  select * into ss from public.sessoes where id = s and conta_id = c;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0001';
  end if;
  if ss.recorrencia_id is null then
    raise exception 'sem_recorrencia' using errcode = 'P0001';
  end if;
  update public.recorrencias set fim = (ss.inicio at time zone 'America/Sao_Paulo')::date - 1 where id = ss.recorrencia_id;
  delete from public.sessoes
   where recorrencia_id = ss.recorrencia_id and inicio >= ss.inicio and status in ('agendada', 'confirmada');
  get diagnostics n = row_count;
  perform privado.registrar('editar', 'recorrencias', ss.recorrencia_id, c, ss.paciente_id);
  return n;
end;
$$;

-- O Início: sessões de hoje, contagens e quem está sem próxima sessão.
create function public.painel_inicio(c uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  hoje date;
begin
  perform public.exigir_membro(c);
  hoje := privado.hoje();
  perform privado.estender_recorrencias(c, privado.horizonte());
  return jsonb_build_object(
    'hoje', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'paciente_id', s.paciente_id, 'paciente_nome', pa.nome, 'inicio', s.inicio,
               'fim', s.fim, 'modalidade', s.modalidade, 'status', s.status) order by s.inicio)
        from public.sessoes s join public.pacientes pa on pa.id = s.paciente_id
       where s.conta_id = c and s.status <> 'cancelada'
         and s.inicio >= privado.instante(hoje, time '00:00')
         and s.inicio < privado.instante(hoje + 1, time '00:00')), '[]'::jsonb),
    'sessoes_semana', (
      select count(*) from public.sessoes s
       where s.conta_id = c and s.status <> 'cancelada'
         and s.inicio >= privado.instante(hoje - extract(dow from hoje)::int, time '00:00')
         and s.inicio < privado.instante(hoje - extract(dow from hoje)::int + 7, time '00:00')),
    'pacientes_ativos', (select count(*) from public.pacientes pa where pa.conta_id = c and pa.situacao = 'ativo'),
    'sem_proxima', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'ultima_sessao', x.ultima) order by x.ultima nulls first)
        from (
          select pa.id, pa.nome,
                 (select max(s.inicio) from public.sessoes s
                   where s.paciente_id = pa.id and s.inicio < now() and s.status in ('realizada', 'falta')) as ultima
            from public.pacientes pa
           where pa.conta_id = c and pa.situacao = 'ativo'
             and not exists (select 1 from public.sessoes s
                              where s.paciente_id = pa.id and s.inicio >= now()
                                and s.status in ('agendada', 'confirmada'))
           limit 20
        ) x), '[]'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------------ permissões

revoke execute on function
  public.sem_acento(text), public.pode_clinico(uuid),
  public.pacientes_listar(uuid, text, text), public.paciente_criar(uuid, jsonb, jsonb),
  public.paciente_ler(uuid, uuid), public.paciente_gravar(uuid, uuid, jsonb),
  public.paciente_situacao(uuid, uuid, text), public.responsavel_salvar(uuid, uuid, uuid, jsonb),
  public.responsavel_remover(uuid, uuid, uuid), public.agenda_listar(uuid, timestamptz, timestamptz),
  public.sessoes_do_paciente(uuid, uuid), public.sessao_criar(uuid, jsonb),
  public.sessao_alterar(uuid, uuid, jsonb, text), public.sessao_status(uuid, uuid, text),
  public.sessao_desmarcar(uuid, uuid, timestamptz, boolean), public.recorrencia_encerrar(uuid, uuid),
  public.painel_inicio(uuid)
from public, anon;

grant execute on function
  public.sem_acento(text), public.pode_clinico(uuid),
  public.pacientes_listar(uuid, text, text), public.paciente_criar(uuid, jsonb, jsonb),
  public.paciente_ler(uuid, uuid), public.paciente_gravar(uuid, uuid, jsonb),
  public.paciente_situacao(uuid, uuid, text), public.responsavel_salvar(uuid, uuid, uuid, jsonb),
  public.responsavel_remover(uuid, uuid, uuid), public.agenda_listar(uuid, timestamptz, timestamptz),
  public.sessoes_do_paciente(uuid, uuid), public.sessao_criar(uuid, jsonb),
  public.sessao_alterar(uuid, uuid, jsonb, text), public.sessao_status(uuid, uuid, text),
  public.sessao_desmarcar(uuid, uuid, timestamptz, boolean), public.recorrencia_encerrar(uuid, uuid),
  public.painel_inicio(uuid)
to authenticated;
