-- Captação, no backoffice: os psicólogos que a equipe vai abordar, já abordou,
-- leva para a demonstração, põe no beta e fecha como assinante.
--
-- Como o resto do trabalho da equipe (migration equipe): tabelas próprias,
-- fora de qualquer consultório, sem política nenhuma, abertas só pelas
-- funções plataforma_* (exigir_super). É contato comercial de quem ainda não
-- é cliente; quando vira cliente, `conta_id` liga ao consultório.
--
-- O funil, na ordem:
--   a_abordar → abordado → conversando → reuniao_marcada → reuniao_feita
--   → beta (testando) → fechou (assinou)        e, de qualquer ponto, perdido.
--
-- Cada contato tem um histórico (captacao_eventos): criação, troca de etapa,
-- nota de conversa e reunião marcada entram sozinhos, com quem e quando. A
-- reunião é a da Agenda (equipe_reunioes.contato_id): marcar reunião com um
-- contato que ainda não chegou lá leva a etapa para reuniao_marcada.
--
-- `proximo_em` é o dia de retomar: o painel mostra quem passou do dia.

-- ------------------------------------------------------------------ tabelas

create table public.captacao_contatos (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null check (length(btrim(nome)) between 1 and 160),
  email             text check (length(email) <= 254),
  telefone          text check (length(telefone) <= 30),
  instagram         text check (length(instagram) <= 60),
  cidade            text check (length(cidade) <= 80),
  crp               text check (length(crp) <= 20),
  -- Atende sozinho ou numa clínica, e mais ou menos quantos pacientes por semana.
  perfil            text check (perfil in ('solo', 'clinica')),
  pacientes_semana  integer check (pacientes_semana between 0 and 500),
  atende_online     boolean,
  origem            text check (origem in ('instagram', 'indicacao', 'whatsapp', 'evento', 'linkedin', 'site', 'outro')),
  indicado_por      text check (length(indicado_por) <= 160),
  etapa             text not null default 'a_abordar' check (etapa in (
                      'a_abordar', 'abordado', 'conversando', 'reuniao_marcada', 'reuniao_feita', 'beta', 'fechou', 'perdido'
                    )),
  -- Desde quando está nesta etapa: o painel mostra quem parou.
  etapa_em          timestamptz not null default now(),
  proximo_passo     text check (length(proximo_passo) <= 300),
  proximo_em        date,
  motivo_perda      text check (length(motivo_perda) <= 300),
  responsavel       uuid references auth.users (id) on delete set null,
  conta_id          uuid references public.contas (id) on delete set null,
  notas             text check (length(notas) <= 4000),
  criado_por        uuid references auth.users (id) on delete set null,
  criado_em         timestamptz not null default now()
);
create index captacao_contatos_etapa on public.captacao_contatos (etapa);
create index captacao_contatos_proximo on public.captacao_contatos (proximo_em) where proximo_em is not null;

create table public.captacao_eventos (
  id          uuid primary key default gen_random_uuid(),
  contato_id  uuid not null references public.captacao_contatos (id) on delete cascade,
  tipo        text not null check (tipo in ('criado', 'etapa', 'nota', 'reuniao')),
  texto       text not null check (length(btrim(texto)) between 1 and 4000),
  quem        uuid references auth.users (id) on delete set null,
  -- clock_timestamp: dois eventos da mesma ação (reunião e etapa) ficam em ordem.
  em          timestamptz not null default clock_timestamp(),
  -- Desempate da ordem, para o histórico nunca embaralhar.
  seq         bigint generated always as identity
);
create index captacao_eventos_contato_em on public.captacao_eventos (contato_id, em desc, seq desc);

alter table public.equipe_reunioes
  add column contato_id uuid references public.captacao_contatos (id) on delete set null;
create index equipe_reunioes_contato on public.equipe_reunioes (contato_id) where contato_id is not null;

alter table public.captacao_contatos enable row level security;
alter table public.captacao_eventos  enable row level security;
-- Nenhuma política: ninguém lê pela API. Sem permissão de tabela, também.
revoke all on public.captacao_contatos, public.captacao_eventos from anon, authenticated;

-- ------------------------------------------------------------ regras comuns

create function privado.etapa_captacao(e text) returns text
language sql immutable set search_path = '' as $$
  select case e
    when 'a_abordar' then 'A abordar' when 'abordado' then 'Abordado' when 'conversando' then 'Conversando'
    when 'reuniao_marcada' then 'Reunião marcada' when 'reuniao_feita' then 'Reunião feita'
    when 'beta' then 'Em beta' when 'fechou' then 'Fechou' when 'perdido' then 'Perdido' end;
$$;

create function privado.registrar_captacao(c uuid, t text, txt text) returns void
language sql security definer set search_path = '' as $$
  insert into public.captacao_eventos (contato_id, tipo, texto, quem) values (c, t, txt, auth.uid());
$$;

-- Um contato, igual na lista e na ficha: os campos, mais a última atividade
-- do histórico e a próxima reunião marcada.
create function privado.contato_captacao(x uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id,
    'nome', c.nome,
    'email', c.email,
    'telefone', c.telefone,
    'instagram', c.instagram,
    'cidade', c.cidade,
    'crp', c.crp,
    'perfil', c.perfil,
    'pacientes_semana', c.pacientes_semana,
    'atende_online', c.atende_online,
    'origem', c.origem,
    'indicado_por', c.indicado_por,
    'etapa', c.etapa,
    'etapa_em', c.etapa_em,
    'proximo_passo', c.proximo_passo,
    'proximo_em', c.proximo_em,
    'motivo_perda', c.motivo_perda,
    'responsavel', c.responsavel,
    'conta_id', c.conta_id,
    'conta', (select ct.nome from public.contas ct where ct.id = c.conta_id),
    'notas', c.notas,
    'criado_em', c.criado_em,
    'ultima_atividade', (select max(e.em) from public.captacao_eventos e where e.contato_id = c.id),
    'proxima_reuniao', (
      select min(r.inicio) from public.equipe_reunioes r where r.contato_id = c.id and r.fim > now()
    )
  )
  from public.captacao_contatos c where c.id = x;
$$;

revoke all on function privado.etapa_captacao(text), privado.registrar_captacao(uuid, text, text),
  privado.contato_captacao(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ leitura

-- O funil inteiro, com o que o painel precisa: última atividade e próxima reunião.
create function public.plataforma_captacao() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  return coalesce((
    select jsonb_agg(privado.contato_captacao(x.id) order by x.criado_em desc)
      from public.captacao_contatos x
  ), '[]'::jsonb);
end;
$$;

-- A ficha: o contato, o histórico (mais recente primeiro) e as reuniões.
create function public.plataforma_captacao_ler(x uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  if not exists (select 1 from public.captacao_contatos where id = x) then
    raise exception 'contato_inexistente' using errcode = 'P0001';
  end if;
  return privado.contato_captacao(x) || jsonb_build_object(
    'eventos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'tipo', e.tipo,
               'texto', e.texto,
               'quem', (select u.email from auth.users u where u.id = e.quem),
               'em', e.em
             ) order by e.em desc, e.seq desc)
        from public.captacao_eventos e where e.contato_id = x
    ), '[]'::jsonb),
    'reunioes', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'titulo', r.titulo, 'inicio', r.inicio, 'fim', r.fim, 'local', r.local)
                       order by r.inicio desc)
        from public.equipe_reunioes r where r.contato_id = x
    ), '[]'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------------------ escrita

-- Sem `x`, cria; com `x`, grava só as chaves presentes em `p` (null limpa).
-- Trocar de etapa fica no histórico, e a data da etapa recomeça.
create function public.plataforma_captacao_gravar(x uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v     public.captacao_contatos;
  v_id  uuid;
begin
  perform public.exigir_super();
  if x is not null then
    select * into v from public.captacao_contatos where id = x for update;
    if not found then
      raise exception 'contato_inexistente' using errcode = 'P0001';
    end if;
  end if;
  if (x is null or p ? 'nome') and coalesce(btrim(p ->> 'nome'), '') = '' then
    raise exception 'contato_sem_nome' using errcode = 'P0001';
  end if;
  if p ? 'responsavel' then
    perform privado.conferir_responsavel((p ->> 'responsavel')::uuid);
  end if;
  if p ? 'conta_id' then
    perform privado.conferir_conta((p ->> 'conta_id')::uuid);
  end if;

  if x is null then
    insert into public.captacao_contatos (
      nome, email, telefone, instagram, cidade, crp, perfil, pacientes_semana, atende_online, origem, indicado_por,
      etapa, proximo_passo, proximo_em, motivo_perda, responsavel, conta_id, notas, criado_por
    ) values (
      btrim(p ->> 'nome'), nullif(btrim(lower(p ->> 'email')), ''), nullif(btrim(p ->> 'telefone'), ''),
      nullif(btrim(p ->> 'instagram'), ''), nullif(btrim(p ->> 'cidade'), ''), nullif(btrim(p ->> 'crp'), ''),
      p ->> 'perfil', (p ->> 'pacientes_semana')::integer, (p ->> 'atende_online')::boolean, p ->> 'origem',
      nullif(btrim(p ->> 'indicado_por'), ''), coalesce(p ->> 'etapa', 'a_abordar'),
      nullif(btrim(p ->> 'proximo_passo'), ''), (p ->> 'proximo_em')::date, nullif(btrim(p ->> 'motivo_perda'), ''),
      (p ->> 'responsavel')::uuid, (p ->> 'conta_id')::uuid, nullif(btrim(p ->> 'notas'), ''), auth.uid()
    ) returning id into v_id;
    perform privado.registrar_captacao(v_id, 'criado',
      'Contato criado em ' || privado.etapa_captacao(coalesce(p ->> 'etapa', 'a_abordar')) || '.');
    return v_id;
  end if;

  update public.captacao_contatos set
    nome             = case when p ? 'nome' then btrim(p ->> 'nome') else nome end,
    email            = case when p ? 'email' then nullif(btrim(lower(p ->> 'email')), '') else email end,
    telefone         = case when p ? 'telefone' then nullif(btrim(p ->> 'telefone'), '') else telefone end,
    instagram        = case when p ? 'instagram' then nullif(btrim(p ->> 'instagram'), '') else instagram end,
    cidade           = case when p ? 'cidade' then nullif(btrim(p ->> 'cidade'), '') else cidade end,
    crp              = case when p ? 'crp' then nullif(btrim(p ->> 'crp'), '') else crp end,
    perfil           = case when p ? 'perfil' then p ->> 'perfil' else perfil end,
    pacientes_semana = case when p ? 'pacientes_semana' then (p ->> 'pacientes_semana')::integer else pacientes_semana end,
    atende_online    = case when p ? 'atende_online' then (p ->> 'atende_online')::boolean else atende_online end,
    origem           = case when p ? 'origem' then p ->> 'origem' else origem end,
    indicado_por     = case when p ? 'indicado_por' then nullif(btrim(p ->> 'indicado_por'), '') else indicado_por end,
    etapa            = case when p ? 'etapa' then p ->> 'etapa' else etapa end,
    etapa_em         = case when p ? 'etapa' and p ->> 'etapa' is distinct from etapa then now() else etapa_em end,
    proximo_passo    = case when p ? 'proximo_passo' then nullif(btrim(p ->> 'proximo_passo'), '') else proximo_passo end,
    proximo_em       = case when p ? 'proximo_em' then (p ->> 'proximo_em')::date else proximo_em end,
    motivo_perda     = case when p ? 'motivo_perda' then nullif(btrim(p ->> 'motivo_perda'), '') else motivo_perda end,
    responsavel      = case when p ? 'responsavel' then (p ->> 'responsavel')::uuid else responsavel end,
    conta_id         = case when p ? 'conta_id' then (p ->> 'conta_id')::uuid else conta_id end,
    notas            = case when p ? 'notas' then nullif(btrim(p ->> 'notas'), '') else notas end
  where id = x;

  if p ? 'etapa' and p ->> 'etapa' is distinct from v.etapa then
    perform privado.registrar_captacao(x, 'etapa',
      privado.etapa_captacao(v.etapa) || ' → ' || privado.etapa_captacao(p ->> 'etapa')
      || coalesce(': ' || nullif(btrim(p ->> 'motivo_perda'), ''), '') || '.');
  end if;
  return x;
end;
$$;

-- Nota de conversa: o que se falou, para quem pegar o contato depois.
create function public.plataforma_captacao_nota(x uuid, texto text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  if not exists (select 1 from public.captacao_contatos where id = x) then
    raise exception 'contato_inexistente' using errcode = 'P0001';
  end if;
  if coalesce(btrim(texto), '') = '' then
    raise exception 'nota_vazia' using errcode = 'P0001';
  end if;
  perform privado.registrar_captacao(x, 'nota', btrim(texto));
end;
$$;

-- O histórico vai junto; a reunião fica na Agenda, sem o contato.
create function public.plataforma_captacao_excluir(x uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  delete from public.captacao_contatos where id = x;
  if not found then
    raise exception 'contato_inexistente' using errcode = 'P0001';
  end if;
  perform privado.registrar('excluir', 'captacao_contatos', x, null);
end;
$$;

-- ------------------------------------------------------------ agenda: reunião com contato

create or replace function public.plataforma_reunioes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id,
             'titulo', r.titulo,
             'inicio', r.inicio,
             'fim', r.fim,
             'local', r.local,
             'pauta', r.pauta,
             'notas', r.notas,
             'conta_id', r.conta_id,
             'conta', ct.nome,
             'contato_id', r.contato_id,
             'contato', cc.nome,
             'tarefas', coalesce((
               select jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.titulo, 'estado', t.estado)
                                order by t.estado, t.ordem)
                 from public.equipe_tarefas t where t.reuniao_id = r.id
             ), '[]'::jsonb)
           ) order by r.inicio)
      from public.equipe_reunioes r
      left join public.contas ct on ct.id = r.conta_id
      left join public.captacao_contatos cc on cc.id = r.contato_id
     where r.fim > now() - interval '90 days'
  ), '[]'::jsonb);
end;
$$;

-- Como antes, mais `contato_id`. Reunião nova com um contato que ainda não
-- chegou lá leva a etapa para reuniao_marcada; as duas coisas ficam no histórico.
create or replace function public.plataforma_reuniao_gravar(r uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v       public.equipe_reunioes;
  v_id    uuid;
  v_ct    public.captacao_contatos;
begin
  perform public.exigir_super();
  if r is not null then
    select * into v from public.equipe_reunioes where id = r for update;
    if not found then
      raise exception 'reuniao_inexistente' using errcode = 'P0001';
    end if;
  end if;
  v.titulo := case when p ? 'titulo' then btrim(p ->> 'titulo') else v.titulo end;
  v.inicio := case when p ? 'inicio' then (p ->> 'inicio')::timestamptz else v.inicio end;
  v.fim    := case when p ? 'fim' then (p ->> 'fim')::timestamptz else v.fim end;
  if coalesce(v.titulo, '') = '' then
    raise exception 'titulo_obrigatorio' using errcode = 'P0001';
  end if;
  if v.inicio is null or v.fim is null or v.fim <= v.inicio or v.fim > v.inicio + interval '12 hours' then
    raise exception 'horario_invalido' using errcode = 'P0001';
  end if;
  if p ? 'conta_id' then
    perform privado.conferir_conta((p ->> 'conta_id')::uuid);
  end if;
  if p ? 'contato_id' and p ->> 'contato_id' is not null then
    select * into v_ct from public.captacao_contatos where id = (p ->> 'contato_id')::uuid for update;
    if not found then
      raise exception 'contato_inexistente' using errcode = 'P0001';
    end if;
  end if;

  if r is null then
    insert into public.equipe_reunioes (titulo, inicio, fim, local, pauta, notas, conta_id, contato_id, criada_por)
    values (v.titulo, v.inicio, v.fim, nullif(btrim(p ->> 'local'), ''), nullif(btrim(p ->> 'pauta'), ''),
            nullif(btrim(p ->> 'notas'), ''), (p ->> 'conta_id')::uuid, (p ->> 'contato_id')::uuid, auth.uid())
    returning id into v_id;
    perform privado.registrar('criar', 'equipe_reunioes', v_id, null);
  else
    update public.equipe_reunioes set
      titulo     = v.titulo,
      inicio     = v.inicio,
      fim        = v.fim,
      local      = case when p ? 'local' then nullif(btrim(p ->> 'local'), '') else local end,
      pauta      = case when p ? 'pauta' then nullif(btrim(p ->> 'pauta'), '') else pauta end,
      notas      = case when p ? 'notas' then nullif(btrim(p ->> 'notas'), '') else notas end,
      conta_id   = case when p ? 'conta_id' then (p ->> 'conta_id')::uuid else conta_id end,
      contato_id = case when p ? 'contato_id' then (p ->> 'contato_id')::uuid else contato_id end
    where id = r;
    perform privado.registrar('editar', 'equipe_reunioes', r, null);
    v_id := r;
  end if;

  -- Reunião que passa a ser com este contato: entra no histórico dele.
  if v_ct.id is not null and v_ct.id is distinct from v.contato_id then
    perform privado.registrar_captacao(v_ct.id, 'reuniao',
      'Reunião marcada: ' || v.titulo || ', ' || to_char(v.inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || '.');
    if v_ct.etapa in ('a_abordar', 'abordado', 'conversando') then
      update public.captacao_contatos set etapa = 'reuniao_marcada', etapa_em = now() where id = v_ct.id;
      perform privado.registrar_captacao(v_ct.id, 'etapa',
        privado.etapa_captacao(v_ct.etapa) || ' → ' || privado.etapa_captacao('reuniao_marcada') || '.');
    end if;
  end if;
  return v_id;
end;
$$;

grant execute on function
  public.plataforma_captacao(), public.plataforma_captacao_ler(uuid), public.plataforma_captacao_gravar(uuid, jsonb),
  public.plataforma_captacao_nota(uuid, text), public.plataforma_captacao_excluir(uuid)
to authenticated;
