-- Tirar acesso e trocar papéis pelo backoffice: quem sai não entra nem lê o
-- clínico dos próprios pacientes, o vínculo e o histórico ficam, o
-- consultório nunca fica sem titular, e devolver o acesso reaproveita o
-- vínculo antigo.
begin;
select plan(26);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000002f1', 'super@remover.teste'),
  ('00000000-0000-0000-0000-0000000002a1', 'ana@remover.teste'),
  ('00000000-0000-0000-0000-0000000002b1', 'bia@remover.teste'),
  ('00000000-0000-0000-0000-0000000002d1', 'duda@remover.teste');
insert into public.super_admins (user_id) values ('00000000-0000-0000-0000-0000000002f1');

create temp table ids as
  select public.conta_criar('ana@remover.teste', 'Consultório Ana', 'Ana') as conta,
         public.conta_criar('duda@remover.teste', 'Consultório Duda', 'Duda') as outra,
         null::uuid as ana, null::uuid as bia, null::uuid as duda, null::uuid as paciente;
update ids set ana = (select m.id from public.membros m where m.conta_id = ids.conta);
grant select, update on ids to authenticated;

create function pg_temp.como(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
grant execute on function pg_temp.como(text) to authenticated;

set local role authenticated;

-- Bia entra como psicóloga e cadastra uma paciente dela.
select pg_temp.como('00000000-0000-0000-0000-0000000002f1');
update ids set
  bia = public.plataforma_membro_adicionar(conta, '{"email":"bia@remover.teste","nome":"Bia Lima","papeis":["psicologo"]}'),
  duda = public.plataforma_membro_adicionar(conta, '{"email":"duda@remover.teste","papeis":["recepcao"]}');
select pg_temp.como('00000000-0000-0000-0000-0000000002b1');
update ids set paciente = public.paciente_criar(conta, '{"nome":"Paciente da Bia","consentimento":true,"queixa_principal":"sigilo"}');
select is(public.pode_clinico((select paciente from ids)), true, 'Bia lê o clínico da paciente dela');

-- Bia conectou a conta Google dela.
reset role;
insert into public.integracoes_google (membro_id, conta_id, email_google, token_cifrado)
  select bia, conta, 'bia@gmail.teste', repeat('x', 40) from ids;
set local role authenticated;

-- ------------------------------------------------------------ só o super-admin
select pg_temp.como('00000000-0000-0000-0000-0000000002a1');
select throws_ok(format('select public.plataforma_membro_remover(%L)', (select bia from ids)),
  'P0001', 'so_super', 'a titular não tira acesso pela função do backoffice');
select throws_ok(format($$select public.plataforma_membro_papeis(%L, '{"papeis":["recepcao"]}')$$, (select bia from ids)),
  'P0001', 'so_super', 'nem troca papéis');

select pg_temp.como('00000000-0000-0000-0000-0000000002f1');

-- ------------------------------------------------------------ recusas
select throws_ok(format('select public.plataforma_membro_remover(%L)', gen_random_uuid()),
  'P0001', 'membro_inexistente', 'vínculo que não existe');
select throws_ok(format('select public.plataforma_membro_remover(%L)', (select ana from ids)),
  'P0001', 'ultimo_titular', 'o consultório não fica sem titular');
select throws_ok(format($$select public.plataforma_membro_papeis(%L, '{"papeis":["psicologo"]}')$$, (select ana from ids)),
  'P0001', 'ultimo_titular', 'nem perdendo o papel do último titular');
select throws_ok(format($$select public.plataforma_membro_papeis(%L, '{"papeis":[]}')$$, (select bia from ids)),
  'P0001', 'papeis_invalidos', 'precisa de ao menos um papel');
select throws_ok(format($$select public.plataforma_membro_papeis(%L, '{"papeis":["titular"]}')$$, (select duda from ids)),
  'P0001', 'login_ja_titular', 'quem é titular de outro consultório não vira titular deste');
select throws_ok(format($$select public.plataforma_membro_papeis(%L, '{"papeis":["psicologo"]}')$$, (select duda from ids)),
  'P0001', 'nome_obrigatorio', 'virar psicólogo sem perfil pede nome');

-- ------------------------------------------------------------ trocar papéis
select public.plataforma_membro_papeis(bia, '{"papeis":["recepcao"]}') from ids;
select pg_temp.como('00000000-0000-0000-0000-0000000002b1');
select is((select papeis from public.minhas_contas()), array['recepcao'], 'Bia passa a entrar como recepção');
select is(public.pode_clinico((select paciente from ids)), false, 'e sem o papel de psicóloga não lê o clínico');

select pg_temp.como('00000000-0000-0000-0000-0000000002f1');
select public.plataforma_membro_papeis(bia, '{"papeis":["psicologo","recepcao"]}') from ids;
select pg_temp.como('00000000-0000-0000-0000-0000000002b1');
select is(public.pode_clinico((select paciente from ids)), true, 'o papel volta sem pedir nome: o perfil já existia');

-- ------------------------------------------------------------ tirar acesso
select pg_temp.como('00000000-0000-0000-0000-0000000002f1');
select public.plataforma_membro_remover(bia) from ids;
select lives_ok(format('select public.plataforma_membro_remover(%L)', (select bia from ids)),
  'tirar de novo quem já saiu não muda nada');
select throws_ok(format($$select public.plataforma_membro_papeis(%L, '{"papeis":["recepcao"]}')$$, (select bia from ids)),
  'P0001', 'membro_removido', 'não troca papel de quem saiu');
select is(
  (select (c ->> 'acessos')::int from public.plataforma_cliente((select conta from ids)) c),
  2, 'o consultório passa a contar dois acessos');
select ok(
  (select m ->> 'removido_em' is not null
     from jsonb_array_elements(public.plataforma_cliente((select conta from ids)) -> 'membros') m
    where m ->> 'email' = 'bia@remover.teste'),
  'a ficha mostra Bia como quem saiu');
select is(
  (select l -> 'contas' from jsonb_array_elements(public.plataforma_logins()) l where l ->> 'email' = 'bia@remover.teste'),
  '[]'::jsonb, 'em Contas, Bia fica sem consultório');

select pg_temp.como('00000000-0000-0000-0000-0000000002b1');
select is((select count(*)::int from public.minhas_contas()), 0, 'Bia não vê mais o consultório');
select is((public.plataforma_eu() ->> 'consultorios')::int, 0, 'nem na escolha de contexto');
select throws_ok(format('select public.conta_ler(%L)', (select conta from ids)),
  'P0001', 'sem_acesso', 'e não entra nele');
select is(public.pode_clinico((select paciente from ids)), false, 'nem lê o clínico da paciente que era dela');

reset role;
select ok(
  (select pa.profissional_id = ids.bia from public.pacientes pa join ids on pa.id = ids.paciente),
  'a paciente continua ligada à Bia: nada se perde');
select is((select count(*)::int from public.integracoes_google g join ids on g.membro_id = ids.bia), 0,
  'a conta Google da Bia deixa de criar sala pelo consultório');
select is(
  (select count(*)::int from public.auditoria a join ids on a.registro_id = ids.bia
    where a.quem = '00000000-0000-0000-0000-0000000002f1' and a.acao = 'arquivar'),
  1, 'o acesso tirado fica na auditoria com o nome de quem tirou');
set local role authenticated;

-- ------------------------------------------------------------ devolver acesso
select pg_temp.como('00000000-0000-0000-0000-0000000002f1');
select is(
  (select public.plataforma_membro_adicionar(conta, '{"email":"bia@remover.teste","papeis":["psicologo"]}') from ids),
  (select bia from ids), 'devolver o acesso reaproveita o vínculo antigo, sem pedir nome');
select pg_temp.como('00000000-0000-0000-0000-0000000002b1');
select is(public.pode_clinico((select paciente from ids)), true, 'e Bia volta a ler o clínico da paciente dela');

select * from finish();
rollback;
