-- Repetição quinzenal: o horário de sempre a cada duas semanas.
begin;
select plan(11);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a5', 'ana@quinzenal.teste');
create temp table ids as select public.conta_criar('ana@quinzenal.teste', 'Consultório Ana', 'Ana') as conta;
alter table ids add column quinzenal uuid, add column semanal uuid, add column primeira uuid, add column outra uuid;
grant select, update on ids to authenticated;

-- Depois de amanhã às 14h e às 16h no fuso do consultório.
create temp table hora as
  select ((now() at time zone 'America/Sao_Paulo')::date + 2 + time '14:00') at time zone 'America/Sao_Paulo' as h14,
         ((now() at time zone 'America/Sao_Paulo')::date + 2 + time '16:00') at time zone 'America/Sao_Paulo' as h16;
grant select on hora to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated","aal":"aal1"}', true);

update ids set
  quinzenal = public.paciente_criar(conta, '{"nome":"Paciente Quinzenal","consentimento":true}'),
  semanal = public.paciente_criar(conta, '{"nome":"Paciente Semanal","consentimento":true}');

update ids set primeira = public.sessao_criar(conta, jsonb_build_object(
  'paciente_id', quinzenal, 'inicio', (select h14 from hora), 'duracao_min', 50,
  'modalidade', 'presencial', 'repetir_semanal', true, 'intervalo_semanas', 2));
select public.sessao_criar((select conta from ids), jsonb_build_object(
  'paciente_id', (select semanal from ids), 'inicio', (select h16 from hora), 'duracao_min', 50,
  'modalidade', 'presencial', 'repetir_semanal', true));

-- Sessões de cada paciente na agenda das próximas 8 semanas (até o horizonte).
create temp view da_agenda as
  select a.* from public.agenda_listar((select conta from ids), now(), now() + interval '56 days') a;

select is(
  (select count(*)::int from da_agenda where paciente_id = (select quinzenal from ids)),
  4, 'quinzenal: 4 sessões em 8 semanas'
);
select is(
  (select count(*)::int from da_agenda where paciente_id = (select semanal from ids)),
  8, 'semanal, sem intervalo pedido: continua toda semana'
);
select is(
  (select array_agg(distinct (inicio - (select h14 from hora)))::text from da_agenda
    where paciente_id = (select quinzenal from ids) and inicio > (select h14 from hora)),
  (select array_agg(x)::text from (values (interval '14 days'), (interval '28 days'), (interval '42 days')) v(x)),
  'quinzenal: de 14 em 14 dias, no mesmo horário'
);
select ok(
  (select bool_and(intervalo_semanas = 2) from da_agenda where paciente_id = (select quinzenal from ids)),
  'a agenda diz que a sessão é quinzenal'
);
select ok(
  (select bool_and(intervalo_semanas = 1) from da_agenda where paciente_id = (select semanal from ids)),
  'e que a outra é semanal'
);
select is(
  (select public.paciente_ler((select conta from ids), (select quinzenal from ids)) -> 'repeticao' ->> 'intervalo_semanas'),
  '2', 'a ficha mostra a repetição a cada 15 dias'
);

-- Abrir a agenda mais à frente estende a repetição sem perder o passo.
select ok(
  (select bool_and(extract(epoch from inicio - (select h14 from hora))::bigint % (14 * 86400) = 0)
     from public.agenda_listar((select conta from ids), now() + interval '50 days', now() + interval '110 days')
    where paciente_id = (select quinzenal from ids)),
  'estendida mais à frente, segue nas mesmas semanas'
);
select is(
  (select count(*)::int from public.agenda_listar((select conta from ids), now() + interval '56 days', now() + interval '110 days')
    where paciente_id = (select quinzenal from ids)),
  4, 'e gera só uma sessão a cada duas semanas'
);

select throws_ok(
  format($$select public.sessao_criar(%L, jsonb_build_object('paciente_id', %L, 'inicio', %L::timestamptz + interval '1 day',
           'duracao_min', 50, 'modalidade', 'online', 'repetir_semanal', true, 'intervalo_semanas', 3))$$,
         (select conta from ids), (select semanal from ids), (select h14 from hora)),
  'P0001', 'intervalo_invalido', 'intervalo fora de semanal ou quinzenal é recusado'
);

-- Trocar de quinzenal para semanal a partir da segunda sessão.
update ids set outra = (select a.id from da_agenda a where a.paciente_id = quinzenal order by a.inicio offset 1 limit 1);
select public.sessao_alterar((select conta from ids), (select outra from ids), '{"intervalo_semanas":1}', 'proximas');
select is(
  (select intervalo_semanas::int from public.agenda_listar((select conta from ids), now(), now() + interval '56 days')
    where id = (select primeira from ids)),
  2, 'a sessão anterior continua quinzenal'
);
select is(
  (select count(*)::int from public.agenda_listar((select conta from ids), now(), now() + interval '56 days')
    where paciente_id = (select quinzenal from ids) and intervalo_semanas = 1),
  6, 'e as próximas passam a ser semanais, a partir da sessão escolhida'
);

select * from finish();
rollback;
