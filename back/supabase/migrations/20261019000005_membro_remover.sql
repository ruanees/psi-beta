-- Backoffice: tirar o acesso de alguém a um consultório e trocar os papéis.
--
-- Tirar acesso não apaga o vínculo. Paciente, sessão e repetição apontam
-- para ele (on delete restrict), e o que a pessoa escreveu no prontuário
-- continua sendo dela. O vínculo ganha `removido_em` e toda porta passa a
-- ignorá-lo: entrar no consultório, os papéis, a lista de consultórios, o
-- contexto e o clínico. Os pacientes de um psicólogo que sai ficam
-- guardados: ninguém lê o clínico deles (pode_clinico é só do psicólogo do
-- paciente) até o consultório passá-los a outro psicólogo.
--
-- O papel de psicólogo passa a valer de verdade: pode_clinico exige o papel
-- e o vínculo ativo. Antes, quem perdia o papel continuava lendo o clínico
-- dos próprios pacientes, porque a regra só olhava o paciente.
--
-- Devolver o acesso é o mesmo "Dar acesso": o vínculo antigo volta com os
-- papéis novos, em vez de um vínculo duplicado.
--
-- Um consultório nunca fica sem titular ativo: tirar o acesso ou o papel do
-- último titular é recusado (ultimo_titular).

alter table public.membros add column removido_em timestamptz;
comment on column public.membros.removido_em is
  'Acesso tirado. O vínculo fica: paciente, sessão e prontuário apontam para ele.';

-- ------------------------------------------------------------ portas

create or replace function public.eh_membro(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and public.aal_ok()
     and exists (
           select 1 from public.membros m
            where m.conta_id = c and m.user_id = auth.uid() and m.removido_em is null
         );
$$;

create or replace function public.tem_papel(c uuid, p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and public.aal_ok()
     and exists (
           select 1 from public.membros m
            where m.conta_id = c and m.user_id = auth.uid() and m.removido_em is null and p = any (m.papeis)
         );
$$;

create or replace function public.exigir_membro(c uuid) returns uuid
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
  select m.id into v_membro from public.membros m
   where m.conta_id = c and m.user_id = auth.uid() and m.removido_em is null;
  if v_membro is null then
    raise exception 'sem_acesso' using errcode = 'P0001';
  end if;
  return v_membro;
end;
$$;

create or replace function public.pode_clinico(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and public.aal_ok()
     and exists (
           select 1 from public.pacientes pa
             join public.membros m on m.id = pa.profissional_id
            where pa.id = p and m.user_id = auth.uid()
              and m.removido_em is null and 'psicologo' = any (m.papeis)
         );
$$;

create or replace function public.minhas_contas()
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
     where m.user_id = auth.uid() and m.removido_em is null
     order by c.nome;
end;
$$;

create or replace function public.plataforma_eu() returns jsonb
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
    'super', exists (select 1 from public.super_admins s where s.user_id = auth.uid()),
    'consultorios', (
      select count(*) from public.membros m where m.user_id = auth.uid() and m.removido_em is null
    )
  );
end;
$$;

-- ------------------------------------------------------------ regras do vínculo

-- Os papéis pedidos, sem repetição, ou a recusa. Uma regra só para dar
-- acesso e para trocar papéis.
create function privado.papeis_pedidos(p jsonb) returns text[]
language plpgsql immutable set search_path = '' as $$
declare
  v text[];
begin
  select coalesce(array_agg(distinct x order by x), '{}') into v
    from jsonb_array_elements_text(coalesce(p -> 'papeis', '[]'::jsonb)) x;
  if cardinality(v) = 0 or not v <@ array['titular', 'psicologo', 'recepcao', 'financeiro'] then
    raise exception 'papeis_invalidos' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- Um login responde por um consultório só (o vínculo ativo de titular).
create function privado.titular_em_outro(u uuid, c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros m
     where m.user_id = u and m.conta_id is distinct from c
       and m.removido_em is null and 'titular' = any (m.papeis)
  );
$$;

-- Se o vínculo `m` deixar de ser titular, o consultório fica com outro titular ativo?
create function privado.sobra_titular(m uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros o join public.membros x on x.conta_id = o.conta_id
     where x.id = m and o.id <> m and o.removido_em is null and 'titular' = any (o.papeis)
  );
$$;

revoke all on function privado.papeis_pedidos(jsonb), privado.titular_em_outro(uuid, uuid),
  privado.sobra_titular(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------ painel: só vínculo ativo conta

create or replace function privado.resumo_conta(c uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ativos as (
    select m.* from public.membros m where m.conta_id = c and m.removido_em is null
  ),
  base as (
    select ct.id, ct.nome, ct.criada_em,
           a.conta_id is not null as tem_assinatura,
           a.plano, a.valor_mensal, a.dia_vencimento, a.situacao, a.inicio,
           (select count(*) from ativos) as acessos,
           (select max(u.last_sign_in_at) from ativos m join auth.users u on u.id = m.user_id) as ultimo_acesso,
           (select jsonb_build_object('nome', p.nome, 'email', u.email)
              from ativos m
              join auth.users u on u.id = m.user_id
              left join public.profissionais p on p.membro_id = m.id
             where 'titular' = any (m.papeis)
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
revoke all on function privado.resumo_conta(uuid) from public, anon, authenticated;

create or replace function public.plataforma_visao_geral() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_mes date := date_trunc('month', privado.hoje())::date;
begin
  perform public.exigir_super();
  return jsonb_build_object(
    'consultorios', (select count(*) from public.contas),
    'acessos', (select count(*) from public.membros where removido_em is null),
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
       where m.removido_em is null and u.last_sign_in_at > now() - interval '7 days'
    ),
    'mes', v_mes
  );
end;
$$;

-- A ficha lista também quem saiu (com removido_em), para devolver o acesso.
-- `id` é o vínculo: é por ele que a ficha troca papéis e tira o acesso.
create or replace function public.plataforma_cliente(c uuid) returns jsonb
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
               'id', m.id,
               'user_id', u.id,
               'email', u.email,
               'nome', p.nome,
               'papeis', to_jsonb(m.papeis),
               'criado_em', m.criado_em,
               'removido_em', m.removido_em,
               'ultimo_acesso', u.last_sign_in_at,
               'desativado', coalesce(u.banned_until > now(), false),
               'segundo_fator', exists (
                 select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'
               )
             ) order by m.removido_em nulls first, m.criado_em)
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

-- Em Contas, só o consultório onde a pessoa ainda entra. Login cujo acesso
-- foi todo tirado volta a aparecer como "sem consultório".
create or replace function public.plataforma_logins() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_super();
  return coalesce((
    select jsonb_agg(l.linha order by l.sem_conta desc, lower(l.email))
      from (
        select u.email,
               not exists (
                 select 1 from public.membros m where m.user_id = u.id and m.removido_em is null
               ) as sem_conta,
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
                    where m.user_id = u.id and m.removido_em is null
                 ), '[]'::jsonb)
               ) as linha
          from auth.users u
      ) l
  ), '[]'::jsonb);
end;
$$;

create or replace function public.plataforma_cliente_criar(p jsonb) returns uuid
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
  if privado.titular_em_outro(v_user, null) then
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

-- ------------------------------------------------------------ escrita do vínculo

-- Dar acesso. Se a pessoa já teve acesso e saiu, o vínculo antigo volta com
-- os papéis pedidos; o perfil profissional, se já existia, fica como estava.
create or replace function public.plataforma_membro_adicionar(c uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_email   text := lower(btrim(p ->> 'email'));
  v_nome    text := nullif(btrim(p ->> 'nome'), '');
  v_papeis  text[];
  v_user    uuid;
  v_membro  uuid;
  v_saiu    timestamptz;
begin
  perform public.exigir_super();
  if not exists (select 1 from public.contas where id = c) then
    raise exception 'conta_inexistente' using errcode = 'P0001';
  end if;
  v_papeis := privado.papeis_pedidos(p);

  select u.id into v_user from auth.users u where lower(u.email) = v_email;
  if v_user is null then
    raise exception 'email_sem_login' using errcode = 'P0001';
  end if;
  select m.id, m.removido_em into v_membro, v_saiu from public.membros m where m.conta_id = c and m.user_id = v_user;
  if v_membro is not null and v_saiu is null then
    raise exception 'ja_membro' using errcode = 'P0001';
  end if;
  if 'psicologo' = any (v_papeis) and v_nome is null
     and not exists (select 1 from public.profissionais pr where pr.membro_id = v_membro) then
    raise exception 'nome_obrigatorio' using errcode = 'P0001';
  end if;
  if 'titular' = any (v_papeis) and privado.titular_em_outro(v_user, c) then
    raise exception 'login_ja_titular' using errcode = 'P0001';
  end if;

  if v_membro is null then
    insert into public.membros (conta_id, user_id, papeis) values (c, v_user, v_papeis) returning id into v_membro;
    perform privado.registrar('criar', 'membros', v_membro, c);
  else
    update public.membros set papeis = v_papeis, removido_em = null where id = v_membro;
    perform privado.registrar('editar', 'membros', v_membro, c);
  end if;
  if 'psicologo' = any (v_papeis)
     and not exists (select 1 from public.profissionais pr where pr.membro_id = v_membro) then
    insert into public.profissionais (membro_id, nome) values (v_membro, v_nome);
  end if;
  return v_membro;
end;
$$;

-- Trocar papéis de quem entra. Ganhar o papel de psicólogo cria o perfil
-- profissional (pede nome, se ainda não existe). Perder o papel não apaga o
-- perfil: o nome continua nas sessões passadas, e o clínico fecha porque
-- pode_clinico exige o papel.
create function public.plataforma_membro_papeis(m uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v       public.membros;
  v_nome  text := nullif(btrim(p ->> 'nome'), '');
  v_papeis text[];
begin
  perform public.exigir_super();
  select * into v from public.membros where id = m;
  if not found then
    raise exception 'membro_inexistente' using errcode = 'P0001';
  end if;
  if v.removido_em is not null then
    raise exception 'membro_removido' using errcode = 'P0001';
  end if;
  v_papeis := privado.papeis_pedidos(p);
  if 'psicologo' = any (v_papeis) and v_nome is null
     and not exists (select 1 from public.profissionais pr where pr.membro_id = m) then
    raise exception 'nome_obrigatorio' using errcode = 'P0001';
  end if;
  if 'titular' = any (v.papeis) and not 'titular' = any (v_papeis) and not privado.sobra_titular(m) then
    raise exception 'ultimo_titular' using errcode = 'P0001';
  end if;
  if 'titular' = any (v_papeis) and privado.titular_em_outro(v.user_id, v.conta_id) then
    raise exception 'login_ja_titular' using errcode = 'P0001';
  end if;

  update public.membros set papeis = v_papeis where id = m;
  if 'psicologo' = any (v_papeis)
     and not exists (select 1 from public.profissionais pr where pr.membro_id = m) then
    insert into public.profissionais (membro_id, nome) values (m, v_nome);
  end if;
  perform privado.registrar('editar', 'membros', m, v.conta_id);
end;
$$;

-- Tirar o acesso. A conta Google de quem saiu deixa de criar sala de Meet
-- pelo consultório: a ligação é apagada, e quem voltar conecta de novo.
-- Tirar de novo quem já saiu não muda nada.
create function public.plataforma_membro_remover(m uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.membros;
begin
  perform public.exigir_super();
  select * into v from public.membros where id = m;
  if not found then
    raise exception 'membro_inexistente' using errcode = 'P0001';
  end if;
  if v.removido_em is not null then
    return;
  end if;
  if 'titular' = any (v.papeis) and not privado.sobra_titular(m) then
    raise exception 'ultimo_titular' using errcode = 'P0001';
  end if;

  update public.membros set removido_em = now() where id = m;
  delete from public.integracoes_google where membro_id = m;
  perform privado.registrar('arquivar', 'membros', m, v.conta_id);
end;
$$;

revoke execute on function public.plataforma_membro_papeis(uuid, jsonb), public.plataforma_membro_remover(uuid)
  from public, anon;
grant execute on function public.plataforma_membro_papeis(uuid, jsonb), public.plataforma_membro_remover(uuid)
  to authenticated;
