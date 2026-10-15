-- Sala online: link do paciente, link da chamada (da sessão ou do perfil) e a página pública.
begin;
select plan(21);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000aa', 'ana@sala.teste'),
  ('00000000-0000-0000-0000-0000000000ba', 'bia@sala.teste');
create temp table ids as select public.conta_criar('ana@sala.teste', 'Consultório Ana', 'Ana Sala') as conta;
alter table ids add column pa uuid, add column pb uuid, add column pc uuid,
  add column sa uuid, add column sa2 uuid, add column sb uuid, add column sc uuid,
  add column ta text, add column tb text, add column tc text, add column ta2 text;
grant select, update on ids to authenticated;
grant select on ids to anon;
select public.conta_criar('bia@sala.teste', 'Consultório Bia', 'Bia');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated","aal":"aal1"}', true);

update ids set
  pa = public.paciente_criar(conta, '{"nome":"Paciente Daqui A Dias","consentimento":true}'),
  pb = public.paciente_criar(conta, '{"nome":"Paciente Agora","consentimento":true}'),
  pc = public.paciente_criar(conta, '{"nome":"Paciente Presencial","consentimento":true}');
create function pg_temp.sessao(c uuid, p uuid, daqui interval, modalidade text) returns uuid language sql as $$
  select public.sessao_criar(c, jsonb_build_object('paciente_id', p, 'inicio', now() + daqui,
                             'duracao_min', 50, 'modalidade', modalidade));
$$;
update ids set
  sa  = pg_temp.sessao(conta, pa, interval '3 days', 'online'),
  sa2 = pg_temp.sessao(conta, pa, interval '10 days', 'online'),
  sb  = pg_temp.sessao(conta, pb, interval '10 minutes', 'online'),
  sc  = pg_temp.sessao(conta, pc, interval '2 days', 'presencial');
update ids set
  ta = public.sala_sessao(conta, sa) ->> 'token',
  tb = public.sala_sessao(conta, sb) ->> 'token',
  tc = public.sala_sessao(conta, sc) ->> 'token';

select matches((select ta from ids), '^[0-9a-f]{64}$', 'o link do paciente é um token longo e aleatório');
select is((select public.sala_sessao(conta, sa2) ->> 'token' from ids), (select ta from ids),
  'o mesmo link do paciente serve para todas as sessões dele');
select ok(
  (select (j ->> 'link') is null and not (j ->> 'epsi_ok')::boolean
     from ids, public.sala_sessao(ids.conta, ids.sb) j),
  'sem link colado nem fixo, a sala não tem link; e o aviso do e-Psi aparece'
);

-- ------------------------------------------------ página pública, sem link ainda
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select public.sala_publica(tb) ->> 'situacao' from ids), 'sem_link',
  'na janela, sem link: a página avisa que o link ainda não foi colocado');

-- ------------------------------------------------ links
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  format($$select public.perfil_gravar(%L, '{"sala_link":"http://meet.google.com/abc-defg-hij"}')$$, (select conta from ids)),
  'P0001', 'link_invalido', 'link fixo sem https é recusado'
);
select lives_ok(
  format($$select public.perfil_gravar(%L, '{"sala_link":" https://meet.google.com/aaa-bbbb-ccc "}')$$, (select conta from ids)),
  'grava o link fixo no perfil'
);
select is((select public.sala_sessao(conta, sa) ->> 'link' from ids), 'https://meet.google.com/aaa-bbbb-ccc',
  'sem link próprio, a sessão usa o link fixo do perfil');
select public.sala_sessao_gravar((select conta from ids), (select sb from ids), 'https://meet.google.com/xyz-abcd-efg');
select is((select public.sala_sessao(conta, sb) ->> 'link' from ids), 'https://meet.google.com/xyz-abcd-efg',
  'link colado na sessão vale mais que o do perfil');
select throws_ok(
  format($$select public.sala_sessao_gravar(%L, %L, 'javascript:alert(1)')$$, (select conta from ids), (select sb from ids)),
  'P0001', 'link_invalido', 'só link https'
);
select is((select public.conta_ler(conta) -> 'perfil' ->> 'sala_link' from ids), 'https://meet.google.com/aaa-bbbb-ccc',
  'o perfil devolve o link fixo');
select is((select public.proxima_online(conta) ->> 'id' from ids), (select sb::text from ids),
  'o Início mostra a próxima sessão online');

-- ------------------------------------------------ página pública
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select public.sala_publica(tb) ->> 'link' from ids), 'https://meet.google.com/xyz-abcd-efg',
  'a 15 minutos do início, a página entrega o link da chamada');
select is(
  (select array_agg(k order by k) from ids, jsonb_object_keys(public.sala_publica(ids.ta)) k),
  array['abre_em', 'fim', 'inicio', 'link', 'profissional', 'situacao'],
  'a página só sabe quando e com quem: nada do paciente'
);
select ok(
  (select j ->> 'situacao' = 'cedo' and j ->> 'link' is null and j ->> 'profissional' = 'Ana Sala'
     from ids, public.sala_publica(ids.ta) j),
  'antes da janela, mostra a hora e esconde o link'
);
select is((select public.sala_publica(tc) ->> 'situacao' from ids), 'sem_sessao',
  'paciente sem sessão online marcada vê que não há sessão');
select throws_ok($$select public.sala_publica('abc')$$, 'P0001', 'sala_nao_encontrada', 'token inválido não acha sala');
select throws_ok(
  format($$select public.sala_sessao(%L, %L)$$, (select conta from ids), (select sa from ids)),
  '42501', null, 'sem login, só a página pública'
);

-- ------------------------------------------------ trocar o link do paciente
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated","aal":"aal1"}', true);
update ids set ta2 = public.sala_paciente_renovar(conta, pa);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(format($$select public.sala_publica(%L)$$, (select ta from ids)),
  'P0001', 'sala_nao_encontrada', 'o link antigo para de funcionar');
select is((select public.sala_publica(ta2) ->> 'situacao' from ids), 'cedo', 'e o novo funciona');

-- ------------------------------------------------ outra conta
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ba","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  format($$select public.sala_sessao(%L, %L)$$, (select conta from ids), (select sa from ids)),
  'P0001', 'sem_acesso', 'outra conta não vê a sala'
);
select throws_ok('select * from public.salas_pacientes', '42501', null, 'tabela de links não se lê direto');

select * from finish();
rollback;
