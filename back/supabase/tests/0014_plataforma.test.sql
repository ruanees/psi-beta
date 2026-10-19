-- Backoffice da plataforma: só o super-admin entra, e mesmo ele não alcança nada clínico.
begin;
select plan(41);

-- ------------------------------------------------------------ cenário
insert into auth.users (id, email, last_sign_in_at) values
  ('00000000-0000-0000-0000-0000000000f1', 'super@plataforma.teste', now()),
  ('00000000-0000-0000-0000-0000000000f2', 'outro.super@plataforma.teste', null),
  ('00000000-0000-0000-0000-0000000000a1', 'ana@plataforma.teste', now() - interval '40 days'),
  ('00000000-0000-0000-0000-0000000000b1', 'bia@plataforma.teste', null),
  ('00000000-0000-0000-0000-0000000000c1', 'carla@plataforma.teste', null),
  ('00000000-0000-0000-0000-0000000000d1', 'avulso@plataforma.teste', null);
insert into public.super_admins (user_id) values
  ('00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000f2');

-- Consultórios criados pelo editor SQL depois da migration: nascem sem assinatura.
create temp table ids as
  select public.conta_criar('ana@plataforma.teste', 'Consultório Ana', 'Ana') as ana,
         public.conta_criar('bia@plataforma.teste', 'Consultório Bia', 'Bia') as bia,
         null::uuid as carla, null::uuid as pg1, null::uuid as pg2, null::uuid as pg3;
grant select, update on ids to authenticated;

create function pg_temp.como(u text, aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated', 'aal', aal)::text, true);
$$;
grant execute on function pg_temp.como(text, text) to authenticated;

-- ------------------------------------------------------------ titular não entra
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000a1');

select is((public.plataforma_eu() ->> 'super')::boolean, false, 'plataforma_eu diz que a titular não opera a plataforma');
select throws_ok('select public.plataforma_clientes()', 'P0001', 'so_super', 'titular não lista consultórios');
select throws_ok('select public.plataforma_visao_geral()', 'P0001', 'so_super', 'nem a visão geral');
select throws_ok(format('select public.plataforma_cliente(%L)', (select ana from ids)), 'P0001', 'so_super',
  'nem a ficha do próprio consultório');
select throws_ok('select public.plataforma_logins()', 'P0001', 'so_super', 'nem os logins');
select throws_ok(
  $$select public.plataforma_cliente_criar('{"email":"carla@plataforma.teste","conta":"x","nome":"x"}')$$, 'P0001', 'so_super',
  'nem cria consultório');
select throws_ok(
  format($$select public.plataforma_assinatura_gravar(%L, '{"valor_mensal":0}')$$, (select ana from ids)), 'P0001', 'so_super',
  'nem mexe na própria assinatura');
select throws_ok('select * from public.assinaturas', '42501', null, 'assinaturas não se leem pela API');
select throws_ok('select * from public.assinatura_pagamentos', '42501', null, 'nem os pagamentos');
select throws_ok('select public.exigir_super()', '42501', null, 'exigir_super não é chamável pela API');

-- ------------------------------------------------------------ super-admin
select pg_temp.como('00000000-0000-0000-0000-0000000000f1');

select is((public.plataforma_eu() ->> 'super')::boolean, true, 'plataforma_eu reconhece o super-admin');
select is(jsonb_array_length(public.plataforma_clientes()), 2, 'lista os dois consultórios');
select ok(
  (select bool_and(c -> 'pendencias' ? 'sem_assinatura') from jsonb_array_elements(public.plataforma_clientes()) c),
  'consultório criado pelo editor SQL aparece sem assinatura'
);
select is(
  (select c -> 'titular' ->> 'email' from jsonb_array_elements(public.plataforma_clientes()) c where c ->> 'nome' = 'Consultório Ana'),
  'ana@plataforma.teste', 'cada um com o e-mail do titular'
);
select ok(
  (select c -> 'pendencias' ? 'parado' from jsonb_array_elements(public.plataforma_clientes()) c where c ->> 'nome' = 'Consultório Ana'),
  'quem não entra há mais de 30 dias pede atenção'
);
select ok(
  (select c -> 'pendencias' ? 'nunca_entrou' from jsonb_array_elements(public.plataforma_clientes()) c where c ->> 'nome' = 'Consultório Bia'),
  'e quem nunca entrou também'
);

-- O recorte: a ficha é conta, login e assinatura. Chave nova aqui é decisão, não descuido.
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.plataforma_cliente((select ana from ids))) k),
  array['acessos', 'assinatura', 'criada_em', 'id', 'membros', 'meses_em_aberto', 'nome', 'observacao', 'pagamentos',
        'pago_mes', 'pendencias', 'titular', 'ultimo_acesso', 'valor_em_aberto'],
  'a ficha do consultório traz só estas chaves'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.plataforma_cliente((select ana from ids)) -> 'membros' -> 0) k),
  array['criado_em', 'desativado', 'email', 'nome', 'papeis', 'segundo_fator', 'ultimo_acesso', 'user_id'],
  'e de cada acesso, só estas'
);
select throws_ok(format('select public.plataforma_cliente(%L)', gen_random_uuid()), 'P0001', 'conta_inexistente',
  'ficha de consultório que não existe');

-- criar
select throws_ok(
  $$select public.plataforma_cliente_criar('{"email":"ninguem@plataforma.teste","conta":"X","nome":"X"}')$$, 'P0001', 'email_sem_login',
  'consultório só nasce para login que existe');
select throws_ok(
  $$select public.plataforma_cliente_criar('{"email":"ana@plataforma.teste","conta":"Outro","nome":"Ana"}')$$, 'P0001', 'login_ja_titular',
  'quem já é titular não ganha segundo consultório pelo painel');
select throws_ok(
  $$select public.plataforma_cliente_criar('{"email":"carla@plataforma.teste","conta":" ","nome":"Carla"}')$$, 'P0001', 'cliente_incompleto',
  'nome do consultório é obrigatório');
update ids set carla = public.plataforma_cliente_criar(
  '{"email":"Carla@Plataforma.Teste","conta":"Consultório Carla","nome":"Carla","assinatura":{"plano":"mensal","valor_mensal":89.9,"situacao":"ativa"}}');
select is(public.plataforma_cliente((select carla from ids)) -> 'assinatura' ->> 'valor_mensal', '89.90',
  'consultório, titular e assinatura nascem juntos');
select is(public.plataforma_cliente((select carla from ids)) -> 'membros' -> 0 -> 'papeis', '["titular", "psicologo"]'::jsonb,
  'o login vira titular e psicólogo');

-- assinatura e atraso
select lives_ok(
  format($$select public.plataforma_assinatura_gravar(%L, jsonb_build_object(
    'plano', 'mensal', 'valor_mensal', 100, 'situacao', 'ativa', 'dia_vencimento', 5,
    'inicio', (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '2 months')::date))$$,
    (select ana from ids)),
  'assinatura nasce pela gravação para quem não tinha');
select ok((public.plataforma_cliente((select ana from ids)) ->> 'meses_em_aberto')::int >= 2, 'dois meses passados sem pagamento');
select ok(public.plataforma_cliente((select ana from ids)) -> 'pendencias' ? 'em_atraso', 'e isso é atraso');

update ids set
  pg1 = public.plataforma_pagamento_lancar(ana, jsonb_build_object('referencia',
          (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '2 months')::date,
          'valor', 100, 'pago_em', (now() at time zone 'America/Sao_Paulo')::date, 'forma', 'pix')),
  pg2 = public.plataforma_pagamento_lancar(ana, jsonb_build_object('referencia',
          (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month' + interval '10 days')::date,
          'valor', 100, 'pago_em', (now() at time zone 'America/Sao_Paulo')::date, 'forma', 'boleto')),
  pg3 = public.plataforma_pagamento_lancar(ana, jsonb_build_object('referencia',
          (now() at time zone 'America/Sao_Paulo')::date,
          'valor', 100, 'pago_em', (now() at time zone 'America/Sao_Paulo')::date, 'forma', 'pix'));
select is((public.plataforma_cliente((select ana from ids)) ->> 'meses_em_aberto')::int, 0, 'pagos os três meses, nada em aberto');
select is((public.plataforma_cliente((select ana from ids)) ->> 'pago_mes')::boolean, true, 'e o mês corrente consta pago');
select throws_ok(
  format($$select public.plataforma_pagamento_lancar(%L, jsonb_build_object('referencia', (now() at time zone 'America/Sao_Paulo')::date, 'valor', 100,
    'pago_em', (now() at time zone 'America/Sao_Paulo')::date, 'forma', 'pix'))$$, (select ana from ids)),
  'P0001', 'mes_ja_pago', 'um mês não se paga duas vezes');
select throws_ok(
  format($$select public.plataforma_pagamento_lancar(%L, jsonb_build_object('referencia', current_date + 40, 'valor', 100,
    'pago_em', current_date + 40, 'forma', 'pix'))$$, (select ana from ids)),
  'P0001', 'pagamento_futuro', 'pagamento com data futura é recusado');
select lives_ok(format('select public.plataforma_pagamento_excluir(%L)', (select pg1 from ids)), 'pagamento lançado errado sai');
select is((public.plataforma_cliente((select ana from ids)) ->> 'meses_em_aberto')::int, 1, 'e o mês volta a constar em aberto');

-- logins
select is(public.plataforma_logins() -> 0 ->> 'email', 'avulso@plataforma.teste', 'login sem consultório vem primeiro');
select throws_ok(format($$select public.plataforma_login_conferir(%L, 'desativar')$$, auth.uid()), 'P0001', 'proprio_login',
  'super-admin não desativa o próprio login');
select throws_ok($$select public.plataforma_login_conferir('00000000-0000-0000-0000-0000000000f2', 'senha')$$, 'P0001', 'login_super',
  'nem mexe no login de outro super-admin');
select throws_ok($$select public.plataforma_login_conferir('00000000-0000-0000-0000-0000000000a1', 'apagar')$$, 'P0001',
  'login_com_consultorio', 'login ligado a consultório não se apaga');
select lives_ok($$select public.plataforma_login_conferir('00000000-0000-0000-0000-0000000000d1', 'apagar')$$,
  'login avulso pode sair');

-- ------------------------------------------------------------ segundo fator
reset role;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000f1', 'teste', 'totp', 'verified', now(), now());
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000f1', 'aal1');
select throws_ok('select public.plataforma_clientes()', 'P0001', 'segundo_fator',
  'super-admin com fator cadastrado precisa do código antes de entrar no painel');

-- ------------------------------------------------------------ o recorte, no código
reset role;
-- Nenhuma função do painel cita tabela clínica ou de cobrança do consultório. Prova
-- grosseira de propósito: quem precisar dela para algo legítimo muda este teste e explica.
select is(
  (select count(*)::int
     from pg_proc f join pg_namespace n on n.oid = f.pronamespace
    where ((n.nspname = 'public' and f.proname like 'plataforma\_%')
           or (n.nspname = 'privado' and f.proname in ('resumo_conta', 'meses_em_aberto')))
      and f.prosrc ~* '\m(pacientes|sessoes|observacoes|anamneses|pacotes|cobrancas|documentos_fiscais|responsaveis|recorrencias)\M'),
  0, 'nenhuma função do painel lê tabela clínica ou financeira do consultório'
);

select ok(
  (select count(*) from public.auditoria where quem = '00000000-0000-0000-0000-0000000000f1') >= 5,
  'o que o super-admin grava fica na auditoria, com o nome dele'
);

select * from finish();
rollback;
