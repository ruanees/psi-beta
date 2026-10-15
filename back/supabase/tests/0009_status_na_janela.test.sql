-- Corrigir a situação da sessão pela janela: volta desfaz o consumo, com limites.
begin;
select plan(9);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a9', 'ana@status.teste');
create temp table ids as select public.conta_criar('ana@status.teste', 'Consultório Ana', 'Ana') as conta;
alter table ids add column av uuid, add column pc uuid, add column s1 uuid, add column s2 uuid, add column s3 uuid, add column s4 uuid;
grant select, update on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated","aal":"aal1"}', true);

update ids set
  av = public.paciente_criar(conta, '{"nome":"Avulso Status","valor_sessao":150,"consentimento":true}'),
  pc = public.paciente_criar(conta, '{"nome":"Pacote Status","consentimento":true,"plano":{"plano":"pacote","sessoes":4,"valor":400}}');
select public.pacote_criar((select conta from ids), (select pc from ids));
create function pg_temp.sessao(c uuid, p uuid, dias int) returns uuid language sql as $$
  select public.sessao_criar(c, jsonb_build_object('paciente_id', p, 'inicio', now() - make_interval(days => dias),
                             'duracao_min', 50, 'modalidade', 'presencial'));
$$;
update ids set s1 = pg_temp.sessao(conta, av, 6), s2 = pg_temp.sessao(conta, pc, 5), s3 = pg_temp.sessao(conta, av, 4),
  s4 = public.sessao_criar(conta, jsonb_build_object('paciente_id', av, 'inicio', now() + interval '3 days', 'duracao_min', 50, 'modalidade', 'online'));

-- avulsa realizada por engano → volta a agendada e a cobrança some
select public.sessao_status((select conta from ids), (select s1 from ids), 'realizada');
select lives_ok(
  format($$select public.sessao_status(%L, %L, 'agendada')$$, (select conta from ids), (select s1 from ids)),
  'realizada volta para agendada'
);
select ok(
  not exists (select 1 from public.cobrancas_listar((select conta from ids)) where sessao_id = (select s1 from ids)),
  'e a cobrança que ela gerou some'
);
select public.sessao_status((select conta from ids), (select s1 from ids), 'realizada');
select is(
  (select count(*)::int from public.cobrancas_listar((select conta from ids)) where sessao_id = (select s1 from ids)),
  1, 'marcar realizada de novo cobra uma vez só'
);

-- pacote: devolve a sessão
select public.sessao_status((select conta from ids), (select s2 from ids), 'realizada');
select public.sessao_status((select conta from ids), (select s2 from ids), 'confirmada');
select is(
  (select public.pacotes_listar((select conta from ids), (select pc from ids)) -> 0 -> 'restantes'),
  '4'::jsonb, 'voltar a sessão devolve o saldo do pacote'
);

-- limites
select public.sessao_status((select conta from ids), (select s3 from ids), 'realizada');
select public.cobranca_pagar((select conta from ids),
  (select id from public.cobrancas_listar((select conta from ids)) where sessao_id = (select s3 from ids)), 'pix');
select throws_ok(
  format($$select public.sessao_status(%L, %L, 'agendada')$$, (select conta from ids), (select s3 from ids)),
  'P0001', 'sessao_com_pagamento', 'sessão com pagamento recebido não volta'
);
select public.observacao_gravar((select conta from ids), (select s1 from ids), 'Registro.');
select throws_ok(
  format($$select public.sessao_status(%L, %L, 'agendada')$$, (select conta from ids), (select s1 from ids)),
  'P0001', 'sessao_com_observacao', 'sessão com observação não volta'
);

-- desmarcada → reativada
select public.sessao_desmarcar((select conta from ids), (select s4 from ids));
select lives_ok(
  format($$select public.sessao_status(%L, %L, 'confirmada')$$, (select conta from ids), (select s4 from ids)),
  'desmarcada pode ser reativada'
);
select is(
  (select status from public.agenda_listar((select conta from ids), now(), now() + interval '7 days') where id = (select s4 from ids)),
  'confirmada', 'e volta para a agenda'
);
select throws_ok(
  format($$select public.sessao_desmarcar(%L, %L)$$, (select conta from ids), (select s3 from ids)),
  'P0001', 'sessao_encerrada', 'realizada não vira desmarcada'
);

select * from finish();
rollback;
