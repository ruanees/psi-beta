-- Excluir sessão marcada por engano: some sem deixar cobrança, e o prontuário e o dinheiro ficam.
begin;
select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000ad', 'ana@excluir.teste'),
  ('00000000-0000-0000-0000-0000000000bd', 'bia@excluir.teste');
create temp table ids as select public.conta_criar('ana@excluir.teste', 'Consultório Ana', 'Ana') as conta;
alter table ids add column av uuid, add column pc uuid, add column rp uuid,
  add column s1 uuid, add column s2 uuid, add column s3 uuid, add column s4 uuid, add column s5 uuid, add column r1 uuid;
grant select, update on ids to authenticated;
select public.conta_criar('bia@excluir.teste', 'Consultório Bia', 'Bia');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated","aal":"aal1"}', true);

update ids set
  av = public.paciente_criar(conta, '{"nome":"Avulso Excluir","valor_sessao":150,"consentimento":true}'),
  pc = public.paciente_criar(conta, '{"nome":"Pacote Excluir","consentimento":true,"plano":{"plano":"pacote","sessoes":4,"valor":400}}'),
  rp = public.paciente_criar(conta, '{"nome":"Repeticao Excluir","consentimento":true}');
select public.pacote_criar((select conta from ids), (select pc from ids));
create function pg_temp.sessao(c uuid, p uuid, daqui interval) returns uuid language sql as $$
  select public.sessao_criar(c, jsonb_build_object('paciente_id', p, 'inicio', now() + daqui, 'duracao_min', 50, 'modalidade', 'presencial'));
$$;
update ids set
  s1 = pg_temp.sessao(conta, av, interval '3 days'),
  s2 = pg_temp.sessao(conta, av, interval '-3 days'),
  s3 = pg_temp.sessao(conta, pc, interval '-4 days'),
  s4 = pg_temp.sessao(conta, av, interval '-5 days'),
  s5 = pg_temp.sessao(conta, av, interval '-6 days');

-- ------------------------------------------------ uma sessão
select is((select public.sessao_excluir(conta, s1) from ids), '{"excluidas": 1, "mantidas": 0}'::jsonb, 'exclui uma sessão futura');
select ok(
  not exists (select 1 from ids, public.agenda_listar(ids.conta, now() - interval '30 days', now() + interval '30 days') a where a.id = ids.s1),
  'e ela some da agenda'
);

select public.sessao_status((select conta from ids), (select s2 from ids), 'realizada');
select public.sessao_excluir((select conta from ids), (select s2 from ids));
select ok(
  not exists (select 1 from ids, public.cobrancas_listar(ids.conta) cb where cb.sessao_id = ids.s2),
  'realizada por engano: a cobrança ainda não paga sai junto'
);

select public.sessao_status((select conta from ids), (select s3 from ids), 'realizada');
select is((select public.pacotes_listar(conta, pc) -> 0 -> 'restantes' from ids), '3'::jsonb, 'a sessão gastou o pacote');
select public.sessao_excluir((select conta from ids), (select s3 from ids));
select is((select public.pacotes_listar(conta, pc) -> 0 -> 'restantes' from ids), '4'::jsonb, 'excluída, volta ao saldo do pacote');

-- ------------------------------------------------ o que não sai
select public.sessao_status((select conta from ids), (select s4 from ids), 'realizada');
select public.observacao_gravar((select conta from ids), (select s4 from ids), 'Primeira sessão.');
select throws_ok(
  format($$select public.sessao_excluir(%L, %L)$$, (select conta from ids), (select s4 from ids)),
  'P0001', 'excluir_com_observacao', 'sessão com observação não se exclui'
);
select public.sessao_status((select conta from ids), (select s5 from ids), 'realizada');
select public.cobranca_pagar((select conta from ids), (select id from public.cobrancas_listar((select conta from ids)) where sessao_id = (select s5 from ids)), 'pix');
select throws_ok(
  format($$select public.sessao_excluir(%L, %L)$$, (select conta from ids), (select s5 from ids)),
  'P0001', 'excluir_com_pagamento', 'sessão com pagamento recebido não se exclui'
);
select throws_ok(
  format($$select public.sessao_excluir(%L, %L, 'repeticao')$$, (select conta from ids), (select s5 from ids)),
  'P0001', 'sem_recorrencia', 'sessão avulsa não tem repetição para excluir'
);

-- ------------------------------------------------ repetição criada errada
update ids set r1 = public.sessao_criar(conta, jsonb_build_object('paciente_id', rp, 'inicio', now() - interval '15 days',
  'duracao_min', 50, 'modalidade', 'presencial', 'repetir_semanal', true));
select public.sessao_status((select conta from ids), (select r1 from ids), 'realizada');
select public.observacao_gravar((select conta from ids), (select r1 from ids), 'Esta aconteceu de verdade.');
select is(
  (select public.sessao_excluir(conta, r1, 'repeticao') ->> 'mantidas' from ids), '1',
  'excluir a repetição mantém a sessão com observação'
);
select is(
  (select count(*)::int from ids, public.sessoes_do_paciente(ids.conta, ids.rp)), 1,
  'e apaga todas as outras, passadas e futuras'
);
select is(
  (select count(*)::int from ids, public.agenda_listar(ids.conta, now() + interval '20 days', now() + interval '80 days') a
    where a.paciente_id = ids.rp), 0,
  'a repetição não gera sessão nova depois'
);
select is((select public.paciente_ler(conta, rp) -> 'repeticao' from ids), 'null'::jsonb, 'e sai da ficha do paciente');

-- ------------------------------------------------ acesso
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000bd","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  format($$select public.sessao_excluir(%L, %L)$$, (select conta from ids), (select s5 from ids)),
  'P0001', 'sem_acesso', 'outra conta não exclui'
);
reset role;
select ok(
  exists (select 1 from public.auditoria a join ids on a.registro_id = ids.s1 where a.acao = 'excluir' and a.tabela = 'sessoes'),
  'a exclusão fica na auditoria'
);

select * from finish();
rollback;
