-- Conta Google conectada e sala do Meet por paciente.
begin;
select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000ab', 'ana@meet.teste'),
  ('00000000-0000-0000-0000-0000000000bb', 'bia@meet.teste');
create temp table ids as select public.conta_criar('ana@meet.teste', 'Consultório Ana', 'Ana Meet') as conta;
alter table ids add column pa uuid, add column sa uuid, add column sb uuid, add column t text;
grant select, update on ids to authenticated;
grant select on ids to anon;
select public.conta_criar('bia@meet.teste', 'Consultório Bia', 'Bia');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ab","role":"authenticated","aal":"aal1"}', true);

update ids set pa = public.paciente_criar(conta, '{"nome":"Paciente Do Meet","consentimento":true}');
update ids set
  sa = public.sessao_criar(conta, jsonb_build_object('paciente_id', pa, 'inicio', now() + interval '10 minutes', 'duracao_min', 50, 'modalidade', 'online')),
  sb = public.sessao_criar(conta, jsonb_build_object('paciente_id', pa, 'inicio', now() + interval '7 days', 'duracao_min', 50, 'modalidade', 'online'));

select is((select public.google_status(conta) from ids), '{"conectada": false}'::jsonb, 'sem conexão, o status diz que não está conectada');
select is((select public.sala_sessao(conta, sa) ->> 'google' from ids), 'desconectada', 'e a sala sabe disso');

select public.google_gravar((select conta from ids), 'ana@gmail.com', 'iv-de-teste.token-cifrado-de-teste');
select ok(
  (select j ->> 'conectada' = 'true' and j ->> 'email' = 'ana@gmail.com' and j ->> 'falhou' = 'false' and not j ? 'token'
     from ids, public.google_status(ids.conta) j),
  'conectada: mostra o e-mail, nunca o token'
);
select is((select public.google_token(conta, pa) from ids), 'iv-de-teste.token-cifrado-de-teste',
  'o back pega o token cifrado do psicólogo do paciente');

-- ------------------------------------------------ sala do Meet do paciente
select public.perfil_gravar((select conta from ids), '{"sala_link":"https://meet.google.com/fixo-do-perfil"}');
select public.sala_meet_gravar((select conta from ids), (select pa from ids), 'https://meet.google.com/abc-defg-hij', 'spaces/AbC123');
select is((select public.sala_sessao(conta, sb) ->> 'link' from ids), 'https://meet.google.com/abc-defg-hij',
  'o Meet do paciente vale mais que o link fixo do perfil');
select is((select public.proxima_online(conta) ->> 'link' from ids), 'https://meet.google.com/abc-defg-hij',
  'e aparece no Início');
select public.sala_sessao_gravar((select conta from ids), (select sb from ids), 'https://zoom.us/j/123');
select is((select public.sala_sessao(conta, sb) ->> 'link' from ids), 'https://zoom.us/j/123',
  'link colado na sessão vale mais que o Meet do paciente');
select throws_ok(
  format($$select public.sala_meet_gravar(%L, %L, 'https://zoom.us/j/1', 'spaces/x')$$, (select conta from ids), (select pa from ids)),
  'P0001', 'link_invalido', 'a sala gerada só aceita link do Meet'
);
update ids set t = public.sala_sessao(conta, sa) ->> 'token';

-- ------------------------------------------------ paciente
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select public.sala_publica(t) ->> 'link' from ids), 'https://meet.google.com/abc-defg-hij',
  'na janela, o paciente recebe o Meet dele');
select throws_ok(format($$select public.google_status(%L)$$, (select conta from ids)), '42501', null,
  'sem login, nada da conexão com o Google');

-- ------------------------------------------------ Google recusou o token
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ab","role":"authenticated","aal":"aal1"}', true);
select public.google_falhou((select conta from ids), (select pa from ids));
select ok(
  (select public.google_token(conta, pa) is null and public.sala_sessao(conta, sa) ->> 'google' = 'reconectar' from ids),
  'token recusado: não se tenta de novo e a tela pede reconexão'
);
select public.google_gravar((select conta from ids), 'ana@gmail.com', 'iv-novo.token-cifrado-novo-xx');
select is((select public.google_status(conta) ->> 'falhou' from ids), 'false', 'reconectar limpa a falha');

select is((select public.google_remover(conta) from ids), 'iv-novo.token-cifrado-novo-xx',
  'desconectar devolve o token para o back revogar no Google');
select is((select public.google_status(conta) ->> 'conectada' from ids), 'false', 'e apaga a conexão');

-- ------------------------------------------------ outra conta
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000bb","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  format($$select public.google_token(%L, %L)$$, (select conta from ids), (select pa from ids)),
  'P0001', 'sem_acesso', 'outra conta não pega o token'
);
select throws_ok('select * from public.integracoes_google', '42501', null, 'tabela de conexões não se lê direto');

select * from finish();
rollback;
