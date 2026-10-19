-- Correções de banco da auditoria: anamnese guardada, repetição que guarda o
-- histórico, agenda com limite inferior e privilégios padrão fechados.
begin;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000ae', 'ana@auditoria.teste');
create temp table ids as select public.conta_criar('ana@auditoria.teste', 'Consultório Ana', 'Ana') as conta;
alter table ids add column com_anamnese uuid, add column sem_anamnese uuid, add column rp uuid,
  add column r1 uuid, add column longa uuid, add column online uuid;
grant select, update on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ae","role":"authenticated","aal":"aal1"}', true);

update ids set
  com_anamnese = public.paciente_criar(conta, '{"nome":"Com Anamnese","consentimento":true,"anamnese":{"laudo":"nao"}}'),
  sem_anamnese = public.paciente_criar(conta, '{"nome":"Sem Anamnese","consentimento":true}'),
  rp = public.paciente_criar(conta, '{"nome":"Repeticao Historico","consentimento":true}');

-- ------------------------------------------------ B1: anamnese
select throws_ok(
  format($$select public.paciente_excluir(%L, %L)$$, (select conta from ids), (select com_anamnese from ids)),
  'P0001', 'paciente_com_anamnese', 'paciente com anamnese não se exclui'
);
select ok(
  (select j ->> 'laudo' = 'nao' from ids, public.anamnese_ler(ids.conta, ids.com_anamnese) j),
  'e a anamnese continua lá'
);
select lives_ok(
  format($$select public.paciente_excluir(%L, %L)$$, (select conta from ids), (select sem_anamnese from ids)),
  'cadastro por engano, sem anamnese, ainda se exclui'
);
reset role;
select is(
  (select confdeltype from pg_constraint where conname = 'anamneses_paciente_id_fkey'), 'r',
  'nem apagando o paciente direto a anamnese sai em cascata'
);
set local role authenticated;

-- ------------------------------------------------ B4: repetição guarda o que aconteceu
-- Três semanas no passado e as futuras: uma realizada, uma falta, uma desmarcada e o resto agendado.
update ids set r1 = public.sessao_criar(conta, jsonb_build_object('paciente_id', rp, 'inicio', now() - interval '22 days',
  'duracao_min', 50, 'modalidade', 'presencial', 'repetir_semanal', true));
select public.sessao_status((select conta from ids), (select r1 from ids), 'realizada');
select public.sessao_status((select conta from ids),
  (select s.id from ids, public.sessoes_do_paciente(ids.conta, ids.rp) s order by s.inicio offset 1 limit 1), 'falta');
-- Aviso dois dias antes: desmarcada dentro do prazo (em cima da hora viraria falta).
select public.sessao_desmarcar((select conta from ids),
  (select s.id from ids, public.sessoes_do_paciente(ids.conta, ids.rp) s order by s.inicio offset 2 limit 1),
  now() - interval '10 days');
select is(
  (select public.sessao_excluir(conta, r1, 'repeticao') ->> 'mantidas' from ids), '3',
  'excluir a repetição mantém a realizada, a falta e a desmarcada, mesmo sem observação'
);
select is(
  (select array_agg(s.status order by s.inicio) from ids, public.sessoes_do_paciente(ids.conta, ids.rp) s),
  array['realizada', 'falta', 'cancelada'],
  'e só as agendadas saem'
);
select is(
  (select count(*)::int from ids, public.agenda_listar(ids.conta, now() + interval '1 day', now() + interval '60 days') a
    where a.paciente_id = ids.rp), 0,
  'a repetição para de gerar sessões'
);

-- ------------------------------------------------ B7: agenda com limite inferior
-- Sessão de 4 horas que começou antes do período e termina dentro dele continua na agenda.
update ids set longa = public.sessao_criar(conta, jsonb_build_object('paciente_id', rp, 'inicio', date_trunc('hour', now()) + interval '10 days',
  'duracao_min', 240, 'modalidade', 'presencial'));
select ok(
  exists (select 1 from ids, public.agenda_listar(ids.conta, date_trunc('hour', now()) + interval '10 days 3 hours',
    date_trunc('hour', now()) + interval '11 days') a where a.id = ids.longa),
  'sessão que atravessa o início do período aparece'
);
select ok(
  not exists (select 1 from ids, public.agenda_listar(ids.conta, date_trunc('hour', now()) + interval '10 days 4 hours',
    date_trunc('hour', now()) + interval '11 days') a where a.id = ids.longa),
  'e a que terminou antes do período, não'
);
-- Online em andamento ainda é a próxima.
update ids set online = public.sessao_criar(conta, jsonb_build_object('paciente_id', rp, 'inicio', now() - interval '30 minutes',
  'duracao_min', 50, 'modalidade', 'online'));
select is(
  (select (public.proxima_online(conta) ->> 'id')::uuid from ids), (select online from ids),
  'sessão online em andamento continua como a próxima'
);

-- ------------------------------------------------ privilégios padrão
reset role;
create table public.tabela_nova_teste (id int);
create function public.funcao_nova_teste() returns int language sql as 'select 1';
select ok(
  not has_table_privilege('anon', 'public.tabela_nova_teste', 'select')
  and not has_table_privilege('authenticated', 'public.tabela_nova_teste', 'select'),
  'tabela nova em public nasce fechada para anon e authenticated'
);
select ok(
  not has_function_privilege('anon', 'public.funcao_nova_teste()', 'execute')
  and not has_function_privilege('authenticated', 'public.funcao_nova_teste()', 'execute'),
  'função nova em public nasce sem execute'
);

select * from finish();
rollback;
