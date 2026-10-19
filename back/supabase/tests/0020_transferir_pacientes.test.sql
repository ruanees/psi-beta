-- Transferir pacientes: só o titular, só para um psicólogo que entra, sem
-- choque de agenda. O paciente, as sessões futuras e a repetição vão junto;
-- o passado fica com quem atendeu; o clínico passa a quem recebe.
begin;
select plan(21);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000004a1', 'ana@transferir.teste'),
  ('00000000-0000-0000-0000-0000000004b1', 'bia@transferir.teste'),
  ('00000000-0000-0000-0000-0000000004c1', 'caio@transferir.teste');

create temp table ids as
  select public.conta_criar('ana@transferir.teste', 'Consultório Ana', 'Ana') as conta,
         null::uuid as ana, null::uuid as bia, null::uuid as caio,
         null::uuid as p1, null::uuid as p2, null::uuid as pa;
update ids set ana = (select m.id from public.membros m where m.conta_id = ids.conta);
insert into public.membros (conta_id, user_id, papeis)
  select conta, '00000000-0000-0000-0000-0000000004b1', array['psicologo'] from ids;
insert into public.membros (conta_id, user_id, papeis)
  select conta, '00000000-0000-0000-0000-0000000004c1', array['recepcao'] from ids;
update ids set
  bia = (select m.id from public.membros m where m.user_id = '00000000-0000-0000-0000-0000000004b1'),
  caio = (select m.id from public.membros m where m.user_id = '00000000-0000-0000-0000-0000000004c1');
insert into public.profissionais (membro_id, nome) select bia, 'Bia' from ids;
grant select, update on ids to authenticated;

create function pg_temp.como(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
grant execute on function pg_temp.como(text) to authenticated;
-- Daqui a `dias`, às 13h (UTC): longe o bastante para ser futuro.
create function pg_temp.em(dias int) returns text language sql as $$
  select (date_trunc('day', now()) + make_interval(days => dias, hours => 13))::text;
$$;
grant execute on function pg_temp.em(int) to authenticated;

set local role authenticated;

-- Bia atende p1 (toda semana) e p2 (uma vez, no dia 2); Ana tem a própria paciente no mesmo horário do dia 2.
select pg_temp.como('00000000-0000-0000-0000-0000000004b1');
update ids set
  p1 = public.paciente_criar(conta, '{"nome":"Paciente Um","consentimento":true,"queixa_principal":"sigilo"}'),
  p2 = public.paciente_criar(conta, '{"nome":"Paciente Dois","consentimento":true}');
select public.sessao_criar(conta, format('{"paciente_id":"%s","inicio":"%s","duracao_min":50,"modalidade":"presencial","repetir_semanal":true}',
  p1, pg_temp.em(3))::jsonb) from ids;
select public.sessao_criar(conta, format('{"paciente_id":"%s","inicio":"%s","duracao_min":50,"modalidade":"online"}',
  p2, pg_temp.em(2))::jsonb) from ids;
select pg_temp.como('00000000-0000-0000-0000-0000000004a1');
update ids set pa = public.paciente_criar(conta, '{"nome":"Paciente da Ana","consentimento":true}');
select public.sessao_criar(conta, format('{"paciente_id":"%s","inicio":"%s","duracao_min":50,"modalidade":"presencial"}',
  pa, pg_temp.em(2))::jsonb) from ids;

-- Uma sessão que a Bia já atendeu.
reset role;
insert into public.sessoes (conta_id, paciente_id, profissional_id, inicio, fim, modalidade, status)
  select conta, p1, bia, now() - interval '7 days', now() - interval '7 days' + interval '50 minutes', 'presencial', 'realizada'
    from ids;
set local role authenticated;

-- ------------------------------------------------------------ só o titular
select pg_temp.como('00000000-0000-0000-0000-0000000004b1');
select throws_ok(format('select public.equipe_psicologos(%L)', (select conta from ids)),
  'P0001', 'so_titular', 'a psicóloga não vê a equipe para transferir');
select pg_temp.como('00000000-0000-0000-0000-0000000004c1');
select throws_ok(format($$select public.pacientes_transferir(%L, '{"de":"%s","para":"%s"}')$$,
    (select conta from ids), (select bia from ids), (select ana from ids)),
  'P0001', 'so_titular', 'nem a recepção transfere');

-- ------------------------------------------------------------ titular
select pg_temp.como('00000000-0000-0000-0000-0000000004a1');
select is(
  (select (x ->> 'pacientes')::int from jsonb_array_elements(public.equipe_psicologos((select conta from ids))) x
    where x ->> 'nome' = 'Bia' and (x ->> 'ativo')::boolean),
  2, 'a titular vê a Bia, ativa, com dois pacientes');
select is(jsonb_array_length(public.pacientes_do_psicologo((select conta from ids), (select bia from ids))), 2,
  'e quais são');

select throws_ok(format($$select public.pacientes_transferir(%L, '{"de":"%s","para":"%s"}')$$,
    (select conta from ids), (select bia from ids), (select caio from ids)),
  'P0001', 'destino_invalido', 'recepção não recebe paciente');
select throws_ok(format($$select public.pacientes_transferir(%L, '{"de":"%s","para":"%s"}')$$,
    (select conta from ids), (select bia from ids), (select bia from ids)),
  'P0001', 'destino_invalido', 'nem a própria Bia');
select throws_ok(format($$select public.pacientes_transferir(%L, '{"de":"%s","para":"%s","pacientes":["%s"]}')$$,
    (select conta from ids), (select bia from ids), (select ana from ids), (select pa from ids)),
  'P0001', 'paciente_de_outro', 'paciente que não é de quem entrega é recusado');
select throws_ok(format($$select public.pacientes_transferir(%L, '{"de":"%s","para":"%s","pacientes":["%s"]}')$$,
    (select conta from ids), (select bia from ids), (select ana from ids), (select p2 from ids)),
  'P0001', 'agenda_em_choque', 'sessão futura no mesmo horário de uma da Ana é recusada antes de mexer');
select throws_ok(format($$select public.pacientes_transferir(%L, '{"de":"%s","para":"%s"}')$$,
    (select conta from ids), gen_random_uuid(), (select ana from ids)),
  'P0001', 'nao_encontrado', 'quem entrega precisa ser do consultório');

select is(
  (select public.pacientes_transferir(conta, format('{"de":"%s","para":"%s","pacientes":["%s"],"motivo":"Bia saiu"}', bia, ana, p1)::jsonb)
     from ids),
  1, 'transferir p1 para a Ana');
select is(public.pode_clinico((select p1 from ids)), true, 'a Ana passa a ler o clínico de p1');
select pg_temp.como('00000000-0000-0000-0000-0000000004b1');
select is(public.pode_clinico((select p1 from ids)), false, 'e a Bia deixa de ler');

reset role;
select ok(
  (select count(*) > 0 and bool_and(s.profissional_id = ids.ana)
     from public.sessoes s join ids on s.paciente_id = ids.p1
    where s.inicio >= now() and s.status in ('agendada', 'confirmada')),
  'as sessões futuras de p1 vão para a Ana');
select is(
  (select s.profissional_id from public.sessoes s join ids on s.paciente_id = ids.p1 where s.status = 'realizada'),
  (select bia from ids), 'a sessão que a Bia atendeu continua dela');
select is((select r.profissional_id from public.recorrencias r join ids on r.paciente_id = ids.p1),
  (select ana from ids), 'a repetição semanal vai junto');
select is((select pa.profissional_id from public.pacientes pa join ids on pa.id = ids.p2),
  (select bia from ids), 'p2 não foi pedido e fica com a Bia');
select is(
  (select count(*)::int from public.auditoria a join ids on a.paciente_id = ids.p1
    where a.quem = '00000000-0000-0000-0000-0000000004a1' and a.tabela = 'pacientes' and a.acao = 'editar'),
  1, 'a transferência fica na auditoria, por paciente');

-- A Bia sai do consultório; a sessão da Ana no dia 2 é desmarcada.
update public.membros set removido_em = now() where id = (select bia from ids);
update public.sessoes set status = 'cancelada' where paciente_id = (select pa from ids);
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000004a1');

select ok(
  (select t ->> 'motivo' = 'Bia saiu' and t ->> 'de' = 'Bia' and t ->> 'para' = 'Ana' and t ->> 'paciente' = 'Paciente Um'
     from jsonb_array_elements(public.transferencias_listar((select conta from ids))) t),
  'a lista de transferências mostra quem, de quem, para quem e por quê');
select ok(
  (select not (x ->> 'ativo')::boolean and (x ->> 'pacientes')::int = 1
     from jsonb_array_elements(public.equipe_psicologos((select conta from ids))) x where x ->> 'nome' = 'Bia'),
  'a Bia que saiu aparece sem poder receber, com o paciente que ficou');
select is(
  (select public.pacientes_transferir(conta, format('{"de":"%s","para":"%s"}', bia, ana)::jsonb) from ids),
  1, 'sem lista, vão todos os pacientes de quem saiu');
select throws_ok(format($$select public.pacientes_transferir(%L, '{"de":"%s","para":"%s"}')$$,
    (select conta from ids), (select bia from ids), (select ana from ids)),
  'P0001', 'nada_a_transferir', 'e depois não sobra nada');

select * from finish();
rollback;
