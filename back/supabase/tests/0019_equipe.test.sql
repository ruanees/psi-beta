-- O trabalho da equipe no backoffice: só o super-admin lê e grava, as
-- tabelas não abrem pela API, a ordem do quadro sai do banco, a pauta da
-- reunião são as tarefas ligadas a ela, e o cronograma pede data a quem vai
-- ao ar.
begin;
select plan(30);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000003f1', 'super@equipe.teste'),
  ('00000000-0000-0000-0000-0000000003f2', 'outra@equipe.teste'),
  ('00000000-0000-0000-0000-0000000003a1', 'ana@equipe.teste');
insert into public.super_admins (user_id) values
  ('00000000-0000-0000-0000-0000000003f1'), ('00000000-0000-0000-0000-0000000003f2');

create temp table ids as
  select public.conta_criar('ana@equipe.teste', 'Consultório Ana', 'Ana') as conta,
         null::uuid as t1, null::uuid as t2, null::uuid as t3, null::uuid as reuniao, null::uuid as peca;
grant select, update on ids to authenticated;

create function pg_temp.como(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
grant execute on function pg_temp.como(text) to authenticated;
create function pg_temp.coluna(e text) returns text[] language sql as $$
  select coalesce(array_agg(t ->> 'titulo' order by ord), '{}')
    from jsonb_array_elements(public.plataforma_tarefas()) with ordinality as q(t, ord)
   where t ->> 'estado' = e;
$$;
grant execute on function pg_temp.coluna(text) to authenticated;

set local role authenticated;

-- ------------------------------------------------------------ só o super-admin
select pg_temp.como('00000000-0000-0000-0000-0000000003a1');
select throws_ok('select public.plataforma_tarefas()', 'P0001', 'so_super', 'a titular não vê o quadro da equipe');
select throws_ok($$select public.plataforma_tarefa_gravar(null, '{"titulo":"x"}')$$, 'P0001', 'so_super', 'nem cria tarefa');
select throws_ok('select public.plataforma_reunioes()', 'P0001', 'so_super', 'nem vê a agenda');
select throws_ok('select public.plataforma_conteudos()', 'P0001', 'so_super', 'nem o cronograma');
select throws_ok('select count(*) from public.equipe_tarefas', '42501', null, 'a tabela não abre pela API');

select pg_temp.como('00000000-0000-0000-0000-0000000003f1');
select is((select count(*)::int from jsonb_array_elements(public.plataforma_equipe())), 2, 'a equipe é quem está em super_admins');

-- ------------------------------------------------------------ tarefas
select throws_ok($$select public.plataforma_tarefa_gravar(null, '{"titulo":"  "}')$$, 'P0001', 'titulo_obrigatorio', 'tarefa sem título');
select throws_ok($$select public.plataforma_tarefa_gravar(null, '{"titulo":"x","responsavel":"00000000-0000-0000-0000-0000000003a1"}')$$,
  'P0001', 'responsavel_invalido', 'responsável é da equipe');
select throws_ok(format($$select public.plataforma_tarefa_gravar(null, '{"titulo":"x","conta_id":"%s"}')$$, gen_random_uuid()),
  'P0001', 'conta_inexistente', 'consultório ligado tem de existir');
select throws_ok(format($$select public.plataforma_tarefa_gravar(%L, '{"titulo":"x"}')$$, gen_random_uuid()),
  'P0001', 'tarefa_inexistente', 'editar tarefa que não existe');

update ids set
  t1 = public.plataforma_tarefa_gravar(null, '{"titulo":"Ligar para a Ana"}'),
  t2 = public.plataforma_tarefa_gravar(null, '{"titulo":"Revisar planos","responsavel":"00000000-0000-0000-0000-0000000003f2"}'),
  t3 = public.plataforma_tarefa_gravar(null, '{"titulo":"Corrigir recibo"}');
select is(pg_temp.coluna('a_fazer'), array['Ligar para a Ana', 'Revisar planos', 'Corrigir recibo'],
  'tarefa nova vai para o fim de "a fazer"');

select public.plataforma_tarefa_mover(t3, 'a_fazer', t1) from ids;
select is(pg_temp.coluna('a_fazer'), array['Corrigir recibo', 'Ligar para a Ana', 'Revisar planos'], 'arrastar para o topo');
select public.plataforma_tarefa_mover(t3, 'a_fazer', t2) from ids;
select is(pg_temp.coluna('a_fazer'), array['Ligar para a Ana', 'Corrigir recibo', 'Revisar planos'], 'arrastar para o meio');
select public.plataforma_tarefa_mover(t1, 'fazendo', null) from ids;
select is(pg_temp.coluna('fazendo'), array['Ligar para a Ana'], 'arrastar para outra coluna');
select throws_ok(format($$select public.plataforma_tarefa_mover(%L, 'parado', null)$$, (select t1 from ids)),
  'P0001', 'estado_invalido', 'coluna que não existe');

select public.plataforma_tarefa_mover(t1, 'feito', null) from ids;
select ok((select t ->> 'concluida_em' is not null from jsonb_array_elements(public.plataforma_tarefas()) t
            where t ->> 'id' = (select t1::text from ids)), 'chegar em "feito" marca a conclusão');
select public.plataforma_tarefa_gravar(t1, '{"estado":"fazendo","prazo":"2026-11-02"}') from ids;
select ok((select t ->> 'concluida_em' is null and t ->> 'prazo' = '2026-11-02'
             from jsonb_array_elements(public.plataforma_tarefas()) t where t ->> 'id' = (select t1::text from ids)),
  'voltar de "feito" tira a conclusão, e o prazo grava junto');
select public.plataforma_tarefa_gravar(t2, '{"descricao":"Beta e mensal"}') from ids;
select ok((select t ->> 'titulo' = 'Revisar planos' and t ->> 'responsavel' = '00000000-0000-0000-0000-0000000003f2'
             from jsonb_array_elements(public.plataforma_tarefas()) t where t ->> 'id' = (select t2::text from ids)),
  'gravar um campo não apaga os outros');

-- ------------------------------------------------------------ agenda
select throws_ok($$select public.plataforma_reuniao_gravar(null, '{"titulo":"Semanal","inicio":"2026-11-03T13:00:00Z","fim":"2026-11-03T12:00:00Z"}')$$,
  'P0001', 'horario_invalido', 'reunião que acaba antes de começar');
select throws_ok($$select public.plataforma_reuniao_gravar(null, '{"inicio":"2026-11-03T13:00:00Z","fim":"2026-11-03T14:00:00Z"}')$$,
  'P0001', 'titulo_obrigatorio', 'reunião sem título');
update ids set reuniao = public.plataforma_reuniao_gravar(null, format(
  '{"titulo":"Semanal","inicio":"%s","fim":"%s","conta_id":"%s"}',
  now() + interval '1 day', now() + interval '1 day 1 hour', conta)::jsonb);
select public.plataforma_tarefa_gravar(t2, format('{"reuniao_id":"%s"}', reuniao)::jsonb) from ids;
select is(
  (select r -> 'tarefas' -> 0 ->> 'titulo' from jsonb_array_elements(public.plataforma_reunioes()) r
    where r ->> 'id' = (select reuniao::text from ids)),
  'Revisar planos', 'tarefa ligada à reunião entra na pauta');
select is(
  (select r ->> 'conta' from jsonb_array_elements(public.plataforma_reunioes()) r where r ->> 'id' = (select reuniao::text from ids)),
  'Consultório Ana', 'e a reunião mostra o consultório ligado');
select public.plataforma_reuniao_gravar(reuniao, '{"notas":"Ficou o plano mensal."}') from ids;
select is(
  (select r ->> 'titulo' from jsonb_array_elements(public.plataforma_reunioes()) r where r ->> 'id' = (select reuniao::text from ids)),
  'Semanal', 'gravar a ata não mexe no resto');
select public.plataforma_reuniao_excluir(reuniao) from ids;
select is(
  (select t ->> 'reuniao_id' from jsonb_array_elements(public.plataforma_tarefas()) t where t ->> 'id' = (select t2::text from ids)),
  null, 'excluir a reunião deixa a tarefa no quadro, sem a reunião');

-- ------------------------------------------------------------ conteúdo
select throws_ok($$select public.plataforma_conteudo_gravar(null, '{"titulo":"Post","etapa":"agendado"}')$$,
  'P0001', 'data_obrigatoria', 'agendado precisa de data');
select throws_ok($$select public.plataforma_conteudo_gravar(null, '{"titulo":"Post","canal":"radio"}')$$,
  '23514', null, 'canal que não existe');
update ids set peca = public.plataforma_conteudo_gravar(null, '{"titulo":"Como funciona o recibo","canal":"blog"}');
select is((select x ->> 'etapa' from jsonb_array_elements(public.plataforma_conteudos()) x), 'ideia', 'peça nova nasce como ideia');
select throws_ok(format($$select public.plataforma_conteudo_gravar(%L, '{"etapa":"publicado"}')$$, (select peca from ids)),
  'P0001', 'data_obrigatoria', 'publicar sem data também é recusado');
select public.plataforma_conteudo_gravar(peca, '{"etapa":"publicado","publicar_em":"2026-10-20","link":"https://senda.app/blog/recibo"}') from ids;
select is((select x ->> 'canal' from jsonb_array_elements(public.plataforma_conteudos()) x), 'blog', 'e o canal fica');

-- ------------------------------------------------------------ excluir e auditoria
select public.plataforma_tarefa_excluir(t3) from ids;
reset role;
select is(
  (select count(*)::int from public.auditoria
    where quem = '00000000-0000-0000-0000-0000000003f1' and tabela like 'equipe\_%' and acao = 'excluir'),
  2, 'o que se exclui fica na auditoria, com quem excluiu');

select * from finish();
rollback;
