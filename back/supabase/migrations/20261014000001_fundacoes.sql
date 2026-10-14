-- Fase 0 — fundações: conta, membros, perfil profissional, configurações e auditoria.
--
-- A regra de acesso mora aqui, e só aqui. O Nest repassa o JWT de quem chamou
-- e nunca usa service_role; quem decide o que cada um vê é a RLS e as funções
-- security definer abaixo. Escrever a mesma regra também no Nest seria a
-- dupla que se desencontra calada (lição do DIME).
--
-- Toda escrita passa por RPC. Nenhuma tabela tem política de insert, update
-- ou delete para o cliente.

-- ------------------------------------------------------------------ tabelas

create table public.contas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (length(btrim(nome)) between 1 and 120),
  criada_em  timestamptz not null default now()
);
comment on table public.contas is 'Clínica ou consultório. O psicólogo autônomo é uma conta de um membro.';

create table public.membros (
  id         uuid primary key default gen_random_uuid(),
  conta_id   uuid not null references public.contas (id) on delete restrict,
  user_id    uuid not null references auth.users (id) on delete restrict,
  papeis     text[] not null check (
               cardinality(papeis) > 0
               and papeis <@ array['titular', 'psicologo', 'recepcao', 'financeiro']
             ),
  criado_em  timestamptz not null default now(),
  unique (conta_id, user_id)
);
create index membros_user_id on public.membros (user_id);

create table public.profissionais (
  membro_id            uuid primary key references public.membros (id) on delete restrict,
  nome                 text not null check (length(btrim(nome)) between 1 and 120),
  -- CRP no formato do conselho: região/número, ex. 06/123456.
  crp                  text check (crp ~ '^[0-9]{2}/[0-9]{1,6}$'),
  epsi_numero          text check (length(epsi_numero) <= 40),
  valor_sessao_padrao  numeric(10, 2) check (valor_sessao_padrao >= 0 and valor_sessao_padrao < 100000)
);

create table public.configuracoes (
  conta_id              uuid primary key references public.contas (id) on delete restrict,
  falta_consome_pacote  boolean not null default true,
  falta_cobra_avulsa    boolean not null default true,
  aviso_minimo_horas    integer not null default 24 check (aviso_minimo_horas between 0 and 168),
  inatividade_minutos   integer not null default 30 check (inatividade_minutos between 5 and 240)
);
comment on column public.configuracoes.falta_consome_pacote is
  'Padrão até a resposta dos psicólogos (PLANO.md, seção 02).';

create table public.super_admins (
  user_id  uuid primary key references auth.users (id) on delete cascade
);
comment on table public.super_admins is 'Cria contas e vê o painel. Nunca ganha acesso clínico por estar aqui.';

-- Só cresce: nenhuma política nem permissão de update/delete, para ninguém.
create table public.auditoria (
  id           bigint generated always as identity primary key,
  quem         uuid not null,
  conta_id     uuid references public.contas (id) on delete restrict,
  acao         text not null check (acao in ('ler', 'criar', 'editar', 'arquivar', 'exportar')),
  tabela       text not null,
  registro_id  uuid,
  paciente_id  uuid,
  em           timestamptz not null default now()
);
create index auditoria_conta_em on public.auditoria (conta_id, em desc);
create index auditoria_paciente_em on public.auditoria (paciente_id, em desc) where paciente_id is not null;

-- ------------------------------------------------------- funções de acesso

-- Quem cadastrou o segundo fator só lê dado depois de confirmá-lo na sessão.
-- A trava é do banco: um token aal1 de quem tem fator não lê nada, venha de onde vier.
create function public.aal_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
           select 1 from auth.mfa_factors f
            where f.user_id = auth.uid() and f.status = 'verified'
         );
$$;

create function public.eh_membro(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and public.aal_ok()
     and exists (select 1 from public.membros m where m.conta_id = c and m.user_id = auth.uid());
$$;

create function public.tem_papel(c uuid, p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and public.aal_ok()
     and exists (
           select 1 from public.membros m
            where m.conta_id = c and m.user_id = auth.uid() and p = any (m.papeis)
         );
$$;

create function public.eh_super() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and public.aal_ok()
     and exists (select 1 from public.super_admins s where s.user_id = auth.uid());
$$;

-- Porta de toda RPC: levanta a chave certa em vez de devolver vazio. Lista
-- vazia por falta de segundo fator pareceria "você não tem conta" — a tela
-- mentiria em vez de travar.
create function public.exigir_membro(c uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_membro uuid;
begin
  if auth.uid() is null then
    raise exception 'sem_acesso' using errcode = 'P0001';
  end if;
  if not public.aal_ok() then
    raise exception 'segundo_fator' using errcode = 'P0001';
  end if;
  select m.id into v_membro from public.membros m where m.conta_id = c and m.user_id = auth.uid();
  if v_membro is null then
    raise exception 'sem_acesso' using errcode = 'P0001';
  end if;
  return v_membro;
end;
$$;

-- Fora do schema exposto pela API: só outras funções security definer chamam.
create schema if not exists privado;
revoke all on schema privado from public;

create function privado.registrar(
  p_acao text, p_tabela text, p_registro uuid, p_conta uuid, p_paciente uuid default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.auditoria (quem, conta_id, acao, tabela, registro_id, paciente_id)
  values (auth.uid(), p_conta, p_acao, p_tabela, p_registro, p_paciente);
$$;
revoke all on function privado.registrar(text, text, uuid, uuid, uuid) from public;

-- ----------------------------------------------------------------- RLS

alter table public.contas        enable row level security;
alter table public.membros       enable row level security;
alter table public.profissionais enable row level security;
alter table public.configuracoes enable row level security;
alter table public.super_admins  enable row level security;
alter table public.auditoria     enable row level security;

create policy contas_ler on public.contas
  for select to authenticated using (public.eh_membro(id));

create policy membros_ler on public.membros
  for select to authenticated using (public.eh_membro(conta_id));

create policy profissionais_ler on public.profissionais
  for select to authenticated using (
    exists (select 1 from public.membros m where m.id = membro_id and public.eh_membro(m.conta_id))
  );

create policy configuracoes_ler on public.configuracoes
  for select to authenticated using (public.eh_membro(conta_id));

create policy auditoria_ler on public.auditoria
  for select to authenticated using (public.tem_papel(conta_id, 'titular'));

-- super_admins: RLS ligada e nenhuma política — ninguém lê pela API.

-- Defesa em profundidade: mesmo sem política, tirar a permissão de escrita.
revoke all on public.contas, public.membros, public.profissionais, public.configuracoes,
              public.super_admins, public.auditoria from anon;
revoke insert, update, delete, truncate on public.contas, public.membros, public.profissionais,
              public.configuracoes, public.super_admins, public.auditoria from authenticated;

-- ----------------------------------------------------------------- RPCs

create function public.minhas_contas()
returns table (id uuid, nome text, papeis text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sem_acesso' using errcode = 'P0001';
  end if;
  if not public.aal_ok() then
    raise exception 'segundo_fator' using errcode = 'P0001';
  end if;
  return query
    select c.id, c.nome, m.papeis
      from public.membros m
      join public.contas c on c.id = m.conta_id
     where m.user_id = auth.uid()
     order by c.nome;
end;
$$;

create function public.conta_ler(c uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_membro uuid := public.exigir_membro(c);
begin
  return (
    select jsonb_build_object(
      'id', ct.id,
      'nome', ct.nome,
      'papeis', to_jsonb(m.papeis),
      'perfil', (
        select jsonb_build_object(
          'nome', p.nome,
          'crp', p.crp,
          'epsi_numero', p.epsi_numero,
          'valor_sessao_padrao', p.valor_sessao_padrao
        ) from public.profissionais p where p.membro_id = m.id
      ),
      'configuracoes', (
        select jsonb_build_object(
          'falta_consome_pacote', cf.falta_consome_pacote,
          'falta_cobra_avulsa', cf.falta_cobra_avulsa,
          'aviso_minimo_horas', cf.aviso_minimo_horas,
          'inatividade_minutos', cf.inatividade_minutos
        ) from public.configuracoes cf where cf.conta_id = ct.id
      )
    )
    from public.contas ct
    join public.membros m on m.conta_id = ct.id and m.id = v_membro
  );
end;
$$;

-- Grava só as chaves presentes em `p` — campo a campo, nunca o objeto inteiro.
-- Chave presente com null limpa o campo; chave ausente não mexe nele.
create function public.perfil_gravar(c uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_membro uuid := public.exigir_membro(c);
begin
  update public.profissionais set
    nome                = case when p ? 'nome' then p ->> 'nome' else nome end,
    crp                 = case when p ? 'crp' then nullif(p ->> 'crp', '') else crp end,
    epsi_numero         = case when p ? 'epsi_numero' then nullif(p ->> 'epsi_numero', '') else epsi_numero end,
    valor_sessao_padrao = case when p ? 'valor_sessao_padrao'
                               then (p ->> 'valor_sessao_padrao')::numeric else valor_sessao_padrao end
  where membro_id = v_membro;
  if not found then
    raise exception 'sem_acesso' using errcode = 'P0001';
  end if;
end;
$$;

create function public.configuracoes_gravar(c uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  if not public.tem_papel(c, 'titular') then
    raise exception 'so_titular' using errcode = 'P0001';
  end if;
  update public.configuracoes set
    falta_consome_pacote = case when p ? 'falta_consome_pacote'
                                then (p ->> 'falta_consome_pacote')::boolean else falta_consome_pacote end,
    falta_cobra_avulsa   = case when p ? 'falta_cobra_avulsa'
                                then (p ->> 'falta_cobra_avulsa')::boolean else falta_cobra_avulsa end,
    aviso_minimo_horas   = case when p ? 'aviso_minimo_horas'
                                then (p ->> 'aviso_minimo_horas')::integer else aviso_minimo_horas end,
    inatividade_minutos  = case when p ? 'inatividade_minutos'
                                then (p ->> 'inatividade_minutos')::integer else inatividade_minutos end
  where conta_id = c;
  perform privado.registrar('editar', 'configuracoes', null, c);
end;
$$;

-- Beta fechado: conta nasce pelo editor SQL do Supabase, nunca pela API.
-- 1) Authentication → Users → Add user (e-mail e senha provisória)
-- 2) select public.conta_criar('email@dela.com', 'Consultório Fulana', 'Fulana de Tal');
create function public.conta_criar(p_email text, p_conta text, p_nome text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user   uuid;
  v_conta  uuid;
  v_membro uuid;
begin
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'Usuário % não existe. Crie em Authentication → Users primeiro.', p_email;
  end if;
  insert into public.contas (nome) values (btrim(p_conta)) returning id into v_conta;
  insert into public.membros (conta_id, user_id, papeis)
       values (v_conta, v_user, array['titular', 'psicologo']) returning id into v_membro;
  insert into public.profissionais (membro_id, nome) values (v_membro, btrim(p_nome));
  insert into public.configuracoes (conta_id) values (v_conta);
  return v_conta;
end;
$$;

-- ------------------------------------------------------------ permissões

-- O Supabase concede execute em toda função nova a anon e authenticated.
-- Aqui se diz, uma por uma, quem chama o quê.
revoke execute on all functions in schema public from public, anon;
revoke execute on function public.conta_criar(text, text, text) from authenticated;
revoke execute on function public.exigir_membro(uuid) from authenticated;

grant execute on function
  public.aal_ok(), public.eh_membro(uuid), public.tem_papel(uuid, text), public.eh_super(),
  public.minhas_contas(), public.conta_ler(uuid),
  public.perfil_gravar(uuid, jsonb), public.configuracoes_gravar(uuid, jsonb)
to authenticated;
