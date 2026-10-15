-- Recibos: fila do que falta emitir, registro, cancelamento. Relatório do mês.
begin;
select plan(20);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a8', 'ana@rec.teste'),
  ('00000000-0000-0000-0000-0000000000b8', 'bia@rec.teste');
create temp table ids as select public.conta_criar('ana@rec.teste', 'Consultório Ana', 'Ana') as conta;
alter table ids add column adulto uuid, add column menor uuid, add column s1 uuid, add column s2 uuid, add column s3 uuid,
  add column c1 uuid, add column c2 uuid, add column c3 uuid, add column r uuid;
grant select, update on ids to authenticated;
select public.conta_criar('bia@rec.teste', 'Consultório Bia', 'Bia');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a8","role":"authenticated","aal":"aal1"}', true);

update ids set
  adulto = public.paciente_criar(conta, '{"nome":"Adulto Recibo","cpf":"11122233344","valor_sessao":200,"consentimento":true}'),
  menor = public.paciente_criar(conta,
    format('{"nome":"Menor Recibo","nascimento":"%s","valor_sessao":150,"consentimento":true}', (current_date - interval '10 years')::date)::jsonb,
    '[{"nome":"Mãe Pagadora","cpf":"99988877766","financeiro":true}]');

create function pg_temp.realizada(c uuid, p uuid, dias int) returns uuid language plpgsql as $$
declare s uuid;
begin
  s := public.sessao_criar(c, jsonb_build_object('paciente_id', p, 'inicio', now() - make_interval(days => dias),
                           'duracao_min', 50, 'modalidade', case when dias = 3 then 'online' else 'presencial' end));
  perform public.sessao_status(c, s, 'realizada');
  return s;
end;
$$;
update ids set s1 = pg_temp.realizada(conta, adulto, 5), s2 = pg_temp.realizada(conta, adulto, 4), s3 = pg_temp.realizada(conta, menor, 3);
update ids set
  c1 = (select id from public.cobrancas_listar(conta) where sessao_id = s1),
  c2 = (select id from public.cobrancas_listar(conta) where sessao_id = s2),
  c3 = (select id from public.cobrancas_listar(conta) where sessao_id = s3);

select is(
  (select jsonb_array_length(public.recibos_fila((select conta from ids)))), 0,
  'cobrança pendente não entra na fila de recibos'
);
select public.cobranca_pagar((select conta from ids), (select c1 from ids), 'pix');
select public.cobranca_pagar((select conta from ids), (select c2 from ids), 'dinheiro');
select public.cobranca_pagar((select conta from ids), (select c3 from ids), 'pix');
select is(
  (select jsonb_array_length(public.recibos_fila((select conta from ids)))), 3,
  'paga entra na fila'
);
select is(
  (select e -> 'pagador' from jsonb_array_elements(public.recibos_fila((select conta from ids))) e
    where e ->> 'id' = (select c3 from ids)::text),
  '{"nome":"Mãe Pagadora","cpf":"99988877766","responsavel":true}'::jsonb,
  'de menor, o pagador é o responsável que paga as sessões'
);
select is(
  (select e -> 'pagador' ->> 'cpf' from jsonb_array_elements(public.recibos_fila((select conta from ids))) e
    where e ->> 'id' = (select c1 from ids)::text),
  '11122233344', 'de adulto sem responsável, o pagador é o próprio paciente'
);

select throws_ok(
  format($$select public.recibo_registrar(%L, jsonb_build_object('cobrancas', jsonb_build_array(%L, %L), 'numero', 'RS-1', 'emitido_em', current_date))$$,
         (select conta from ids), (select c1 from ids), (select c3 from ids)),
  'P0001', 'recibo_pacientes_diferentes', 'um recibo não junta pacientes diferentes'
);
select throws_ok(
  format($$select public.recibo_registrar(%L, jsonb_build_object('cobrancas', jsonb_build_array(%L), 'numero', ' ', 'emitido_em', current_date))$$,
         (select conta from ids), (select c1 from ids)),
  'P0001', 'recibo_sem_numero', 'recibo sem número é recusado'
);
select throws_ok(
  format($$select public.recibo_registrar(%L, jsonb_build_object('cobrancas', jsonb_build_array(%L), 'numero', 'RS-9', 'emitido_em', current_date + 1))$$,
         (select conta from ids), (select c1 from ids)),
  'P0001', 'recibo_data_invalida', 'emissão no futuro é recusada'
);

update ids set r = public.recibo_registrar(conta, jsonb_build_object('cobrancas', jsonb_build_array(c1, c2), 'numero', 'RS-2026-001', 'emitido_em', current_date));
select is(
  (select e ->> 'valor' from jsonb_array_elements(public.recibos_listar((select conta from ids))) e where e ->> 'id' = (select r from ids)::text),
  '400.00', 'um recibo cobre duas sessões do mesmo paciente, com o valor somado'
);
select is(
  (select jsonb_array_length(public.recibos_fila((select conta from ids)))), 1,
  'e as duas saem da fila'
);
select throws_ok(
  format($$select public.recibo_registrar(%L, jsonb_build_object('cobrancas', jsonb_build_array(%L), 'numero', 'RS-X', 'emitido_em', current_date))$$,
         (select conta from ids), (select c1 from ids)),
  'P0001', 'cobranca_com_recibo', 'cobrança com recibo não entra em outro'
);
select throws_ok(
  format($$select public.recibo_registrar(%L, jsonb_build_object('cobrancas', jsonb_build_array(%L), 'numero', 'RS-2026-001', 'emitido_em', current_date))$$,
         (select conta from ids), (select c3 from ids)),
  '23505', null, 'o mesmo número não se repete na conta'
);
select throws_ok(
  format($$select public.cobranca_desfazer(%L, %L, 'engano')$$, (select conta from ids), (select c1 from ids)),
  'P0001', 'cobranca_com_recibo', 'pagamento com recibo não se desfaz antes de cancelar o recibo'
);
select is(
  (select public.painel_financeiro((select conta from ids)) -> 'sem_recibo'), '1'::jsonb,
  'o painel conta os pagamentos sem recibo'
);

select lives_ok(
  format($$select public.recibo_cancelar(%L, %L, 'número digitado errado')$$, (select conta from ids), (select r from ids)),
  'cancela o registro do recibo com motivo'
);
select is(
  (select jsonb_array_length(public.recibos_fila((select conta from ids)))), 3,
  'e as cobranças voltam para a fila'
);
select ok(
  (select (e ->> 'cancelado_em') is not null from jsonb_array_elements(public.recibos_listar((select conta from ids))) e
    where e ->> 'id' = (select r from ids)::text),
  'o recibo cancelado continua na lista, marcado'
);

-- relatório do mês corrente
-- (as sessões são de 3 a 5 dias atrás: no começo do mês caem no mês anterior)
select is(
  (select sum((m ->> 'realizadas')::int)::int
     from jsonb_array_elements(public.relatorio_mensal((select conta from ids), current_date) -> 'por_mes') m),
  3, 'o relatório conta as realizadas, mês a mês'
);
select is(
  (select public.relatorio_mensal((select conta from ids), (now() - interval '3 days')::date) -> 'online'), '1'::jsonb,
  'e quantas foram online no mês'
);
select is(
  (select jsonb_array_length(public.relatorio_mensal((select conta from ids), current_date) -> 'por_mes')), 12,
  'e traz os 12 meses até o escolhido'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b8","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  format($$select public.recibos_fila(%L)$$, (select conta from ids)),
  'P0001', 'sem_acesso', 'outra conta não vê a fila'
);

select * from finish();
rollback;
