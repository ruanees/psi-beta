-- Excluir paciente: só sem atendimento registrado (guarda mínima do prontuário).
begin;
select plan(7);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a3', 'ana@excluir.teste');
create temp table ids as select public.conta_criar('ana@excluir.teste', 'Consultório Ana', 'Ana') as conta;
alter table ids add column engano uuid, add column atendido uuid;
grant select, update on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated","aal":"aal1"}', true);

update ids set
  engano = public.paciente_criar(conta,
    format('{"nome":"Cadastro Errado","nascimento":"%s","consentimento":true}', (current_date - interval '10 years')::date)::jsonb,
    '[{"nome":"Mãe"}]'),
  atendido = public.paciente_criar(conta, '{"nome":"Paciente Atendido","consentimento":true}');

-- cadastro por engano, com sessão futura repetida
select public.sessao_criar((select conta from ids), jsonb_build_object(
  'paciente_id', (select engano from ids), 'inicio', now() + interval '2 days', 'duracao_min', 50,
  'modalidade', 'presencial', 'repetir_semanal', true));

-- paciente com uma sessão realizada no passado
select public.sessao_status((select conta from ids),
  public.sessao_criar((select conta from ids), jsonb_build_object(
    'paciente_id', (select atendido from ids), 'inicio', now() - interval '3 days', 'duracao_min', 50, 'modalidade', 'online')),
  'realizada');

select lives_ok(
  format($$select public.paciente_excluir(%L, %L)$$, (select conta from ids), (select engano from ids)),
  'paciente sem atendimento é excluído'
);
select throws_ok(
  format($$select public.paciente_ler(%L, %L)$$, (select conta from ids), (select engano from ids)),
  'P0001', 'nao_encontrado', 'e não aparece mais'
);
select is(
  (select count(*)::int from public.agenda_listar((select conta from ids), now(), now() + interval '60 days')),
  0, 'as sessões futuras e a repetição saíram junto'
);
select ok(
  (select count(*) = 1 from public.auditoria where acao = 'excluir' and paciente_id = (select engano from ids)),
  'a exclusão ficou na auditoria'
);
select throws_ok(
  format($$select public.paciente_excluir(%L, %L)$$, (select conta from ids), (select atendido from ids)),
  'P0001', 'paciente_com_atendimento', 'paciente com sessão realizada não é excluído'
);
select is(
  (select public.paciente_ler((select conta from ids), (select atendido from ids)) ->> 'nome'),
  'Paciente Atendido', 'e continua lá'
);
select throws_ok('select public.paciente_excluir(gen_random_uuid(), gen_random_uuid())', 'P0001', 'sem_acesso',
  'conta de outro é recusada');

select * from finish();
rollback;
