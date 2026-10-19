-- Papéis aplicados de verdade: a recepção cadastra e agenda, mas o paciente e a
-- sessão são do psicólogo, e só o psicólogo do paciente lê dado clínico.
begin;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@papeis.teste'),
  ('00000000-0000-0000-0000-0000000000a2', 'rec@papeis.teste'),
  ('00000000-0000-0000-0000-0000000000a3', 'caio@papeis.teste');
create temp table ids as select public.conta_criar('ana@papeis.teste', 'Consultório Ana', 'Ana') as conta;
alter table ids add column ana uuid, add column rec uuid, add column caio uuid,
  add column p1 uuid, add column p2 uuid, add column s1 uuid;
update ids set ana = (select m.id from public.membros m where m.conta_id = ids.conta and m.user_id = '00000000-0000-0000-0000-0000000000a1');
insert into public.membros (conta_id, user_id, papeis)
select conta, '00000000-0000-0000-0000-0000000000a2', array['recepcao'] from ids;
update ids set rec = (select m.id from public.membros m where m.conta_id = ids.conta and m.user_id = '00000000-0000-0000-0000-0000000000a2');
grant select, update on ids to authenticated;

set local role authenticated;

-- ------------------------------------------------ recepção cadastra e agenda
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}', true);
update ids set p1 = public.paciente_criar(conta, '{"nome":"Cadastrado pela Recepcao","consentimento":true}');
reset role;
select is((select profissional_id from public.pacientes where id = (select p1 from ids)), (select ana from ids),
  'paciente cadastrado pela recepção é do único psicólogo da conta');
set local role authenticated;

update ids set s1 = public.sessao_criar(conta, jsonb_build_object('paciente_id', p1, 'inicio', now() + interval '2 days',
  'duracao_min', 50, 'modalidade', 'presencial', 'repetir_semanal', true));
reset role;
select is((select profissional_id from public.sessoes where id = (select s1 from ids)), (select ana from ids),
  'sessão agendada pela recepção é com o psicólogo do paciente');
select is((select r.profissional_id from public.recorrencias r join public.sessoes s on s.recorrencia_id = r.id
            where s.id = (select s1 from ids)), (select ana from ids),
  'e a repetição também');
set local role authenticated;

select ok(not public.pode_clinico((select p1 from ids)), 'a recepção não lê dado clínico');
select is((select public.anamnese_ler(conta, p1) from ids), '{"pode_clinico": false}'::jsonb, 'nem a anamnese');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}', true);
select ok(public.pode_clinico((select p1 from ids)), 'a psicóloga do paciente lê');

-- ------------------------------------------------ profissional sem o papel psicólogo
reset role;
update public.pacientes set profissional_id = (select rec from ids) where id = (select p1 from ids);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}', true);
select ok(not public.pode_clinico((select p1 from ids)),
  'ser o profissional do paciente sem o papel psicólogo não abre o prontuário');

-- ------------------------------------------------ conta com dois psicólogos
reset role;
insert into public.membros (conta_id, user_id, papeis)
select conta, '00000000-0000-0000-0000-0000000000a3', array['psicologo'] from ids;
update ids set caio = (select m.id from public.membros m where m.conta_id = ids.conta and m.user_id = '00000000-0000-0000-0000-0000000000a3');
set local role authenticated;
select throws_ok(
  format($$select public.paciente_criar(%L, '{"nome":"Sem Escolha","consentimento":true}')$$, (select conta from ids)),
  'P0001', 'profissional_obrigatorio', 'com dois psicólogos, a recepção escolhe quem atende'
);
select throws_ok(
  format($$select public.paciente_criar(%L, jsonb_build_object('nome', 'Escolha Errada', 'consentimento', true, 'profissional_id', %L))$$,
    (select conta from ids), (select rec from ids)),
  'P0001', 'profissional_invalido', 'e só pode escolher um psicólogo'
);
update ids set p2 = public.paciente_criar(conta, jsonb_build_object('nome', 'Do Caio', 'consentimento', true, 'profissional_id', caio));
reset role;
select is((select profissional_id from public.pacientes where id = (select p2 from ids)), (select caio from ids),
  'escolhendo o psicólogo, o paciente é dele');

select * from finish();
rollback;
