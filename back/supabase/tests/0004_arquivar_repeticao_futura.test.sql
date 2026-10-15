-- Alta e arquivo com repetição semanal que ainda não começou.
begin;
select plan(5);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a4', 'ana@arquivar.teste');
create temp table ids as select public.conta_criar('ana@arquivar.teste', 'Consultório Ana', 'Ana') as conta;
alter table ids add column arquivar uuid, add column alta uuid;
grant select, update on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated","aal":"aal1"}', true);

update ids set
  arquivar = public.paciente_criar(conta, '{"nome":"Começa Semana Que Vem","consentimento":true}'),
  alta = public.paciente_criar(conta, '{"nome":"Começa Daqui a Um Mês","consentimento":true}');

-- repetições que só começam no futuro
select public.sessao_criar((select conta from ids), jsonb_build_object(
  'paciente_id', (select arquivar from ids), 'inicio', now() + interval '7 days', 'duracao_min', 50,
  'modalidade', 'presencial', 'repetir_semanal', true));
select public.sessao_criar((select conta from ids), jsonb_build_object(
  'paciente_id', (select alta from ids), 'inicio', now() + interval '30 days' + interval '2 hours', 'duracao_min', 50,
  'modalidade', 'online', 'repetir_semanal', true));

select lives_ok(
  format($$select public.paciente_situacao(%L, %L, 'arquivado')$$, (select conta from ids), (select arquivar from ids)),
  'arquiva paciente cuja repetição ainda não começou'
);
select lives_ok(
  format($$select public.paciente_situacao(%L, %L, 'alta')$$, (select conta from ids), (select alta from ids)),
  'dá alta a paciente cuja repetição ainda não começou'
);
select is(
  (select public.paciente_ler((select conta from ids), (select arquivar from ids)) ->> 'situacao'),
  'arquivado', 'a situação mudou'
);
select is(
  (select public.paciente_ler((select conta from ids), (select arquivar from ids)) -> 'repeticao'),
  'null'::jsonb, 'a repetição não aparece mais na ficha'
);
select is(
  (select count(*)::int from public.agenda_listar((select conta from ids), now(), now() + interval '60 days')),
  0, 'e as sessões futuras saíram da agenda'
);

select * from finish();
rollback;
