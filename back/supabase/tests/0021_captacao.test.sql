-- Captação no backoffice: só o super-admin, as tabelas não abrem pela API,
-- cada troca de etapa e cada nota ficam no histórico, e a reunião marcada
-- pela Agenda leva o contato para "reunião marcada" sem fazê-lo voltar.
begin;
select plan(24);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000005f1', 'super@captacao.teste'),
  ('00000000-0000-0000-0000-0000000005a1', 'ana@captacao.teste');
insert into public.super_admins (user_id) values ('00000000-0000-0000-0000-0000000005f1');

create temp table ids as
  select public.conta_criar('ana@captacao.teste', 'Consultório Ana', 'Ana') as conta,
         null::uuid as c1, null::uuid as c2, null::uuid as reuniao;
grant select, update on ids to authenticated;

create function pg_temp.como(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
grant execute on function pg_temp.como(text) to authenticated;
create function pg_temp.contato(x uuid) returns jsonb language sql as $$
  select public.plataforma_captacao_ler(x);
$$;
grant execute on function pg_temp.contato(uuid) to authenticated;

set local role authenticated;

-- ------------------------------------------------------------ só o super-admin
select pg_temp.como('00000000-0000-0000-0000-0000000005a1');
select throws_ok('select public.plataforma_captacao()', 'P0001', 'so_super', 'a titular não vê a captação');
select throws_ok($$select public.plataforma_captacao_gravar(null, '{"nome":"X"}')$$, 'P0001', 'so_super', 'nem cadastra');
select throws_ok('select count(*) from public.captacao_contatos', '42501', null, 'a tabela não abre pela API');

select pg_temp.como('00000000-0000-0000-0000-0000000005f1');

-- ------------------------------------------------------------ cadastro
select throws_ok($$select public.plataforma_captacao_gravar(null, '{"nome":"  "}')$$, 'P0001', 'contato_sem_nome', 'contato sem nome');
select throws_ok($$select public.plataforma_captacao_gravar(null, '{"nome":"X","origem":"radio"}')$$, '23514', null, 'origem que não existe');
select throws_ok($$select public.plataforma_captacao_gravar(null, '{"nome":"X","responsavel":"00000000-0000-0000-0000-0000000005a1"}')$$,
  'P0001', 'responsavel_invalido', 'responsável é da equipe');

update ids set
  c1 = public.plataforma_captacao_gravar(null, '{"nome":"Rebeca Lima","email":" Rebeca@Ex.com ","origem":"instagram","perfil":"solo","pacientes_semana":20}'),
  c2 = public.plataforma_captacao_gravar(null, '{"nome":"Clínica Bem","perfil":"clinica","etapa":"beta"}');
select ok(
  (select c ->> 'etapa' = 'a_abordar' and c ->> 'email' = 'rebeca@ex.com' and (c ->> 'pacientes_semana')::int = 20
     from pg_temp.contato((select c1 from ids)) c),
  'contato novo nasce em "a abordar", com o e-mail em minúsculas');
select is((select jsonb_array_length(c -> 'eventos') from pg_temp.contato((select c1 from ids)) c), 1, 'e a criação fica no histórico');
select is(jsonb_array_length(public.plataforma_captacao()), 2, 'o funil lista os dois');

-- ------------------------------------------------------------ etapa, campos e notas
select public.plataforma_captacao_gravar(c1, '{"etapa":"abordado","proximo_passo":"Retomar no direct","proximo_em":"2026-10-21"}') from ids;
select is((select c -> 'eventos' -> 0 ->> 'texto' from pg_temp.contato((select c1 from ids)) c), 'A abordar → Abordado.',
  'trocar de etapa fica no histórico');
select ok((select c ->> 'proximo_passo' = 'Retomar no direct' and c ->> 'proximo_em' = '2026-10-21' from pg_temp.contato((select c1 from ids)) c),
  'o próximo passo grava com a data de retomar');
select public.plataforma_captacao_gravar(c1, '{"telefone":"11 99999-0000"}') from ids;
select ok((select c ->> 'etapa' = 'abordado' and c ->> 'nome' = 'Rebeca Lima' and c ->> 'telefone' = '11 99999-0000'
             from pg_temp.contato((select c1 from ids)) c),
  'gravar um campo não apaga os outros');
select is((select jsonb_array_length(c -> 'eventos') from pg_temp.contato((select c1 from ids)) c), 2,
  'e sem troca de etapa não entra evento');

select throws_ok(format('select public.plataforma_captacao_nota(%L, %L)', (select c1 from ids), '  '),
  'P0001', 'nota_vazia', 'nota vazia é recusada');
select public.plataforma_captacao_nota(c1, 'Atende sozinha, 20 pacientes. Quer ver o financeiro.') from ids;
select ok((select c -> 'eventos' -> 0 ->> 'tipo' = 'nota' and c -> 'eventos' -> 0 ->> 'quem' = 'super@captacao.teste'
             from pg_temp.contato((select c1 from ids)) c),
  'a nota de conversa fica no histórico, com quem escreveu');

-- ------------------------------------------------------------ reunião pela Agenda
update ids set reuniao = public.plataforma_reuniao_gravar(null, format(
  '{"titulo":"Demonstração","inicio":"%s","fim":"%s","contato_id":"%s"}',
  now() + interval '2 days', now() + interval '2 days 30 minutes', c1)::jsonb);
select is((select c ->> 'etapa' from pg_temp.contato((select c1 from ids)) c), 'reuniao_marcada',
  'marcar reunião leva o contato para "reunião marcada"');
select ok((select c ->> 'proxima_reuniao' is not null and jsonb_array_length(c -> 'reunioes') = 1
             from pg_temp.contato((select c1 from ids)) c),
  'a ficha mostra a reunião, e a lista a próxima');
select ok((select bool_or(e ->> 'tipo' = 'reuniao') from pg_temp.contato((select c1 from ids)) c, jsonb_array_elements(c -> 'eventos') e),
  'a reunião marcada entra no histórico');
select is((select r ->> 'contato' from jsonb_array_elements(public.plataforma_reunioes()) r where r ->> 'id' = (select reuniao::text from ids)),
  'Rebeca Lima', 'a Agenda mostra com quem é a reunião');

select public.plataforma_reuniao_gravar(null, format(
  '{"titulo":"Acompanhamento do beta","inicio":"%s","fim":"%s","contato_id":"%s"}',
  now() + interval '3 days', now() + interval '3 days 30 minutes', c2)::jsonb) from ids;
select is((select c ->> 'etapa' from pg_temp.contato((select c2 from ids)) c), 'beta', 'quem já está no beta não volta de etapa');
select throws_ok(format($$select public.plataforma_reuniao_gravar(null, '{"titulo":"X","inicio":"%s","fim":"%s","contato_id":"%s"}')$$,
    now() + interval '1 day', now() + interval '1 day 1 hour', gen_random_uuid()),
  'P0001', 'contato_inexistente', 'reunião com contato que não existe');

-- ------------------------------------------------------------ fechar, perder, excluir
select public.plataforma_captacao_gravar(c2, format('{"etapa":"fechou","conta_id":"%s"}', conta)::jsonb) from ids;
select is((select c ->> 'conta' from pg_temp.contato((select c2 from ids)) c), 'Consultório Ana', 'quem fecha fica ligado ao consultório');
select public.plataforma_captacao_gravar(c1, '{"etapa":"perdido","motivo_perda":"Achou caro"}') from ids;
select is((select c -> 'eventos' -> 0 ->> 'texto' from pg_temp.contato((select c1 from ids)) c), 'Reunião marcada → Perdido: Achou caro.',
  'o motivo da perda entra no histórico');

select public.plataforma_captacao_excluir(c1) from ids;
reset role;
select ok(
  (select r.contato_id is null from public.equipe_reunioes r join ids on r.id = ids.reuniao)
    and not exists (select 1 from public.captacao_eventos e join ids on e.contato_id = ids.c1),
  'excluir leva o histórico junto; a reunião fica na Agenda, sem o contato');

select * from finish();
rollback;
