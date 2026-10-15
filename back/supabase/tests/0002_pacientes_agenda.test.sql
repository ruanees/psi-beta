-- Prova da Fase 1: pacientes, busca, responsáveis, agenda, repetição e a regra da falta.
begin;
select plan(31);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@fase1.teste'),
  ('00000000-0000-0000-0000-0000000000b1', 'bruno@fase1.teste');

create temp table ids as
  select public.conta_criar('ana@fase1.teste', 'Consultório Ana', 'Ana')       as conta_a,
         public.conta_criar('bruno@fase1.teste', 'Consultório Bruno', 'Bruno') as conta_b;
alter table ids add column paciente uuid, add column menor uuid, add column sessao uuid,
  add column repete uuid, add column outra uuid;
grant select, update on ids to authenticated;

-- Amanhã às 14h e 15h no fuso do consultório, para não depender da hora em que a prova roda.
create temp table hora as
  select ((now() at time zone 'America/Sao_Paulo')::date + 2 + time '14:00') at time zone 'America/Sao_Paulo' as h14;
grant select on hora to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}', true);

-- ------------------------------------------------------------ pacientes
select throws_ok(
  format($$select public.paciente_criar(%L, '{"nome":"Sem Consentimento"}')$$, (select conta_a from ids)),
  'P0001', 'consentimento', 'paciente sem consentimento LGPD é recusado'
);

update ids set paciente = public.paciente_criar(conta_a,
  '{"nome":"João Pedro Araújo","telefone":"11999990000","queixa_principal":"Ansiedade no trabalho","consentimento":true}');
select isnt((select paciente from ids), null, 'paciente adulto criado');

select throws_ok(
  format($$select public.paciente_criar(%L, '{"nome":"Lia Menor","nascimento":"%s","consentimento":true}')$$,
         (select conta_a from ids), (current_date - interval '9 years')::date),
  'P0001', 'menor_sem_responsavel', 'menor sem responsável é recusado'
);

update ids set menor = public.paciente_criar(conta_a,
  format('{"nome":"Lia Menor","nascimento":"%s","consentimento":true}', (current_date - interval '9 years')::date)::jsonb,
  '[{"nome":"Marta Mãe","parentesco":"Mãe","financeiro":true}]');
select isnt((select menor from ids), null, 'menor com responsável é aceito');

select throws_ok(
  format($$select public.responsavel_remover(%L, %L, (select (public.paciente_ler(%L, %L) -> 'responsaveis' -> 0 ->> 'id')::uuid))$$,
         (select conta_a from ids), (select menor from ids), (select conta_a from ids), (select menor from ids)),
  'P0001', 'menor_sem_responsavel', 'remover o último responsável de um menor é recusado'
);

-- busca
select is((select count(*)::int from public.pacientes_listar((select conta_a from ids), 'joao')), 1,
  'busca sem acento acha "João"');
select is((select count(*)::int from public.pacientes_listar((select conta_a from ids), 'Joao Pedor')), 1,
  'busca tolera erro de digitação');
select is((select nome from public.pacientes_listar((select conta_a from ids), 'marta')), 'Lia Menor',
  'busca pelo nome do responsável acha o paciente');
select is((select count(*)::int from public.pacientes_listar((select conta_a from ids))), 2, 'lista sem busca traz os dois');

-- dado clínico
select is((select public.paciente_ler((select conta_a from ids), (select paciente from ids)) ->> 'queixa_principal'),
  'Ansiedade no trabalho', 'o psicólogo do paciente lê a queixa principal');
select ok((select count(*) > 0 from public.auditoria where acao = 'ler' and paciente_id = (select paciente from ids)),
  'a leitura clínica ficou na auditoria');
select throws_ok('select * from public.pacientes', '42501', null, 'leitura direta da tabela é recusada');

-- ------------------------------------------------------------ agenda
update ids set sessao = public.sessao_criar(conta_a, jsonb_build_object(
  'paciente_id', paciente, 'inicio', (select h14 from hora), 'duracao_min', 50, 'modalidade', 'presencial'));
select isnt((select sessao from ids), null, 'sessão avulsa criada');

select throws_ok(
  format($$select public.sessao_criar(%L, '{"paciente_id":"%s","inicio":"%s","duracao_min":50,"modalidade":"online"}')$$,
         (select conta_a from ids), (select menor from ids), (select h14 from hora) + interval '30 minutes'),
  '23P01', null, 'duas sessões no mesmo horário do profissional são recusadas pelo banco'
);

select is(
  (public.sessao_desmarcar((select conta_a from ids), (select sessao from ids), (select h14 from hora) - interval '30 hours', true)) ->> 'resultado',
  'cancelada', 'aviso com 30 h (prazo 24 h) vira cancelada'
);
select is(
  (public.sessao_desmarcar((select conta_a from ids), (select sessao from ids), (select h14 from hora) - interval '3 hours', true)) ->> 'resultado',
  'falta', 'aviso com 3 h vira falta'
);
select is((select status from public.agenda_listar((select conta_a from ids), (select h14 from hora) - interval '1 day', (select h14 from hora) + interval '1 day') where id = (select sessao from ids)),
  'agendada', 'simular não muda nada');

select lives_ok(
  format($$select public.configuracoes_gravar(%L, '{"aviso_minimo_horas":6}')$$, (select conta_a from ids)),
  'prazo de aviso trocado para 6 h'
);
select is(
  (public.sessao_desmarcar((select conta_a from ids), (select sessao from ids), (select h14 from hora) - interval '8 hours')) ->> 'resultado',
  'cancelada', 'com prazo de 6 h, aviso de 8 h vira cancelada'
);

select lives_ok(
  format($$select public.sessao_criar(%L, '{"paciente_id":"%s","inicio":"%s","duracao_min":50,"modalidade":"online"}')$$,
         (select conta_a from ids), (select menor from ids), (select h14 from hora) + interval '30 minutes'),
  'sessão desmarcada libera o horário'
);

select throws_ok(
  format($$select public.sessao_status(%L, %L, 'realizada')$$, (select conta_a from ids),
         (select id from public.agenda_listar((select conta_a from ids), (select h14 from hora), (select h14 from hora) + interval '2 hours') where status = 'agendada' limit 1)),
  'P0001', 'sessao_futura', 'presença em sessão futura é recusada'
);

-- repetição semanal
update ids set repete = public.sessao_criar(conta_a, jsonb_build_object(
  'paciente_id', paciente, 'inicio', (select h14 from hora) + interval '1 day 2 hours', 'duracao_min', 50,
  'modalidade', 'presencial', 'repetir_semanal', true));
select cmp_ok(
  (select count(*)::int from public.sessoes_do_paciente((select conta_a from ids), (select paciente from ids)) where recorrencia_id is not null),
  '>=', 8, 'repetição semanal gera as próximas 8 semanas'
);
select cmp_ok(
  (select count(*)::int from public.agenda_listar((select conta_a from ids), (select h14 from hora) + interval '70 days', (select h14 from hora) + interval '100 days')),
  '>=', 4, 'abrir a agenda mais à frente estende a repetição (30 dias, 4 ou 5 semanas)'
);

update ids set outra = public.sessao_alterar(conta_a,
  (select id from public.sessoes_do_paciente(conta_a, paciente) where recorrencia_id is not null order by inicio offset 2 limit 1),
  jsonb_build_object('inicio', (select h14 from hora) + interval '15 days 4 hours'), 'proximas');
select is(
  (select count(distinct recorrencia_id)::int from public.sessoes_do_paciente((select conta_a from ids), (select paciente from ids)) where recorrencia_id is not null),
  2, '"esta e as próximas" encerra a repetição antiga e começa outra'
);

select cmp_ok(
  public.recorrencia_encerrar((select conta_a from ids), (select outra from ids)), '>', 0, 'encerrar repetição tira as próximas'
);

select is((public.painel_inicio((select conta_a from ids)) ->> 'pacientes_ativos')::int, 2, 'painel conta os pacientes ativos');

select lives_ok(
  format($$select public.paciente_situacao(%L, %L, 'alta')$$, (select conta_a from ids), (select menor from ids)),
  'alta do paciente'
);
select is(
  (select count(*)::int from public.sessoes_do_paciente((select conta_a from ids), (select menor from ids)) where status in ('agendada', 'confirmada')),
  0, 'alta desmarca as sessões futuras'
);
select throws_ok(
  format($$select public.sessao_criar(%L, '{"paciente_id":"%s","inicio":"%s","duracao_min":50,"modalidade":"online"}')$$,
         (select conta_a from ids), (select menor from ids), (select h14 from hora) + interval '5 days'),
  'P0001', 'paciente_inativo', 'paciente de alta não recebe sessão nova'
);

-- ------------------------------------------------------------ isolamento
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  format($$select * from public.pacientes_listar(%L)$$, (select conta_a from ids)),
  'P0001', 'sem_acesso', 'Bruno não lista os pacientes da Ana'
);
select throws_ok(
  format($$select public.paciente_ler(%L, %L)$$, (select conta_b from ids), (select paciente from ids)),
  'P0001', 'nao_encontrado', 'paciente da Ana não aparece pela conta do Bruno'
);

select * from finish();
rollback;
