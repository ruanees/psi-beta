-- Prova de RLS da Fase 0: entra como cada usuário e confere o que cada um enxerga.
-- O mock responde o que se mandou ele responder; isto aqui responde o que o banco faz.
begin;
select plan(22);

-- ------------------------------------------------------------ cenário
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@pgtap.teste'),
  ('00000000-0000-0000-0000-00000000000b', 'bruno@pgtap.teste'),
  ('00000000-0000-0000-0000-00000000000c', 'sem.conta@pgtap.teste');

create temp table ids as
  select public.conta_criar('ana@pgtap.teste', 'Consultório Ana', 'Ana')       as conta_a,
         public.conta_criar('bruno@pgtap.teste', 'Consultório Bruno', 'Bruno') as conta_b;
grant select on ids to authenticated;

-- ------------------------------------------------------------ Ana
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal1"}', true);

select is((select count(*)::int from public.minhas_contas()), 1, 'Ana vê uma conta');
select is((select id from public.minhas_contas()), (select conta_a from ids), 'e é a dela');
select is((select count(*)::int from public.contas), 1, 'RLS: contas mostra só a dela');
select is((select count(*)::int from public.membros), 1, 'RLS: membros só da conta dela');
select is((select count(*)::int from public.profissionais), 1, 'RLS: profissionais só da conta dela');
select is((select count(*)::int from public.configuracoes), 1, 'RLS: configurações só da conta dela');

select is(
  (select public.conta_ler((select conta_a from ids)) ->> 'nome'), 'Consultório Ana',
  'conta_ler devolve a própria conta'
);
select throws_ok(
  format('select public.conta_ler(%L)', (select conta_b from ids)), 'P0001', 'sem_acesso',
  'conta_ler da conta de outro levanta sem_acesso'
);

select lives_ok(
  format($$select public.perfil_gravar(%L, '{"crp":"06/123456","valor_sessao_padrao":180}')$$, (select conta_a from ids)),
  'Ana grava o próprio perfil'
);
select is(
  (select public.conta_ler((select conta_a from ids)) -> 'perfil' ->> 'crp'), '06/123456',
  'o CRP gravado volta na leitura'
);
select is(
  (select public.conta_ler((select conta_a from ids)) -> 'perfil' ->> 'nome'), 'Ana',
  'chave ausente não mexe no campo (gravação campo a campo)'
);
select throws_ok(
  format($$select public.perfil_gravar(%L, '{"crp":"123"}')$$, (select conta_a from ids)), '23514', null,
  'CRP fora do formato é recusado pelo banco'
);
select throws_ok(
  format($$select public.perfil_gravar(%L, '{"crp":"06/000001"}')$$, (select conta_b from ids)), 'P0001', 'sem_acesso',
  'Ana não grava o perfil do Bruno'
);
select lives_ok(
  format($$select public.configuracoes_gravar(%L, '{"inatividade_minutos":15}')$$, (select conta_a from ids)),
  'titular grava as configurações'
);

select throws_ok($$insert into public.contas (nome) values ('invasão')$$, '42501', null,
  'escrita direta em contas é recusada');
select throws_ok($$insert into public.auditoria (quem, acao, tabela) values (auth.uid(), 'ler', 'x')$$, '42501', null,
  'ninguém escreve na auditoria por fora da RPC');
select throws_ok($$select public.conta_criar('x@x', 'x', 'x')$$, '42501', null,
  'conta_criar não é chamável pela API');

-- ------------------------------------------------------------ sem conta
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.minhas_contas()), 0, 'usuário sem conta vê zero contas');
select is((select count(*)::int from public.auditoria), 0, 'e não lê a auditoria de ninguém');

-- ------------------------------------------------------------ segundo fator
reset role;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', 'teste', 'totp', 'verified', now(), now());
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal1"}', true);
select throws_ok('select * from public.minhas_contas()', 'P0001', 'segundo_fator',
  'com fator cadastrado, sessão aal1 levanta segundo_fator em vez de lista vazia');
select is((select count(*)::int from public.contas), 0, 'e a RLS não mostra nada em aal1');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","aal":"aal2"}', true);
select is((select count(*)::int from public.minhas_contas()), 1, 'em aal2 a conta volta');

select * from finish();
rollback;
