-- Plataforma: o que o backoffice (repositório senda-backoffice) lê e grava.
--
-- O recorte é o do PLANO.md, seção 04: o super-admin opera consultórios,
-- logins e assinaturas, e nunca ganha acesso clínico por estar em
-- super_admins. Nenhuma função daqui lê paciente, sessão, observação,
-- anamnese, pacote, cobrança ou recibo — nem para contar.
--
-- O backoffice tem API própria, mas o banco é este, e a regra de acesso mora
-- aqui, como no resto do Senda: toda função abre com exigir_super(). O Nest
-- do backoffice não confere papel nenhum (lição do DIME: regra em dois
-- lugares é a que diverge calada).
--
-- Contratado e recebido são tabelas diferentes: a assinatura diz o plano,
-- os pagamentos dizem o que entrou. Sem a segunda, "em dia" quer dizer só
-- "alguém marcou em dia".

-- ------------------------------------------------------------------ tabelas

create table public.assinaturas (
  conta_id        uuid primary key references public.contas (id) on delete restrict,
  plano           text not null default 'beta' check (plano in ('beta', 'mensal', 'anual')),
  valor_mensal    numeric(10, 2) not null default 0 check (valor_mensal >= 0 and valor_mensal < 100000),
  -- Até 28: todo mês tem o dia.
  dia_vencimento  integer not null default 10 check (dia_vencimento between 1 and 28),
  situacao        text not null default 'teste' check (situacao in ('teste', 'ativa', 'suspensa', 'cancelada')),
  inicio          date not null default current_date,
  observacao      text check (length(observacao) <= 500),
  alterada_em     timestamptz not null default now()
);
comment on table public.assinaturas is 'O que cada consultório contratou da plataforma. Só o backoffice lê e grava.';

create table public.assinatura_pagamentos (
  id              uuid primary key default gen_random_uuid(),
  conta_id        uuid not null references public.contas (id) on delete restrict,
  -- Mês de competência, sempre o dia 1: um pagamento quita um mês.
  referencia      date not null check (extract(day from referencia) = 1),
  valor           numeric(10, 2) not null check (valor > 0 and valor < 100000),
  pago_em         date not null,
  forma           text not null check (forma in ('pix', 'boleto', 'cartao', 'transferencia', 'outro')),
  registrado_por  uuid not null,
  registrado_em   timestamptz not null default now()
);
create index assinatura_pagamentos_conta_ref on public.assinatura_pagamentos (conta_id, referencia desc);
comment on table public.assinatura_pagamentos is 'O que entrou de cada consultório. Lançado à mão no backoffice.';

alter table public.assinaturas           enable row level security;
alter table public.assinatura_pagamentos enable row level security;
-- Sem política: ninguém lê pela API, nem o titular. Só as funções abaixo.
revoke all on public.assinaturas, public.assinatura_pagamentos from anon, authenticated;

-- Todo consultório que já existe nasce em teste, no plano do beta.
insert into public.assinaturas (conta_id, inicio)
  select c.id, (c.criada_em at time zone 'America/Sao_Paulo')::date from public.contas c;

-- --------------------------------------------------------------- porta

-- Levanta a chave certa em vez de devolver vazio, como exigir_membro.
create function public.exigir_super() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sem_acesso' using errcode = 'P0001';
  end if;
  if not public.aal_ok() then
    raise exception 'segundo_fator' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.super_admins s where s.user_id = auth.uid()) then
    raise exception 'so_super' using errcode = 'P0001';
  end if;
end;
$$;

-- Quem está chamando: o backoffice decide a porta da tela por aqui.
-- Não levanta so_super: responde false, para a tela dizer "este login não opera a plataforma".
create function public.plataforma_eu() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sem_acesso' using errcode = 'P0001';
  end if;
  if not public.aal_ok() then
    raise exception 'segundo_fator' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'id', auth.uid(),
    'email', (select u.email from auth.users u where u.id = auth.uid()),
    'super', exists (select 1 from public.super_admins s where s.user_id = auth.uid())
  );
end;
$$;

-- ------------------------------------------------- regra de "pede atenção"

-- privado.hoje() (20261015000001) é o dia em São Paulo: o mês vira à meia-noite daqui.

-- Meses já vencidos e sem pagamento de uma assinatura ativa. É a única conta
-- de "em atraso": a tela desenha, não decide.
create function privado.meses_em_aberto(c uuid) returns date[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.mes order by m.mes), '{}')
    from public.assinaturas a,
         -- timestamp sem fuso: com date puro o Postgres escolhe timestamptz e o mês depende do fuso da sessão.
         lateral (
           select g::date as mes
             from generate_series(
                    date_trunc('month', a.inicio::timestamp),
                    date_trunc('month', privado.hoje()::timestamp),
                    interval '1 month'
                  ) as g
         ) m
   where a.conta_id = c
     and a.situacao = 'ativa'
     and a.valor_mensal > 0
     -- o mês corrente só conta depois do vencimento
     and (m.mes < date_trunc('month', privado.hoje())::date
          or extract(day from privado.hoje()) > a.dia_vencimento)
     and not exists (
           select 1 from public.assinatura_pagamentos p
            where p.conta_id = c and p.referencia = m.mes
         );
$$;

-- Uma linha por consultório, igual na lista, na ficha e na visão geral.
-- Só dado de conta, login e assinatura.
create function privado.resumo_conta(c uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with base as (
    select ct.id, ct.nome, ct.criada_em,
           a.conta_id is not null as tem_assinatura,
           a.plano, a.valor_mensal, a.dia_vencimento, a.situacao, a.inicio,
           (select count(*) from public.membros m where m.conta_id = ct.id) as acessos,
           (select max(u.last_sign_in_at)
              from public.membros m join auth.users u on u.id = m.user_id
             where m.conta_id = ct.id) as ultimo_acesso,
           (select jsonb_build_object('nome', p.nome, 'email', u.email)
              from public.membros m
              join auth.users u on u.id = m.user_id
              left join public.profissionais p on p.membro_id = m.id
             where m.conta_id = ct.id and 'titular' = any (m.papeis)
             order by m.criado_em
             limit 1) as titular,
           privado.meses_em_aberto(ct.id) as em_aberto,
           exists (
             select 1 from public.assinatura_pagamentos p
              where p.conta_id = ct.id and p.referencia = date_trunc('month', privado.hoje())::date
           ) as pago_mes
      from public.contas ct
      left join public.assinaturas a on a.conta_id = ct.id
     where ct.id = c
  )
  select jsonb_build_object(
    'id', b.id,
    'nome', b.nome,
    'criada_em', b.criada_em,
    'titular', b.titular,
    'acessos', b.acessos,
    'ultimo_acesso', b.ultimo_acesso,
    'assinatura', case when b.tem_assinatura then jsonb_build_object(
      'plano', b.plano,
      'valor_mensal', b.valor_mensal,
      'dia_vencimento', b.dia_vencimento,
      'situacao', b.situacao,
      'inicio', b.inicio
    ) end,
    'pago_mes', b.pago_mes,
    'meses_em_aberto', cardinality(b.em_aberto),
    'valor_em_aberto', cardinality(b.em_aberto) * coalesce(b.valor_mensal, 0),
    -- Em ordem de gravidade. Lista vazia é consultório que não pede nada.
    'pendencias', to_jsonb(array_remove(array[
      case when not b.tem_assinatura then 'sem_assinatura' end,
      case when cardinality(b.em_aberto) > 0 then 'em_atraso' end,
      case when b.situacao = 'suspensa' then 'suspensa' end,
      case when b.acessos = 0 then 'sem_acesso' end,
      case when b.acessos > 0 and b.ultimo_acesso is null then 'nunca_entrou' end,
      case when b.ultimo_acesso < now() - interval '30 days' then 'parado' end
    ], null))
  )
  from base b;
$$;

revoke all on function privado.meses_em_aberto(uuid), privado.resumo_conta(uuid)
  from public, anon, authenticated;

-- ------------------------------------------------------------------ leitura

create function public.plataforma_clientes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  return coalesce(
    (select jsonb_agg(privado.resumo_conta(c.id) order by lower(c.nome)) from public.contas c),
    '[]'::jsonb
  );
end;
$$;

-- Números do alto da visão geral. Os cartões por consultório saem de plataforma_clientes.
create function public.plataforma_visao_geral() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_mes date := date_trunc('month', privado.hoje())::date;
begin
  perform public.exigir_super();
  return jsonb_build_object(
    'consultorios', (select count(*) from public.contas),
    'acessos', (select count(*) from public.membros),
    'ativas', (select count(*) from public.assinaturas where situacao = 'ativa'),
    'em_teste', (select count(*) from public.assinaturas where situacao = 'teste'),
    'contratado_mes', (select coalesce(sum(valor_mensal), 0) from public.assinaturas where situacao = 'ativa'),
    'recebido_mes', (select coalesce(sum(valor), 0) from public.assinatura_pagamentos where referencia = v_mes),
    'a_receber', (
      select coalesce(sum(cardinality(privado.meses_em_aberto(a.conta_id)) * a.valor_mensal), 0)
        from public.assinaturas a where a.situacao = 'ativa'
    ),
    'entraram_7d', (
      select count(distinct m.user_id)
        from public.membros m join auth.users u on u.id = m.user_id
       where u.last_sign_in_at > now() - interval '7 days'
    ),
    'mes', v_mes
  );
end;
$$;

create function public.plataforma_cliente(c uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  if not exists (select 1 from public.contas where id = c) then
    raise exception 'conta_inexistente' using errcode = 'P0001';
  end if;
  return privado.resumo_conta(c) || jsonb_build_object(
    'observacao', (select a.observacao from public.assinaturas a where a.conta_id = c),
    'membros', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', u.id,
               'email', u.email,
               'nome', p.nome,
               'papeis', to_jsonb(m.papeis),
               'criado_em', m.criado_em,
               'ultimo_acesso', u.last_sign_in_at,
               'desativado', coalesce(u.banned_until > now(), false),
               'segundo_fator', exists (
                 select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'
               )
             ) order by m.criado_em)
        from public.membros m
        join auth.users u on u.id = m.user_id
        left join public.profissionais p on p.membro_id = m.id
       where m.conta_id = c
    ), '[]'::jsonb),
    'pagamentos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pg.id,
               'referencia', pg.referencia,
               'valor', pg.valor,
               'pago_em', pg.pago_em,
               'forma', pg.forma,
               'registrado_em', pg.registrado_em
             ) order by pg.referencia desc, pg.registrado_em desc)
        from public.assinatura_pagamentos pg
       where pg.conta_id = c
    ), '[]'::jsonb)
  );
end;
$$;

-- Logins, independente de consultório. Os sem consultório vêm primeiro:
-- login criado e não ligado é o erro que todo mundo comete uma vez.
create function public.plataforma_logins() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  return coalesce((
    select jsonb_agg(l.linha order by l.sem_conta desc, lower(l.email))
      from (
        select u.email,
               not exists (select 1 from public.membros m where m.user_id = u.id) as sem_conta,
               jsonb_build_object(
                 'id', u.id,
                 'email', u.email,
                 'criado_em', u.created_at,
                 'ultimo_acesso', u.last_sign_in_at,
                 'confirmado', u.email_confirmed_at is not null,
                 'desativado', coalesce(u.banned_until > now(), false),
                 'segundo_fator', exists (
                   select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'
                 ),
                 'super', exists (select 1 from public.super_admins s where s.user_id = u.id),
                 'contas', coalesce((
                   select jsonb_agg(jsonb_build_object('id', ct.id, 'nome', ct.nome, 'papeis', to_jsonb(m.papeis))
                                    order by lower(ct.nome))
                     from public.membros m join public.contas ct on ct.id = m.conta_id
                    where m.user_id = u.id
                 ), '[]'::jsonb)
               ) as linha
          from auth.users u
      ) l
  ), '[]'::jsonb);
end;
$$;

-- --------------------------------------------------------------- escrita

-- Consultório novo para um login que já existe (o login nasce pela função
-- admin-contas). Conta, titular, perfil, configurações e assinatura numa
-- transação só: ou nasce tudo, ou nada.
create function public.plataforma_cliente_criar(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p ->> 'email'));
  v_user  uuid;
  v_conta uuid;
  v_a     jsonb := coalesce(p -> 'assinatura', '{}'::jsonb);
begin
  perform public.exigir_super();
  if coalesce(btrim(p ->> 'conta'), '') = '' or coalesce(btrim(p ->> 'nome'), '') = '' then
    raise exception 'cliente_incompleto' using errcode = 'P0001';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = v_email;
  if v_user is null then
    raise exception 'email_sem_login' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.membros m where m.user_id = v_user and 'titular' = any (m.papeis)) then
    raise exception 'login_ja_titular' using errcode = 'P0001';
  end if;

  v_conta := public.conta_criar(v_email, p ->> 'conta', p ->> 'nome');
  insert into public.assinaturas (conta_id, plano, valor_mensal, dia_vencimento, situacao, inicio)
  values (
    v_conta,
    coalesce(v_a ->> 'plano', 'beta'),
    coalesce((v_a ->> 'valor_mensal')::numeric, 0),
    coalesce((v_a ->> 'dia_vencimento')::integer, 10),
    coalesce(v_a ->> 'situacao', 'teste'),
    coalesce((v_a ->> 'inicio')::date, privado.hoje())
  );
  perform privado.registrar('criar', 'contas', v_conta, v_conta);
  return v_conta;
end;
$$;

create function public.plataforma_conta_renomear(c uuid, p_nome text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  update public.contas set nome = btrim(p_nome) where id = c;
  if not found then
    raise exception 'conta_inexistente' using errcode = 'P0001';
  end if;
  perform privado.registrar('editar', 'contas', c, c);
end;
$$;

-- Campo a campo, como perfil_gravar: chave ausente não mexe no campo.
-- Consultório sem assinatura (criado pelo editor SQL) ganha uma aqui.
create function public.plataforma_assinatura_gravar(c uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  if not exists (select 1 from public.contas where id = c) then
    raise exception 'conta_inexistente' using errcode = 'P0001';
  end if;
  insert into public.assinaturas (conta_id) values (c) on conflict (conta_id) do nothing;
  update public.assinaturas set
    plano          = case when p ? 'plano' then p ->> 'plano' else plano end,
    valor_mensal   = case when p ? 'valor_mensal' then (p ->> 'valor_mensal')::numeric else valor_mensal end,
    dia_vencimento = case when p ? 'dia_vencimento' then (p ->> 'dia_vencimento')::integer else dia_vencimento end,
    situacao       = case when p ? 'situacao' then p ->> 'situacao' else situacao end,
    inicio         = case when p ? 'inicio' then (p ->> 'inicio')::date else inicio end,
    observacao     = case when p ? 'observacao' then nullif(btrim(p ->> 'observacao'), '') else observacao end,
    alterada_em    = now()
  where conta_id = c;
  perform privado.registrar('editar', 'assinaturas', c, c);
end;
$$;

create function public.plataforma_pagamento_lancar(c uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id  uuid;
  v_ref date := date_trunc('month', (p ->> 'referencia')::date)::date;
begin
  perform public.exigir_super();
  if not exists (select 1 from public.contas where id = c) then
    raise exception 'conta_inexistente' using errcode = 'P0001';
  end if;
  if (p ->> 'pago_em')::date > privado.hoje() then
    raise exception 'pagamento_futuro' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.assinatura_pagamentos where conta_id = c and referencia = v_ref) then
    raise exception 'mes_ja_pago' using errcode = 'P0001';
  end if;
  insert into public.assinatura_pagamentos (conta_id, referencia, valor, pago_em, forma, registrado_por)
  values (c, v_ref, (p ->> 'valor')::numeric, (p ->> 'pago_em')::date, p ->> 'forma', auth.uid())
  returning id into v_id;
  perform privado.registrar('criar', 'assinatura_pagamentos', v_id, c);
  return v_id;
end;
$$;

create function public.plataforma_pagamento_excluir(pg uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_conta uuid;
begin
  perform public.exigir_super();
  delete from public.assinatura_pagamentos where id = pg returning conta_id into v_conta;
  if v_conta is null then
    raise exception 'nao_encontrado' using errcode = 'P0001';
  end if;
  perform privado.registrar('excluir', 'assinatura_pagamentos', pg, v_conta);
end;
$$;

-- Todos os pagamentos, para a tela de assinaturas.
create function public.plataforma_pagamentos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', pg.id,
             'conta_id', pg.conta_id,
             'conta', ct.nome,
             'referencia', pg.referencia,
             'valor', pg.valor,
             'pago_em', pg.pago_em,
             'forma', pg.forma,
             'registrado_em', pg.registrado_em
           ) order by pg.pago_em desc, pg.registrado_em desc)
      from public.assinatura_pagamentos pg
      join public.contas ct on ct.id = pg.conta_id
  ), '[]'::jsonb);
end;
$$;

-- A função admin-contas (chave de serviço) pergunta aqui, com o token de quem
-- chamou, se pode mexer no login antes de mexer. Quem decide é o banco.
--   desativar | email | senha | apagar
create function public.plataforma_login_conferir(u uuid, acao text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  if acao not in ('senha', 'email', 'desativar', 'reativar', 'apagar') then
    raise exception 'acao_invalida' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users where id = u) then
    raise exception 'login_inexistente' using errcode = 'P0001';
  end if;
  -- Ninguém se tranca para fora, e um super-admin não derruba outro pelo backoffice.
  if acao in ('desativar', 'apagar') and u = auth.uid() then
    raise exception 'proprio_login' using errcode = 'P0001';
  end if;
  if u <> auth.uid() and exists (select 1 from public.super_admins s where s.user_id = u) then
    raise exception 'login_super' using errcode = 'P0001';
  end if;
  if acao = 'apagar' and exists (select 1 from public.membros m where m.user_id = u) then
    raise exception 'login_com_consultorio' using errcode = 'P0001';
  end if;
end;
$$;

-- ------------------------------------------------------------ permissões

revoke execute on function public.exigir_super() from authenticated;
revoke execute on function
  public.exigir_super(), public.plataforma_eu(), public.plataforma_clientes(), public.plataforma_visao_geral(),
  public.plataforma_cliente(uuid), public.plataforma_logins(), public.plataforma_cliente_criar(jsonb),
  public.plataforma_conta_renomear(uuid, text), public.plataforma_assinatura_gravar(uuid, jsonb),
  public.plataforma_pagamento_lancar(uuid, jsonb), public.plataforma_pagamento_excluir(uuid),
  public.plataforma_pagamentos(), public.plataforma_login_conferir(uuid, text)
from public, anon;

grant execute on function
  public.plataforma_eu(), public.plataforma_clientes(), public.plataforma_visao_geral(),
  public.plataforma_cliente(uuid), public.plataforma_logins(), public.plataforma_cliente_criar(jsonb),
  public.plataforma_conta_renomear(uuid, text), public.plataforma_assinatura_gravar(uuid, jsonb),
  public.plataforma_pagamento_lancar(uuid, jsonb), public.plataforma_pagamento_excluir(uuid),
  public.plataforma_pagamentos(), public.plataforma_login_conferir(uuid, text)
to authenticated;
