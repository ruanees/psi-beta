-- Dar acesso a um consultório pelo backoffice: só o super-admin, só para login
-- que existe, e o acesso que nasce é o que os papéis dizem — nada clínico de
-- paciente de outro psicólogo.
begin;
select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000001f1', 'super@membro.teste'),
  ('00000000-0000-0000-0000-0000000001a1', 'ana@membro.teste'),
  ('00000000-0000-0000-0000-0000000001b1', 'bia@membro.teste'),
  ('00000000-0000-0000-0000-0000000001c1', 'caio@membro.teste'),
  ('00000000-0000-0000-0000-0000000001d1', 'duda@membro.teste');
insert into public.super_admins (user_id) values ('00000000-0000-0000-0000-0000000001f1');

create temp table ids as
  select public.conta_criar('ana@membro.teste', 'Consultório Ana', 'Ana') as conta,
         public.conta_criar('duda@membro.teste', 'Consultório Duda', 'Duda') as outra,
         null::uuid as bia, null::uuid as caio, null::uuid as paciente;
grant select, update on ids to authenticated;

create function pg_temp.como(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
grant execute on function pg_temp.como(text) to authenticated;

set local role authenticated;

-- ------------------------------------------------------------ titular não dá acesso pelo backoffice
select pg_temp.como('00000000-0000-0000-0000-0000000001a1');
select throws_ok(
  format($$select public.plataforma_membro_adicionar(%L, '{"email":"bia@membro.teste","nome":"Bia","papeis":["psicologo"]}')$$,
    (select conta from ids)),
  'P0001', 'so_super', 'titular não usa a função do backoffice');

-- Ana cadastra um paciente dela, para conferir o recorte clínico depois.
update ids set paciente = public.paciente_criar(conta, '{"nome":"Paciente da Ana","consentimento":true,"queixa_principal":"sigilo"}');

-- ------------------------------------------------------------ super-admin
select pg_temp.como('00000000-0000-0000-0000-0000000001f1');

select throws_ok(
  format($$select public.plataforma_membro_adicionar(%L, '{"email":"ninguem@membro.teste","nome":"X","papeis":["psicologo"]}')$$,
    (select conta from ids)),
  'P0001', 'email_sem_login', 'só login que existe');
select throws_ok(
  format($$select public.plataforma_membro_adicionar(%L, '{"email":"bia@membro.teste","papeis":[]}')$$, (select conta from ids)),
  'P0001', 'papeis_invalidos', 'precisa de ao menos um papel');
select throws_ok(
  format($$select public.plataforma_membro_adicionar(%L, '{"email":"bia@membro.teste","papeis":["dono"]}')$$, (select conta from ids)),
  'P0001', 'papeis_invalidos', 'papel que não existe é recusado');
select throws_ok(
  format($$select public.plataforma_membro_adicionar(%L, '{"email":"bia@membro.teste","papeis":["psicologo"]}')$$, (select conta from ids)),
  'P0001', 'nome_obrigatorio', 'psicólogo precisa de nome');
select throws_ok(
  format($$select public.plataforma_membro_adicionar(%L, '{"email":"bia@membro.teste","nome":"Bia","papeis":["psicologo"]}')$$, gen_random_uuid()),
  'P0001', 'conta_inexistente', 'consultório que não existe');
select throws_ok(
  format($$select public.plataforma_membro_adicionar(%L, '{"email":"ana@membro.teste","nome":"Ana","papeis":["psicologo"]}')$$,
    (select conta from ids)),
  'P0001', 'ja_membro', 'quem já entra não entra duas vezes');
select throws_ok(
  format($$select public.plataforma_membro_adicionar(%L, '{"email":"duda@membro.teste","nome":"Duda","papeis":["titular","psicologo"]}')$$,
    (select conta from ids)),
  'P0001', 'login_ja_titular', 'quem é titular de outro consultório não vira titular deste');

update ids set
  bia = public.plataforma_membro_adicionar(conta, '{"email":" Bia@Membro.Teste ","nome":"Bia Lima","papeis":["psicologo","psicologo"]}'),
  caio = public.plataforma_membro_adicionar(conta, '{"email":"caio@membro.teste","papeis":["recepcao"]}');
select is(
  (select m -> 'papeis' from jsonb_array_elements(public.plataforma_cliente((select conta from ids)) -> 'membros') m
    where m ->> 'email' = 'bia@membro.teste'),
  '["psicologo"]'::jsonb, 'Bia entra como psicóloga, sem papel repetido');
select is(
  (select m ->> 'nome' from jsonb_array_elements(public.plataforma_cliente((select conta from ids)) -> 'membros') m
    where m ->> 'email' = 'bia@membro.teste'),
  'Bia Lima', 'e com o perfil profissional no nome dela');
select is(
  (select m ->> 'nome' from jsonb_array_elements(public.plataforma_cliente((select conta from ids)) -> 'membros') m
    where m ->> 'email' = 'caio@membro.teste'),
  null, 'recepção não ganha perfil profissional');
select is((public.plataforma_cliente((select conta from ids)) ->> 'acessos')::int, 3, 'o consultório passa a ter três acessos');

-- ------------------------------------------------------------ o acesso que nasceu
select pg_temp.como('00000000-0000-0000-0000-0000000001b1');
select is((select count(*)::int from public.minhas_contas()), 1, 'Bia passa a ver o consultório');
select is(public.pode_clinico((select paciente from ids)), false, 'mas não o clínico do paciente da Ana');

select pg_temp.como('00000000-0000-0000-0000-0000000001c1');
select is((select papeis from public.minhas_contas()), array['recepcao'], 'Caio entra como recepção');

-- ------------------------------------------------------------ auditoria
reset role;
select is(
  (select count(*)::int from public.auditoria
    where quem = '00000000-0000-0000-0000-0000000001f1' and tabela = 'membros' and acao = 'criar'),
  2, 'cada acesso dado fica na auditoria com o nome de quem deu');

select * from finish();
rollback;
