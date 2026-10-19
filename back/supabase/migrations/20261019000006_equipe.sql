-- O trabalho da equipe da plataforma, no backoffice: tarefas (quadro),
-- agenda (reuniões, com a pauta montada pelas tarefas ligadas a cada uma) e
-- conteúdo (o cronograma do que o Senda publica).
--
-- Fica fora de qualquer consultório. O DIME guardava isto num "espaço
-- interno" igual ao dos clientes; aqui um consultório tem agenda de
-- atendimento e prontuário, e misturar o trabalho da equipe nele seria pôr
-- reunião interna ao lado de sessão de paciente. Tabelas próprias, sem
-- política nenhuma: só as funções plataforma_* leem e gravam, e toda função
-- abre com exigir_super().
--
-- Uma tabela por coisa, desde o início (lição do DIME: no documento único,
-- cada arrasto de cartão fazia alguém perder o trabalho). Mover um cartão
-- grava só a linha dele, e a ordem é calculada aqui, não no navegador.
--
-- Responsável é sempre alguém da equipe (super_admins). Consultório ligado a
-- uma tarefa ou reunião é só o vínculo com o cliente, sem dado clínico.

-- ------------------------------------------------------------------ tabelas

create table public.equipe_reunioes (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null check (length(btrim(titulo)) between 1 and 160),
  inicio      timestamptz not null,
  fim         timestamptz not null,
  -- Link da chamada ou endereço.
  local       text check (length(local) <= 300),
  pauta       text check (length(pauta) <= 4000),
  -- O que se decidiu: a ata.
  notas       text check (length(notas) <= 20000),
  conta_id    uuid references public.contas (id) on delete set null,
  criada_por  uuid references auth.users (id) on delete set null,
  criada_em   timestamptz not null default now(),
  check (fim > inicio and fim <= inicio + interval '12 hours')
);
create index equipe_reunioes_inicio on public.equipe_reunioes (inicio);

create table public.equipe_tarefas (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null check (length(btrim(titulo)) between 1 and 200),
  descricao     text check (length(descricao) <= 4000),
  estado        text not null default 'a_fazer' check (estado in ('a_fazer', 'fazendo', 'feito')),
  -- Posição na coluna. Entre dois cartões vai a média dos dois: mover não renumera a coluna.
  ordem         double precision not null default 0,
  responsavel   uuid references auth.users (id) on delete set null,
  prazo         date,
  conta_id      uuid references public.contas (id) on delete set null,
  -- Tarefa ligada a uma reunião entra na pauta dela.
  reuniao_id    uuid references public.equipe_reunioes (id) on delete set null,
  criada_por    uuid references auth.users (id) on delete set null,
  criada_em     timestamptz not null default now(),
  concluida_em  timestamptz
);
create index equipe_tarefas_quadro on public.equipe_tarefas (estado, ordem);
create index equipe_tarefas_reuniao on public.equipe_tarefas (reuniao_id) where reuniao_id is not null;

create table public.equipe_conteudos (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null check (length(btrim(titulo)) between 1 and 200),
  canal        text not null default 'instagram'
                 check (canal in ('instagram', 'blog', 'email', 'video', 'novidade', 'outro')),
  etapa        text not null default 'ideia'
                 check (etapa in ('ideia', 'producao', 'revisao', 'agendado', 'publicado')),
  publicar_em  date,
  responsavel  uuid references auth.users (id) on delete set null,
  link         text check (link ~ '^https?://' and length(link) <= 500),
  notas        text check (length(notas) <= 4000),
  criada_por   uuid references auth.users (id) on delete set null,
  criada_em    timestamptz not null default now()
);
create index equipe_conteudos_data on public.equipe_conteudos (publicar_em);

alter table public.equipe_reunioes  enable row level security;
alter table public.equipe_tarefas   enable row level security;
alter table public.equipe_conteudos enable row level security;
-- Nenhuma política: ninguém lê pela API. Sem permissão de tabela, também.
revoke all on public.equipe_reunioes, public.equipe_tarefas, public.equipe_conteudos from anon, authenticated;

-- ------------------------------------------------------------ regras comuns

-- Responsável vazio vale (sem dono); preenchido, tem de ser da equipe.
create function privado.conferir_responsavel(u uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if u is not null and not exists (select 1 from public.super_admins s where s.user_id = u) then
    raise exception 'responsavel_invalido' using errcode = 'P0001';
  end if;
end;
$$;

create function privado.conferir_conta(c uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if c is not null and not exists (select 1 from public.contas where id = c) then
    raise exception 'conta_inexistente' using errcode = 'P0001';
  end if;
end;
$$;

-- O fim da coluna: o cartão novo, ou que chega de outra coluna, vai para baixo.
create function privado.fim_da_coluna(e text) returns double precision
language sql stable security definer set search_path = '' as $$
  select coalesce(max(t.ordem), 0) + 1 from public.equipe_tarefas t where t.estado = e;
$$;

revoke all on function privado.conferir_responsavel(uuid), privado.conferir_conta(uuid),
  privado.fim_da_coluna(text) from public, anon, authenticated;

-- ------------------------------------------------------------------ equipe

-- Quem pode ser responsável: a equipe da plataforma.
create function public.plataforma_equipe() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email) order by lower(u.email))
      from public.super_admins s join auth.users u on u.id = s.user_id
  ), '[]'::jsonb);
end;
$$;

-- ------------------------------------------------------------------ tarefas

-- O quadro inteiro. Do "feito", só o que foi concluído nos últimos 30 dias:
-- o quadro mostra o trabalho, não o arquivo.
create function public.plataforma_tarefas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id,
             'titulo', t.titulo,
             'descricao', t.descricao,
             'estado', t.estado,
             'responsavel', t.responsavel,
             'prazo', t.prazo,
             'conta_id', t.conta_id,
             'conta', ct.nome,
             'reuniao_id', t.reuniao_id,
             'reuniao', r.titulo,
             'criada_em', t.criada_em,
             'concluida_em', t.concluida_em
           ) order by t.estado, t.ordem)
      from public.equipe_tarefas t
      left join public.contas ct on ct.id = t.conta_id
      left join public.equipe_reunioes r on r.id = t.reuniao_id
     where t.estado <> 'feito' or t.concluida_em > now() - interval '30 days'
  ), '[]'::jsonb);
end;
$$;

-- Sem `t`, cria (no fim da coluna); com `t`, grava só as chaves presentes em
-- `p`. Mudar de coluna por aqui também leva o cartão para o fim dela.
create function public.plataforma_tarefa_gravar(t uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v       public.equipe_tarefas;
  v_id    uuid;
begin
  perform public.exigir_super();
  if t is null then
    if coalesce(btrim(p ->> 'titulo'), '') = '' then
      raise exception 'titulo_obrigatorio' using errcode = 'P0001';
    end if;
    v.estado := coalesce(p ->> 'estado', 'a_fazer');
  else
    select * into v from public.equipe_tarefas where id = t for update;
    if not found then
      raise exception 'tarefa_inexistente' using errcode = 'P0001';
    end if;
    if p ? 'titulo' and coalesce(btrim(p ->> 'titulo'), '') = '' then
      raise exception 'titulo_obrigatorio' using errcode = 'P0001';
    end if;
  end if;
  if p ? 'responsavel' then
    perform privado.conferir_responsavel((p ->> 'responsavel')::uuid);
  end if;
  if p ? 'conta_id' then
    perform privado.conferir_conta((p ->> 'conta_id')::uuid);
  end if;
  if p ? 'reuniao_id' and p ->> 'reuniao_id' is not null
     and not exists (select 1 from public.equipe_reunioes where id = (p ->> 'reuniao_id')::uuid) then
    raise exception 'reuniao_inexistente' using errcode = 'P0001';
  end if;

  if t is null then
    insert into public.equipe_tarefas (titulo, descricao, estado, ordem, responsavel, prazo, conta_id, reuniao_id,
                                       criada_por, concluida_em)
    values (btrim(p ->> 'titulo'), nullif(btrim(p ->> 'descricao'), ''), v.estado, privado.fim_da_coluna(v.estado),
            (p ->> 'responsavel')::uuid, (p ->> 'prazo')::date, (p ->> 'conta_id')::uuid, (p ->> 'reuniao_id')::uuid,
            auth.uid(), case when v.estado = 'feito' then now() end)
    returning id into v_id;
    perform privado.registrar('criar', 'equipe_tarefas', v_id, null);
    return v_id;
  end if;

  update public.equipe_tarefas set
    titulo       = case when p ? 'titulo' then btrim(p ->> 'titulo') else titulo end,
    descricao    = case when p ? 'descricao' then nullif(btrim(p ->> 'descricao'), '') else descricao end,
    responsavel  = case when p ? 'responsavel' then (p ->> 'responsavel')::uuid else responsavel end,
    prazo        = case when p ? 'prazo' then (p ->> 'prazo')::date else prazo end,
    conta_id     = case when p ? 'conta_id' then (p ->> 'conta_id')::uuid else conta_id end,
    reuniao_id   = case when p ? 'reuniao_id' then (p ->> 'reuniao_id')::uuid else reuniao_id end
  where id = t;
  if p ? 'estado' and p ->> 'estado' is distinct from v.estado then
    perform public.plataforma_tarefa_mover(t, p ->> 'estado', null);
  else
    perform privado.registrar('editar', 'equipe_tarefas', t, null);
  end if;
  return t;
end;
$$;

-- Arrastar: põe `t` na coluna `e`, logo antes de `antes` (sem `antes`, no
-- fim). Grava só a linha que se moveu.
create function public.plataforma_tarefa_mover(t uuid, e text, antes uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ordem  double precision;
  v_prev   double precision;
begin
  perform public.exigir_super();
  if e is null or e not in ('a_fazer', 'fazendo', 'feito') then
    raise exception 'estado_invalido' using errcode = 'P0001';
  end if;
  perform 1 from public.equipe_tarefas where id = t for update;
  if not found then
    raise exception 'tarefa_inexistente' using errcode = 'P0001';
  end if;

  if antes is null or antes = t then
    v_ordem := (select coalesce(max(x.ordem), 0) + 1 from public.equipe_tarefas x where x.estado = e and x.id <> t);
  else
    select x.ordem into v_ordem from public.equipe_tarefas x where x.id = antes and x.estado = e;
    if not found then
      raise exception 'tarefa_inexistente' using errcode = 'P0001';
    end if;
    select max(x.ordem) into v_prev from public.equipe_tarefas x
     where x.estado = e and x.ordem < v_ordem and x.id <> t;
    v_ordem := case when v_prev is null then v_ordem - 1 else (v_prev + v_ordem) / 2 end;
  end if;

  update public.equipe_tarefas set
    concluida_em = case when e = 'feito' then coalesce(case when estado = 'feito' then concluida_em end, now()) end,
    estado = e,
    ordem = v_ordem
  where id = t;
  perform privado.registrar('editar', 'equipe_tarefas', t, null);
end;
$$;

create function public.plataforma_tarefa_excluir(t uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  delete from public.equipe_tarefas where id = t;
  if not found then
    raise exception 'tarefa_inexistente' using errcode = 'P0001';
  end if;
  perform privado.registrar('excluir', 'equipe_tarefas', t, null);
end;
$$;

-- ------------------------------------------------------------------ agenda

-- As reuniões dos últimos 90 dias em diante, cada uma com a pauta: as
-- tarefas ligadas a ela, na ordem do quadro.
create function public.plataforma_reunioes() returns jsonb
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
             'tarefas', coalesce((
               select jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.titulo, 'estado', t.estado)
                                order by t.estado, t.ordem)
                 from public.equipe_tarefas t where t.reuniao_id = r.id
             ), '[]'::jsonb)
           ) order by r.inicio)
      from public.equipe_reunioes r
      left join public.contas ct on ct.id = r.conta_id
     where r.fim > now() - interval '90 days'
  ), '[]'::jsonb);
end;
$$;

create function public.plataforma_reuniao_gravar(r uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v     public.equipe_reunioes;
  v_id  uuid;
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

  if r is null then
    insert into public.equipe_reunioes (titulo, inicio, fim, local, pauta, notas, conta_id, criada_por)
    values (v.titulo, v.inicio, v.fim, nullif(btrim(p ->> 'local'), ''), nullif(btrim(p ->> 'pauta'), ''),
            nullif(btrim(p ->> 'notas'), ''), (p ->> 'conta_id')::uuid, auth.uid())
    returning id into v_id;
    perform privado.registrar('criar', 'equipe_reunioes', v_id, null);
    return v_id;
  end if;

  update public.equipe_reunioes set
    titulo   = v.titulo,
    inicio   = v.inicio,
    fim      = v.fim,
    local    = case when p ? 'local' then nullif(btrim(p ->> 'local'), '') else local end,
    pauta    = case when p ? 'pauta' then nullif(btrim(p ->> 'pauta'), '') else pauta end,
    notas    = case when p ? 'notas' then nullif(btrim(p ->> 'notas'), '') else notas end,
    conta_id = case when p ? 'conta_id' then (p ->> 'conta_id')::uuid else conta_id end
  where id = r;
  perform privado.registrar('editar', 'equipe_reunioes', r, null);
  return r;
end;
$$;

-- As tarefas da pauta continuam no quadro, só sem a reunião.
create function public.plataforma_reuniao_excluir(r uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  delete from public.equipe_reunioes where id = r;
  if not found then
    raise exception 'reuniao_inexistente' using errcode = 'P0001';
  end if;
  perform privado.registrar('excluir', 'equipe_reunioes', r, null);
end;
$$;

-- ------------------------------------------------------------------ conteúdo

create function public.plataforma_conteudos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id,
             'titulo', x.titulo,
             'canal', x.canal,
             'etapa', x.etapa,
             'publicar_em', x.publicar_em,
             'responsavel', x.responsavel,
             'link', x.link,
             'notas', x.notas,
             'criada_em', x.criada_em
           ) order by x.publicar_em nulls last, x.criada_em)
      from public.equipe_conteudos x
  ), '[]'::jsonb);
end;
$$;

-- Agendado e publicado têm data: é o que põe a peça no cronograma.
create function public.plataforma_conteudo_gravar(x uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v     public.equipe_conteudos;
  v_id  uuid;
begin
  perform public.exigir_super();
  if x is not null then
    select * into v from public.equipe_conteudos where id = x for update;
    if not found then
      raise exception 'conteudo_inexistente' using errcode = 'P0001';
    end if;
  end if;
  v.titulo      := case when p ? 'titulo' then btrim(p ->> 'titulo') else v.titulo end;
  v.etapa       := case when p ? 'etapa' then p ->> 'etapa' else coalesce(v.etapa, 'ideia') end;
  v.publicar_em := case when p ? 'publicar_em' then (p ->> 'publicar_em')::date else v.publicar_em end;
  if coalesce(v.titulo, '') = '' then
    raise exception 'titulo_obrigatorio' using errcode = 'P0001';
  end if;
  if v.etapa in ('agendado', 'publicado') and v.publicar_em is null then
    raise exception 'data_obrigatoria' using errcode = 'P0001';
  end if;
  if p ? 'responsavel' then
    perform privado.conferir_responsavel((p ->> 'responsavel')::uuid);
  end if;

  if x is null then
    insert into public.equipe_conteudos (titulo, canal, etapa, publicar_em, responsavel, link, notas, criada_por)
    values (v.titulo, coalesce(p ->> 'canal', 'instagram'), v.etapa, v.publicar_em, (p ->> 'responsavel')::uuid,
            nullif(btrim(p ->> 'link'), ''), nullif(btrim(p ->> 'notas'), ''), auth.uid())
    returning id into v_id;
    perform privado.registrar('criar', 'equipe_conteudos', v_id, null);
    return v_id;
  end if;

  update public.equipe_conteudos set
    titulo      = v.titulo,
    etapa       = v.etapa,
    publicar_em = v.publicar_em,
    canal       = case when p ? 'canal' then p ->> 'canal' else canal end,
    responsavel = case when p ? 'responsavel' then (p ->> 'responsavel')::uuid else responsavel end,
    link        = case when p ? 'link' then nullif(btrim(p ->> 'link'), '') else link end,
    notas       = case when p ? 'notas' then nullif(btrim(p ->> 'notas'), '') else notas end
  where id = x;
  perform privado.registrar('editar', 'equipe_conteudos', x, null);
  return x;
end;
$$;

create function public.plataforma_conteudo_excluir(x uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  delete from public.equipe_conteudos where id = x;
  if not found then
    raise exception 'conteudo_inexistente' using errcode = 'P0001';
  end if;
  perform privado.registrar('excluir', 'equipe_conteudos', x, null);
end;
$$;

-- ------------------------------------------------------------ permissões

grant execute on function
  public.plataforma_equipe(),
  public.plataforma_tarefas(), public.plataforma_tarefa_gravar(uuid, jsonb),
  public.plataforma_tarefa_mover(uuid, text, uuid), public.plataforma_tarefa_excluir(uuid),
  public.plataforma_reunioes(), public.plataforma_reuniao_gravar(uuid, jsonb), public.plataforma_reuniao_excluir(uuid),
  public.plataforma_conteudos(), public.plataforma_conteudo_gravar(uuid, jsonb), public.plataforma_conteudo_excluir(uuid)
to authenticated;
