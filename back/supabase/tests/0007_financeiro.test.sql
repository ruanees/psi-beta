-- Financeiro: cobrança nasce sozinha uma vez, pacote gasta saldo, mensalidade, pagamento.
begin;
select plan(34);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a7', 'ana@fin.teste'),
  ('00000000-0000-0000-0000-0000000000b7', 'bia@fin.teste');
create temp table ids as select public.conta_criar('ana@fin.teste', 'Consultório Ana', 'Ana') as conta;
alter table ids add column avulso uuid, add column padrao uuid, add column pac uuid, add column mensal uuid,
  add column s1 uuid, add column s2 uuid, add column s3 uuid, add column s4 uuid, add column s5 uuid,
  add column s6 uuid, add column s7 uuid, add column pacote uuid, add column cb uuid;
grant select, update on ids to authenticated;
select public.conta_criar('bia@fin.teste', 'Consultório Bia', 'Bia');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated","aal":"aal1"}', true);

select public.perfil_gravar((select conta from ids), '{"valor_sessao_padrao":180}');
update ids set
  avulso = public.paciente_criar(conta, '{"nome":"Avulso Próprio","valor_sessao":150,"consentimento":true}'),
  padrao = public.paciente_criar(conta, '{"nome":"Avulso Padrão","consentimento":true}'),
  pac    = public.paciente_criar(conta, '{"nome":"Do Pacote","consentimento":true,"plano":{"plano":"pacote","sessoes":2,"valor":300}}'),
  mensal = public.paciente_criar(conta, '{"nome":"Do Mensal","consentimento":true,"plano":{"plano":"mensal","valor":600}}');

-- uma sessão por dia, para não chocar horário
create function pg_temp.sessao(c uuid, p uuid, dias int) returns uuid language sql as $$
  select public.sessao_criar(c, jsonb_build_object('paciente_id', p, 'inicio', now() - make_interval(days => dias),
                             'duracao_min', 50, 'modalidade', 'presencial'));
$$;
update ids set
  s1 = pg_temp.sessao(conta, avulso, 20), s2 = pg_temp.sessao(conta, padrao, 19), s3 = pg_temp.sessao(conta, avulso, 18),
  s4 = pg_temp.sessao(conta, pac, 17), s5 = pg_temp.sessao(conta, pac, 16), s6 = pg_temp.sessao(conta, pac, 15),
  s7 = pg_temp.sessao(conta, mensal, 14);

-- ------------------------------------------------ avulsa
select public.sessao_status((select conta from ids), (select s1 from ids), 'realizada');
select is(
  (select valor from public.cobrancas_listar((select conta from ids)) where sessao_id = (select s1 from ids)),
  150.00, 'sessão avulsa realizada gera cobrança com o valor do paciente'
);
select public.sessao_status((select conta from ids), (select s2 from ids), 'realizada');
select is(
  (select valor from public.cobrancas_listar((select conta from ids)) where sessao_id = (select s2 from ids)),
  180.00, 'sem valor próprio, usa o padrão do consultório'
);
select public.sessao_status((select conta from ids), (select s1 from ids), 'falta');
select is(
  (select count(*)::int from public.cobrancas_listar((select conta from ids)) where sessao_id = (select s1 from ids)),
  1, 'corrigir realizada para falta não cobra de novo'
);
select public.sessao_status((select conta from ids), (select s3 from ids), 'falta');
select ok(
  exists (select 1 from public.cobrancas_listar((select conta from ids)) where sessao_id = (select s3 from ids)),
  'falta avulsa também é cobrada'
);
select throws_ok(
  format($$select public.sessao_desmarcar(%L, %L)$$, (select conta from ids), (select s1 from ids)),
  'P0001', 'sessao_encerrada', 'sessão com falta não vira desmarcada'
);

-- desmarcada com antecedência não cobra; em cima da hora vira falta e cobra
update ids set cb = public.sessao_criar(conta, jsonb_build_object('paciente_id', avulso, 'inicio', now() + interval '5 days',
  'duracao_min', 50, 'modalidade', 'online'));
select public.sessao_desmarcar((select conta from ids), (select cb from ids));
select ok(
  not exists (select 1 from public.cobrancas_listar((select conta from ids)) where sessao_id = (select cb from ids)),
  'desmarcada com antecedência não gera cobrança'
);
update ids set cb = public.sessao_criar(conta, jsonb_build_object('paciente_id', avulso, 'inicio', now() + interval '2 hours',
  'duracao_min', 50, 'modalidade', 'online'));
select is(
  (select public.sessao_desmarcar((select conta from ids), (select cb from ids)) ->> 'resultado'),
  'falta', 'desmarcada em cima da hora vira falta'
);
select ok(
  exists (select 1 from public.cobrancas_listar((select conta from ids)) where sessao_id = (select cb from ids)),
  'e gera cobrança'
);

-- ------------------------------------------------ pacote
update ids set pacote = public.pacote_criar(conta, pac);
select is(
  (select valor from public.cobrancas_listar((select conta from ids)) where pacote_id = (select pacote from ids)),
  300.00, 'pacote nasce com a cobrança do valor inteiro, pelo plano do paciente'
);
select public.sessao_status((select conta from ids), (select s4 from ids), 'realizada');
select public.sessao_status((select conta from ids), (select s5 from ids), 'falta');
select is(
  (select public.pacotes_listar((select conta from ids), (select pac from ids)) -> 0 -> 'restantes'),
  '0'::jsonb, 'realizada e falta gastam o pacote'
);
select ok(
  not exists (select 1 from public.cobrancas_listar((select conta from ids))
               where sessao_id in ((select s4 from ids), (select s5 from ids))),
  'sessão do pacote não gera cobrança própria'
);
select is(
  (select public.sessao_financeiro((select conta from ids), (select s5 from ids)) -> 'pacote' ->> 'numero'),
  '2', 'a sessão sabe que é a 2 de 2 do pacote'
);
select public.sessao_status((select conta from ids), (select s6 from ids), 'realizada');
select is(
  (select valor from public.cobrancas_listar((select conta from ids)) where sessao_id = (select s6 from ids)),
  150.00, 'pacote acabou: a sessão é cobrada pelo valor por sessão do pacote'
);
select ok(
  (select public.painel_financeiro((select conta from ids)) -> 'pacotes_acabando' @> jsonb_build_array(jsonb_build_object('paciente_id', (select pac from ids)))),
  'o painel avisa o pacote que acabou'
);
select throws_ok(
  format($$select public.pacote_criar(%L, %L)$$, (select conta from ids), (select avulso from ids)),
  'P0001', 'pacote_incompleto', 'pacote sem quantidade nem valor, e paciente sem plano de pacote, é recusado'
);

-- ------------------------------------------------ mensal
select is(
  (select count(*)::int from public.cobrancas_listar((select conta from ids)) where paciente_id = (select mensal from ids) and origem = 'mensal'),
  1, 'mensalidade do mês nasce ao abrir o financeiro'
);
select is(
  (select count(*)::int from public.cobrancas_listar((select conta from ids)) where paciente_id = (select mensal from ids) and origem = 'mensal'),
  1, 'e abrir de novo não duplica'
);
select is(
  (select vencimento from public.cobrancas_listar((select conta from ids))
    where paciente_id = (select mensal from ids) and origem = 'mensal'),
  greatest(date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date + 9,
           (now() at time zone 'America/Sao_Paulo')::date),
  'a primeira vence no dia 10, o padrão, ou hoje se o dia 10 já passou'
);
select public.sessao_status((select conta from ids), (select s7 from ids), 'realizada');
select ok(
  not exists (select 1 from public.cobrancas_listar((select conta from ids)) where sessao_id = (select s7 from ids)),
  'sessão de paciente mensal não gera cobrança própria'
);

-- ------------------------------------------------ pagamento
update ids set cb = (select id from public.cobrancas_listar((select conta from ids)) where sessao_id = (select s2 from ids));
select lives_ok(
  format($$select public.cobranca_pagar(%L, %L, 'pix')$$, (select conta from ids), (select cb from ids)),
  'marca como paga no Pix'
);
select is(
  (select situacao || ' ' || forma from public.cobrancas_listar((select conta from ids), '{"situacao":"paga"}') where id = (select cb from ids)),
  'paga pix', 'e aparece nas pagas'
);
select throws_ok(
  format($$select public.cobranca_pagar(%L, %L, 'pix')$$, (select conta from ids), (select cb from ids)),
  'P0001', 'cobranca_nao_pendente', 'não paga duas vezes'
);
select throws_ok(
  format($$select public.cobranca_desfazer(%L, %L, '  ')$$, (select conta from ids), (select cb from ids)),
  'P0001', 'motivo_obrigatorio', 'desfazer pagamento pede motivo'
);
select lives_ok(
  format($$select public.cobranca_desfazer(%L, %L, 'lançado no paciente errado')$$, (select conta from ids), (select cb from ids)),
  'desfaz com motivo'
);
select throws_ok(
  format($$select public.cobranca_pagar(%L, %L, 'cheque')$$, (select conta from ids), (select cb from ids)),
  '23514', null, 'forma de pagamento fora da lista é recusada'
);
select lives_ok(
  format($$select public.cobranca_cancelar(%L, %L, 'cortesia')$$, (select conta from ids), (select cb from ids)),
  'cancela uma cobrança pendente com motivo'
);
select ok(
  (select bool_and(situacao in ('pendente', 'vencida')) from public.cobrancas_listar((select conta from ids), '{"situacao":"pendente"}')),
  'o filtro de pendentes traz pendentes e vencidas'
);
select ok(
  exists (select 1 from public.cobrancas_listar((select conta from ids)) where situacao = 'vencida'),
  'pendente com vencimento passado aparece como vencida'
);

-- ------------------------------------------------ regras gerais
select throws_ok(
  format($$select public.paciente_excluir(%L, %L)$$, (select conta from ids), (select pac from ids)),
  'P0001', 'paciente_com_atendimento', 'paciente com atendimento continua sem exclusão'
);
update ids set cb = public.paciente_criar(conta, '{"nome":"Só Comprou","consentimento":true,"plano":{"plano":"pacote","sessoes":4,"valor":500}}');
select public.pacote_criar((select conta from ids), (select cb from ids));
select throws_ok(
  format($$select public.paciente_excluir(%L, %L)$$, (select conta from ids), (select cb from ids)),
  'P0001', 'paciente_com_financeiro', 'paciente sem atendimento, mas com pacote vendido, não se exclui'
);
select public.configuracoes_gravar((select conta from ids), '{"vencimento_mensal_dia":5}');
select is(
  (select public.conta_ler((select conta from ids)) -> 'configuracoes' -> 'vencimento_mensal_dia'),
  '5'::jsonb, 'o dia de vencimento da mensalidade se configura'
);
select throws_ok(
  format($$select public.configuracoes_gravar(%L, '{"vencimento_mensal_dia":31}')$$, (select conta from ids)),
  '23514', null, 'e fica entre 1 e 28'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b7","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  format($$select * from public.cobrancas_listar(%L)$$, (select conta from ids)),
  'P0001', 'sem_acesso', 'outra conta não vê as cobranças'
);
select throws_ok('select * from public.cobrancas', '42501', null, 'tabela de cobranças não se lê direto');

select * from finish();
rollback;
