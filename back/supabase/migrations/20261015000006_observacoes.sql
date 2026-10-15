-- Fase 2 — registro dos atendimentos e histórico.
--
-- Uma observação por sessão realizada ou com falta. Só o psicólogo do paciente
-- lê e escreve, e toda leitura vai para a auditoria. A observação pode ser
-- corrigida por 30 dias depois da sessão (resposta dos psicólogos: "um mês"),
-- e cada correção guarda a versão anterior — pelo trigger, nunca pelo Nest.
-- Depois disso ela trava: o que faltou dizer entra como adendo, que não muda.
--
-- Nada aqui tem política nem permissão para o cliente: tudo passa pelas RPCs.

create table public.observacoes (
  sessao_id    uuid primary key references public.sessoes (id) on delete restrict,
  conta_id     uuid not null references public.contas (id) on delete restrict,
  paciente_id  uuid not null references public.pacientes (id) on delete restrict,
  texto        text not null check (length(btrim(texto)) between 1 and 20000),
  versao       integer not null default 1,
  autor        uuid not null,
  criada_em    timestamptz not null default now(),
  alterada_em  timestamptz not null default now()
);
comment on table public.observacoes is 'Dado clínico: só pode_clinico() lê ou grava, e a leitura é auditada.';
create index observacoes_paciente on public.observacoes (paciente_id);

create table public.observacoes_versoes (
  sessao_id   uuid not null references public.observacoes (sessao_id) on delete restrict,
  versao      integer not null,
  texto       text not null,
  autor       uuid not null,
  gravada_em  timestamptz not null,
  primary key (sessao_id, versao)
);

create table public.adendos (
  id           uuid primary key default gen_random_uuid(),
  sessao_id    uuid not null references public.sessoes (id) on delete restrict,
  conta_id     uuid not null references public.contas (id) on delete restrict,
  paciente_id  uuid not null references public.pacientes (id) on delete restrict,
  texto        text not null check (length(btrim(texto)) between 1 and 20000),
  autor        uuid not null,
  criado_em    timestamptz not null default now()
);
create index adendos_sessao on public.adendos (sessao_id, criado_em);

alter table public.observacoes         enable row level security;
alter table public.observacoes_versoes enable row level security;
alter table public.adendos             enable row level security;
revoke all on public.observacoes, public.observacoes_versoes, public.adendos from anon, authenticated;

-- A versão anterior vai para o histórico a cada mudança de texto.
create function privado.guardar_versao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.sessao_id := old.sessao_id;
  new.conta_id := old.conta_id;
  new.paciente_id := old.paciente_id;
  new.criada_em := old.criada_em;
  if new.texto is distinct from old.texto then
    insert into public.observacoes_versoes (sessao_id, versao, texto, autor, gravada_em)
    values (old.sessao_id, old.versao, old.texto, old.autor, old.alterada_em);
    new.versao := old.versao + 1;
    new.alterada_em := now();
  else
    new.versao := old.versao;
    new.alterada_em := old.alterada_em;
  end if;
  return new;
end;
$$;
create trigger observacoes_versao before update on public.observacoes
  for each row execute function privado.guardar_versao();

-- ------------------------------------------------------------ funções de apoio

-- Até quando a observação de uma sessão pode ser corrigida.
create function privado.trava(inicio timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select inicio + interval '30 days';
$$;

create function privado.exigir_sessao(c uuid, s uuid) returns public.sessoes
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.sessoes;
begin
  select * into v from public.sessoes where id = s and conta_id = c;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

revoke all on function privado.guardar_versao(), privado.trava(timestamptz), privado.exigir_sessao(uuid, uuid) from public;

-- ------------------------------------------------------------ observação

-- Lê a observação de uma sessão, com versões e adendos. Quem não é o psicólogo
-- do paciente recebe só `pode_clinico: false` — a janela da sessão é a mesma
-- para todos, e a tela decide o que mostrar sem tratar erro.
create function public.observacao_ler(c uuid, s uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ss public.sessoes;
  ob public.observacoes;
begin
  perform public.exigir_membro(c);
  ss := privado.exigir_sessao(c, s);
  if not public.pode_clinico(ss.paciente_id) then
    return jsonb_build_object('pode_clinico', false);
  end if;
  select * into ob from public.observacoes where sessao_id = s;
  if found or exists (select 1 from public.adendos a where a.sessao_id = s) then
    perform privado.registrar('ler', 'observacoes', s, c, ss.paciente_id);
  end if;
  return jsonb_build_object(
    'pode_clinico', true,
    'registravel', ss.status in ('realizada', 'falta'),
    'editavel', ss.status in ('realizada', 'falta') and now() < privado.trava(ss.inicio),
    'editavel_ate', privado.trava(ss.inicio),
    'texto', ob.texto,
    'versao', ob.versao,
    'alterada_em', ob.alterada_em,
    'versoes', coalesce((
      select jsonb_agg(jsonb_build_object('versao', v.versao, 'texto', v.texto, 'gravada_em', v.gravada_em)
                       order by v.versao desc)
        from public.observacoes_versoes v where v.sessao_id = s), '[]'::jsonb),
    'adendos', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'texto', a.texto, 'criado_em', a.criado_em) order by a.criado_em)
        from public.adendos a where a.sessao_id = s), '[]'::jsonb)
  );
end;
$$;

-- Cria ou corrige a observação. Texto igual ao gravado não gera versão.
create function public.observacao_gravar(c uuid, s uuid, texto text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ss public.sessoes;
  existia boolean;
begin
  perform public.exigir_membro(c);
  ss := privado.exigir_sessao(c, s);
  if not public.pode_clinico(ss.paciente_id) then
    raise exception 'so_clinico' using errcode = 'P0001';
  end if;
  if ss.status not in ('realizada', 'falta') then
    raise exception 'sessao_sem_registro' using errcode = 'P0001';
  end if;
  if now() >= privado.trava(ss.inicio) then
    raise exception 'observacao_travada' using errcode = 'P0001';
  end if;
  if texto is null or btrim(texto) = '' then
    raise exception 'observacao_vazia' using errcode = 'P0001';
  end if;
  existia := exists (select 1 from public.observacoes o where o.sessao_id = s);
  insert into public.observacoes (sessao_id, conta_id, paciente_id, texto, autor)
  values (s, c, ss.paciente_id, texto, auth.uid())
  on conflict (sessao_id) do update set texto = excluded.texto, autor = excluded.autor
   where public.observacoes.texto is distinct from excluded.texto;
  perform privado.registrar(case when existia then 'editar' else 'criar' end, 'observacoes', s, c, ss.paciente_id);
end;
$$;

-- Depois da trava, o que faltou dizer entra como adendo. Adendo não muda.
create function public.adendo_criar(c uuid, s uuid, texto text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  ss public.sessoes;
  v_id uuid;
begin
  perform public.exigir_membro(c);
  ss := privado.exigir_sessao(c, s);
  if not public.pode_clinico(ss.paciente_id) then
    raise exception 'so_clinico' using errcode = 'P0001';
  end if;
  if ss.status not in ('realizada', 'falta') then
    raise exception 'sessao_sem_registro' using errcode = 'P0001';
  end if;
  if now() < privado.trava(ss.inicio) then
    raise exception 'observacao_editavel' using errcode = 'P0001';
  end if;
  if texto is null or btrim(texto) = '' then
    raise exception 'observacao_vazia' using errcode = 'P0001';
  end if;
  insert into public.adendos (sessao_id, conta_id, paciente_id, texto, autor)
  values (s, c, ss.paciente_id, texto, auth.uid())
  returning id into v_id;
  perform privado.registrar('criar', 'adendos', v_id, c, ss.paciente_id);
  return v_id;
end;
$$;

-- ------------------------------------------------------------ histórico

-- Linha do tempo do paciente: tudo o que já aconteceu, da mais recente para a
-- mais antiga. O texto das observações só vem para o psicólogo do paciente.
create function public.historico_paciente(c uuid, p uuid) returns jsonb
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
             'recorrencia_id', x.recorrencia_id,
             'observacao', case when clinico then x.texto end,
             'alterada_em', case when clinico then x.alterada_em end,
             'versao', case when clinico then x.versao end,
             'adendos', case when clinico then x.adendos else 0 end,
             'editavel_ate', privado.trava(x.inicio)
           ) order by x.inicio desc)
      from (
        select s.id, s.inicio, s.fim, s.modalidade, s.status, s.recorrencia_id, o.texto, o.alterada_em, o.versao,
               (select count(*) from public.adendos a where a.sessao_id = s.id)::int as adendos
          from public.sessoes s
          left join public.observacoes o on o.sessao_id = s.id
         where s.paciente_id = p and s.inicio <= now()
         order by s.inicio desc
         limit 1000
      ) x), '[]'::jsonb);
end;
$$;

-- Sessões realizadas ainda sem observação nem adendo, dos pacientes de quem chama.
create function public.pendencias_observacao(c uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_membro uuid;
begin
  v_membro := public.exigir_membro(c);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id, 'paciente_id', x.paciente_id, 'paciente_nome', x.nome, 'inicio', x.inicio, 'fim', x.fim,
             'modalidade', x.modalidade, 'status', x.status, 'recorrencia_id', x.recorrencia_id,
             'editavel_ate', privado.trava(x.inicio)
           ) order by x.inicio)
      from (
        select s.id, s.paciente_id, pa.nome, s.inicio, s.fim, s.modalidade, s.status, s.recorrencia_id
          from public.sessoes s
          join public.pacientes pa on pa.id = s.paciente_id
         where s.conta_id = c and pa.profissional_id = v_membro and s.status = 'realizada'
           and not exists (select 1 from public.observacoes o where o.sessao_id = s.id)
           and not exists (select 1 from public.adendos a where a.sessao_id = s.id)
         order by s.inicio
         limit 50
      ) x), '[]'::jsonb);
end;
$$;

-- A ficha inteira para impressão: atende o pedido de acesso do paciente (LGPD)
-- e o de outro profissional ou da Justiça. Fica na auditoria como exportação.
create function public.ficha_clinica(c uuid, p uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ficha jsonb;
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  if not public.pode_clinico(p) then
    raise exception 'so_clinico' using errcode = 'P0001';
  end if;
  ficha := public.paciente_ler(c, p);
  perform privado.registrar('exportar', 'pacientes', p, c, p);
  return ficha || jsonb_build_object(
    'emitida_em', now(),
    'profissional', (
      select jsonb_build_object('nome', pr.nome, 'crp', pr.crp)
        from public.pacientes pa join public.profissionais pr on pr.membro_id = pa.profissional_id
       where pa.id = p),
    'sessoes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'inicio', s.inicio, 'fim', s.fim, 'modalidade', s.modalidade, 'status', s.status,
               'observacao', o.texto, 'alterada_em', o.alterada_em,
               'adendos', coalesce((
                 select jsonb_agg(jsonb_build_object('texto', a.texto, 'criado_em', a.criado_em) order by a.criado_em)
                   from public.adendos a where a.sessao_id = s.id), '[]'::jsonb)
             ) order by s.inicio)
        from public.sessoes s
        left join public.observacoes o on o.sessao_id = s.id
       where s.paciente_id = p and s.inicio <= now()), '[]'::jsonb)
  );
end;
$$;

-- Quem acessou a ficha e quando. Para o psicólogo do paciente e o titular da conta.
create function public.paciente_acessos(c uuid, p uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  if not (public.pode_clinico(p) or public.tem_papel(c, 'titular')) then
    raise exception 'so_clinico' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('em', x.em, 'acao', x.acao, 'tabela', x.tabela, 'quem', x.quem) order by x.em desc)
      from (
        select a.em, a.acao, a.tabela, coalesce(pr.nome, 'Membro da conta') as quem
          from public.auditoria a
          left join public.membros m on m.user_id = a.quem and m.conta_id = c
          left join public.profissionais pr on pr.membro_id = m.id
         where a.conta_id = c and a.paciente_id = p
         order by a.em desc
         limit 100
      ) x), '[]'::jsonb);
end;
$$;

-- ------------------------------------------------------------ permissões

revoke execute on function
  public.observacao_ler(uuid, uuid), public.observacao_gravar(uuid, uuid, text), public.adendo_criar(uuid, uuid, text),
  public.historico_paciente(uuid, uuid), public.pendencias_observacao(uuid), public.ficha_clinica(uuid, uuid),
  public.paciente_acessos(uuid, uuid)
from public, anon;

grant execute on function
  public.observacao_ler(uuid, uuid), public.observacao_gravar(uuid, uuid, text), public.adendo_criar(uuid, uuid, text),
  public.historico_paciente(uuid, uuid), public.pendencias_observacao(uuid), public.ficha_clinica(uuid, uuid),
  public.paciente_acessos(uuid, uuid)
to authenticated;
