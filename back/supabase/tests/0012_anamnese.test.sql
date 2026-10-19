-- Anamnese: só o psicólogo do paciente, versões guardadas, leitura auditada.
-- (Versões e auditoria são conferidas como administrador: o papel do app não lê essas tabelas.)
begin;
select plan(18);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000ac', 'ana@anamnese.teste'),
  ('00000000-0000-0000-0000-0000000000bc', 'rec@anamnese.teste'),
  ('00000000-0000-0000-0000-0000000000cc', 'bia@anamnese.teste');
create temp table ids as select public.conta_criar('ana@anamnese.teste', 'Consultório Ana', 'Ana') as conta;
alter table ids add column p1 uuid, add column p2 uuid;
grant select, update on ids to authenticated;
-- Recepção na mesma conta: vê o paciente, não vê dado clínico.
insert into public.membros (conta_id, user_id, papeis)
select conta, '00000000-0000-0000-0000-0000000000bc', array['recepcao'] from ids;
select public.conta_criar('bia@anamnese.teste', 'Consultório Bia', 'Bia');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ac","role":"authenticated","aal":"aal1"}', true);

update ids set
  p1 = public.paciente_criar(conta, '{"nome":"Com Anamnese","consentimento":true,
         "anamnese":{"laudo":"sim","laudo_descricao":"TDAH, neuropediatra, 2024","medicacao":"sim",
                     "medicacoes":[{"nome":"Metilfenidato","dose":"10 mg","frequencia":"manhã","prescritor":"Dra. Lima"}]}}'),
  p2 = public.paciente_criar(conta, '{"nome":"Sem Anamnese","consentimento":true}');

select ok(
  (select j ->> 'laudo' = 'sim' and j -> 'medicacoes' -> 0 ->> 'nome' = 'Metilfenidato' and (j ->> 'versao')::int = 1
     from ids, public.anamnese_ler(ids.conta, ids.p1) j),
  'o cadastro já grava laudo e medicação da anamnese'
);
reset role;
select is((select count(*)::int from public.anamneses_versoes v join ids on v.paciente_id = ids.p1), 0,
  'a primeira gravação não deixa versão vazia no histórico');
set local role authenticated;
select ok(
  (select j = '{"pode_clinico": true}'::jsonb from ids, public.anamnese_ler(ids.conta, ids.p2) j),
  'paciente sem anamnese: lê vazio, sem erro'
);

-- ------------------------------------------------ versões
select public.anamnese_gravar((select conta from ids), (select p1 from ids), '{"laudo_descricao":"TDAH e dislexia, neuropediatra, 2024"}');
select is((select (public.anamnese_ler(conta, p1) ->> 'versao')::int from ids), 2, 'mudar o texto gera a versão 2');
reset role;
select is(
  (select v.dados ->> 'laudo_descricao' from public.anamneses_versoes v join ids on v.paciente_id = ids.p1 where v.versao = 1),
  'TDAH, neuropediatra, 2024', 'e a versão 1 fica guardada com o texto anterior'
);
set local role authenticated;
select public.anamnese_gravar((select conta from ids), (select p1 from ids), '{"laudo_descricao":"TDAH e dislexia, neuropediatra, 2024"}');
select is((select (public.anamnese_ler(conta, p1) ->> 'versao')::int from ids), 2, 'gravar igual não cria versão');
select public.anamnese_gravar((select conta from ids), (select p1 from ids), '{"rotina":"Estuda à tarde, 5º ano."}');
select ok(
  (select j ->> 'rotina' = 'Estuda à tarde, 5º ano.' and jsonb_array_length(j -> 'medicacoes') = 1
     from ids, public.anamnese_ler(ids.conta, ids.p1) j),
  'gravar um campo não apaga os outros'
);
select public.anamnese_gravar((select conta from ids), (select p1 from ids), '{"rotina":null}');
select is((select public.anamnese_ler(conta, p1) ->> 'rotina' from ids), null, 'null limpa o campo');

-- ------------------------------------------------ validação
select throws_ok(
  format($$select public.anamnese_gravar(%L, %L, '{"medicacoes":[{"nome":"X","cor":"azul"}]}')$$, (select conta from ids), (select p1 from ids)),
  'P0001', 'medicacoes_invalidas', 'medicação só com nome, dose, frequência e quem receitou'
);
select throws_ok(
  format($$select public.anamnese_gravar(%L, %L, '{"medicacoes":[{"dose":"10 mg"}]}')$$, (select conta from ids), (select p1 from ids)),
  'P0001', 'medicacoes_invalidas', 'medicação sem nome é recusada'
);
select throws_ok(
  format($$select public.anamnese_gravar(%L, %L, '{"laudo":"talvez"}')$$, (select conta from ids), (select p1 from ids)),
  '23514', null, 'laudo só sim, não ou não sabe'
);

-- ------------------------------------------------ auditoria e ficha
reset role;
select ok(
  (select count(*) > 0 from public.auditoria a join ids on a.paciente_id = ids.p1 where a.tabela = 'anamneses' and a.acao = 'ler'),
  'toda leitura da anamnese fica na auditoria'
);
set local role authenticated;
select is((select public.ficha_clinica(conta, p1) -> 'anamnese' ->> 'laudo' from ids), 'sim', 'a ficha exportada leva a anamnese');

-- ------------------------------------------------ quem não é o psicólogo do paciente
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000bc","role":"authenticated","aal":"aal1"}', true);
select is((select public.anamnese_ler(conta, p1) from ids), '{"pode_clinico": false}'::jsonb,
  'a recepção da mesma conta não lê a anamnese');
select throws_ok(
  format($$select public.anamnese_gravar(%L, %L, '{"rotina":"x"}')$$, (select conta from ids), (select p1 from ids)),
  'P0001', 'so_clinico', 'nem grava'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000cc","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  format($$select public.anamnese_ler(%L, %L)$$, (select conta from ids), (select p1 from ids)),
  'P0001', 'sem_acesso', 'outra conta não chega nem perto'
);
select throws_ok('select * from public.anamneses', '42501', null, 'tabela da anamnese não se lê direto');

-- ------------------------------------------------ excluir cadastro feito por engano
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ac","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  format($$select public.paciente_excluir(%L, %L)$$, (select conta from ids), (select p1 from ids)),
  'P0001', 'paciente_com_anamnese', 'paciente com anamnese não se exclui: a anamnese é prontuário'
);

select * from finish();
rollback;
