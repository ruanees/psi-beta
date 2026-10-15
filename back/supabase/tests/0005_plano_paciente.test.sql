-- Plano do paciente: avulsa, pacote ou mensal.
begin;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a5', 'ana@plano.teste'),
  ('00000000-0000-0000-0000-0000000000b5', 'bia@plano.teste');
create temp table ids as select public.conta_criar('ana@plano.teste', 'Consultório Ana', 'Ana') as conta;
alter table ids add column p uuid;
grant select, update on ids to authenticated;
select public.conta_criar('bia@plano.teste', 'Consultório Bia', 'Bia');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated","aal":"aal1"}', true);

update ids set p = public.paciente_criar(conta, '{"nome":"Paciente Plano","valor_sessao":150,"consentimento":true}');

select is(
  (select public.paciente_ler((select conta from ids), (select p from ids)) -> 'plano'),
  '{"tipo":"avulsa","sessoes":null,"valor":150}'::jsonb, 'nasce avulsa, com o valor da sessão'
);

select lives_ok(
  format($$select public.paciente_plano(%L, %L, '{"plano":"pacote","sessoes":4,"valor":520}')$$, (select conta from ids), (select p from ids)),
  'vira pacote de 4 sessões'
);
select is(
  (select public.paciente_ler((select conta from ids), (select p from ids)) -> 'plano'),
  '{"tipo":"pacote","sessoes":4,"valor":520}'::jsonb, 'a ficha mostra o pacote'
);
select is(
  (select public.paciente_ler((select conta from ids), (select p from ids)) -> 'valor_sessao'),
  '150'::jsonb, 'o valor da sessão avulsa fica guardado'
);

select throws_ok(
  format($$select public.paciente_plano(%L, %L, '{"plano":"pacote","valor":520}')$$, (select conta from ids), (select p from ids)),
  'P0001', 'plano_incompleto', 'pacote sem número de sessões é recusado'
);
select throws_ok(
  format($$select public.paciente_plano(%L, %L, '{"plano":"pacote","sessoes":1,"valor":130}')$$, (select conta from ids), (select p from ids)),
  'P0001', 'plano_incompleto', 'pacote de uma sessão é recusado'
);
select throws_ok(
  format($$select public.paciente_plano(%L, %L, '{"plano":"mensal"}')$$, (select conta from ids), (select p from ids)),
  'P0001', 'plano_incompleto', 'mensal sem valor é recusado'
);

select lives_ok(
  format($$select public.paciente_plano(%L, %L, '{"plano":"mensal","valor":560}')$$, (select conta from ids), (select p from ids)),
  'vira mensal, sem número de sessões'
);
select lives_ok(
  format($$select public.paciente_plano(%L, %L, '{"plano":"avulsa","sessoes":9,"valor":null}')$$, (select conta from ids), (select p from ids)),
  'volta para avulsa com o valor padrão (sessões ignoradas)'
);
select is(
  (select public.paciente_ler((select conta from ids), (select p from ids)) -> 'plano'),
  '{"tipo":"avulsa","sessoes":null,"valor":null}'::jsonb, 'avulsa sem valor próprio'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b5","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  format($$select public.paciente_plano(%L, %L, '{"plano":"mensal","valor":1}')$$, (select conta from ids), (select p from ids)),
  'P0001', 'sem_acesso', 'outra conta não muda o plano'
);

select * from finish();
rollback;
