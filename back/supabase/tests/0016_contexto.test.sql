-- Escolha de contexto: plataforma_eu diz a cada um o que ele alcança, e só isso.
begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'atende.e.opera@contexto.teste'),
  ('00000000-0000-0000-0000-0000000000e2', 'so.opera@contexto.teste'),
  ('00000000-0000-0000-0000-0000000000e3', 'so.atende@contexto.teste');
insert into public.super_admins (user_id) values
  ('00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000e2');
select public.conta_criar('atende.e.opera@contexto.teste', 'Consultório E1', 'E1');
select public.conta_criar('so.atende@contexto.teste', 'Consultório E3', 'E3');

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated","aal":"aal1"}', true);
select is(public.plataforma_eu() -> 'super', 'true'::jsonb, 'super-admin que atende: opera a plataforma');
select is(public.plataforma_eu() -> 'consultorios', '1'::jsonb, 'e alcança um consultório: escolhe o contexto');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated","aal":"aal1"}', true);
select is(public.plataforma_eu() -> 'consultorios', '0'::jsonb, 'super-admin sem consultório: só o backoffice');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated","aal":"aal1"}', true);
select is(public.plataforma_eu() -> 'super', 'false'::jsonb, 'titular comum não opera a plataforma');
select is(public.plataforma_eu() -> 'consultorios', '1'::jsonb, 'e vê só o próprio vínculo');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.plataforma_eu()) k),
  array['consultorios', 'email', 'id', 'super'],
  'plataforma_eu traz só estas chaves'
);

select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select public.plataforma_eu()', 'P0001', 'sem_acesso', 'sem login, sem resposta');

select * from finish();
rollback;
