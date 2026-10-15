-- Observações: versão guardada, trava de 30 dias, adendo, sigilo e auditoria.
begin;
select plan(26);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a6', 'ana@obs.teste'),
  ('00000000-0000-0000-0000-0000000000b6', 'bia@obs.teste'),
  ('00000000-0000-0000-0000-0000000000c6', 'rec@obs.teste');
create temp table ids as select public.conta_criar('ana@obs.teste', 'Consultório Ana', 'Ana') as conta;
alter table ids add column p uuid, add column ontem uuid, add column antiga uuid, add column futura uuid;
grant select, update on ids to authenticated;
select public.conta_criar('bia@obs.teste', 'Consultório Bia', 'Bia');
-- recepção da conta da Ana: membro, mas não é a psicóloga do paciente
insert into public.membros (conta_id, user_id, papeis)
  select conta, '00000000-0000-0000-0000-0000000000c6', array['recepcao'] from ids;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated","aal":"aal1"}', true);

update ids set p = public.paciente_criar(conta, '{"nome":"Paciente Obs","consentimento":true}');
update ids set
  ontem = public.sessao_criar(conta, jsonb_build_object('paciente_id', p, 'inicio', now() - interval '1 day',
            'duracao_min', 50, 'modalidade', 'presencial')),
  antiga = public.sessao_criar(conta, jsonb_build_object('paciente_id', p, 'inicio', now() - interval '40 days',
            'duracao_min', 50, 'modalidade', 'presencial')),
  futura = public.sessao_criar(conta, jsonb_build_object('paciente_id', p, 'inicio', now() + interval '3 days',
            'duracao_min', 50, 'modalidade', 'online'));
select public.sessao_status((select conta from ids), (select ontem from ids), 'realizada');
select public.sessao_status((select conta from ids), (select antiga from ids), 'realizada');

-- pendência antes da observação
select ok(
  (select public.pendencias_observacao((select conta from ids)) @> jsonb_build_array(jsonb_build_object('id', (select ontem from ids)))),
  'sessão realizada sem observação aparece nas pendências'
);

select lives_ok(
  format($$select public.observacao_gravar(%L, %L, 'Primeira versão.')$$, (select conta from ids), (select ontem from ids)),
  'grava a observação de sessão realizada'
);
select is(
  (select public.observacao_ler((select conta from ids), (select ontem from ids)) ->> 'texto'),
  'Primeira versão.', 'e lê de volta'
);
select ok(
  not (select public.pendencias_observacao((select conta from ids)) @> jsonb_build_array(jsonb_build_object('id', (select ontem from ids)))),
  'e sai das pendências'
);

select lives_ok(
  format($$select public.observacao_gravar(%L, %L, 'Segunda versão.')$$, (select conta from ids), (select ontem from ids)),
  'corrige dentro do prazo'
);
select is(
  (select public.observacao_ler((select conta from ids), (select ontem from ids)) -> 'versao'),
  '2'::jsonb, 'a correção vira a versão 2'
);
select is(
  (select public.observacao_ler((select conta from ids), (select ontem from ids)) -> 'versoes' -> 0 ->> 'texto'),
  'Primeira versão.', 'e a versão anterior fica guardada'
);
select public.observacao_gravar((select conta from ids), (select ontem from ids), 'Segunda versão.');
select is(
  (select jsonb_array_length(public.observacao_ler((select conta from ids), (select ontem from ids)) -> 'versoes')),
  1, 'gravar o mesmo texto não cria versão'
);

select throws_ok(
  format($$select public.observacao_gravar(%L, %L, '   ')$$, (select conta from ids), (select ontem from ids)),
  'P0001', 'observacao_vazia', 'observação vazia é recusada'
);
select throws_ok(
  format($$select public.observacao_gravar(%L, %L, 'x')$$, (select conta from ids), (select futura from ids)),
  'P0001', 'sessao_sem_registro', 'sessão que não aconteceu não recebe observação'
);

-- trava de 30 dias
select throws_ok(
  format($$select public.observacao_gravar(%L, %L, 'tarde demais')$$, (select conta from ids), (select antiga from ids)),
  'P0001', 'observacao_travada', 'depois de 30 dias a observação trava'
);
select is(
  (select public.observacao_ler((select conta from ids), (select antiga from ids)) -> 'editavel'),
  'false'::jsonb, 'e a leitura diz que não é editável'
);
select lives_ok(
  format($$select public.adendo_criar(%L, %L, 'Adendo depois da trava.')$$, (select conta from ids), (select antiga from ids)),
  'depois da trava entra adendo'
);
select is(
  (select public.observacao_ler((select conta from ids), (select antiga from ids)) -> 'adendos' -> 0 ->> 'texto'),
  'Adendo depois da trava.', 'e o adendo aparece na leitura'
);
select throws_ok(
  format($$select public.adendo_criar(%L, %L, 'cedo')$$, (select conta from ids), (select ontem from ids)),
  'P0001', 'observacao_editavel', 'dentro do prazo não é adendo, é correção'
);

-- histórico e exportação
select is(
  (select e ->> 'observacao' from jsonb_array_elements(public.historico_paciente((select conta from ids), (select p from ids))) e
    where e ->> 'id' = (select ontem from ids)::text),
  'Segunda versão.', 'o histórico traz a observação atual'
);
select ok(
  not (select public.historico_paciente((select conta from ids), (select p from ids)) @> jsonb_build_array(jsonb_build_object('id', (select futura from ids)))),
  'o histórico não traz sessão futura'
);
select is(
  (select jsonb_array_length(public.ficha_clinica((select conta from ids), (select p from ids)) -> 'sessoes')),
  2, 'a ficha exportada traz as sessões que já aconteceram'
);

reset role;
select ok(
  (select count(*) > 0 from public.auditoria where acao = 'ler' and tabela = 'observacoes' and paciente_id = (select p from ids)),
  'ler observação fica na auditoria'
);
select ok(
  (select count(*) = 1 from public.auditoria where acao = 'exportar' and paciente_id = (select p from ids)),
  'exportar a ficha fica na auditoria'
);
set local role authenticated;

select ok(
  (select public.paciente_acessos((select conta from ids), (select p from ids)) @> '[{"acao":"exportar","quem":"Ana"}]'::jsonb),
  'a lista de acessos mostra quem exportou'
);

select throws_ok('select * from public.observacoes', '42501', null, 'tabela de observações não se lê direto');

-- recepção da mesma conta: vê a agenda, não o prontuário
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c6","role":"authenticated","aal":"aal1"}', true);
select is(
  (select public.observacao_ler((select conta from ids), (select ontem from ids))),
  '{"pode_clinico":false}'::jsonb, 'quem não é o psicólogo do paciente não lê a observação'
);
select throws_ok(
  format($$select public.observacao_gravar(%L, %L, 'x')$$, (select conta from ids), (select ontem from ids)),
  'P0001', 'so_clinico', 'nem grava'
);
select is(
  (select e ->> 'observacao' from jsonb_array_elements(public.historico_paciente((select conta from ids), (select p from ids))) e
    where e ->> 'id' = (select ontem from ids)::text),
  null, 'e o histórico vem sem o texto'
);

-- outra conta
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b6","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  format($$select public.observacao_ler(%L, %L)$$, (select conta from ids), (select ontem from ids)),
  'P0001', 'sem_acesso', 'outra conta não lê'
);

select * from finish();
rollback;
