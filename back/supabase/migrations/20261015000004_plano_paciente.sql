-- Plano do paciente: como ele paga.
--   avulsa — sessão a sessão; o valor é o `valor_sessao` que já existia (vazio usa o padrão da conta).
--   pacote — N sessões pagas adiantado, sem validade; `plano_valor` é o valor do pacote.
--   mensal — valor fixo por mês; `plano_sessoes` (opcional) é quantas sessões o mês cobre.
-- Aqui fica só o combinado atual. O que foi cobrado e o saldo do pacote são do
-- Financeiro (fase 3), que copia o valor para a cobrança: mudar o plano não
-- reescreve o passado.

alter table public.pacientes
  add column plano text not null default 'avulsa' check (plano in ('avulsa', 'pacote', 'mensal')),
  add column plano_sessoes smallint check (plano_sessoes between 1 and 100),
  add column plano_valor numeric(10, 2) check (plano_valor >= 0 and plano_valor < 100000),
  add constraint pacientes_plano_completo check (
    (plano = 'avulsa' and plano_sessoes is null and plano_valor is null)
    or (plano = 'pacote' and plano_sessoes >= 2 and plano_valor is not null)
    or (plano = 'mensal' and plano_valor is not null)
  );

-- Grava o plano inteiro de uma vez: tipo, sessões e valor mudam juntos.
create function public.paciente_plano(c uuid, p uuid, d jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_plano text := d ->> 'plano';
  v_sessoes smallint := (d ->> 'sessoes')::smallint;
  v_valor numeric := (d ->> 'valor')::numeric;
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  if v_plano is null or v_plano not in ('avulsa', 'pacote', 'mensal') then
    raise exception 'plano_invalido' using errcode = 'P0001';
  end if;
  if (v_plano = 'pacote' and (v_sessoes is null or v_sessoes < 2 or v_valor is null))
     or (v_plano = 'mensal' and v_valor is null) then
    raise exception 'plano_incompleto' using errcode = 'P0001';
  end if;
  if v_plano = 'avulsa' then
    update public.pacientes set plano = 'avulsa', plano_sessoes = null, plano_valor = null, valor_sessao = v_valor
     where id = p;
  else
    update public.pacientes set plano = v_plano, plano_sessoes = v_sessoes, plano_valor = v_valor
     where id = p;
  end if;
  perform privado.registrar('editar', 'pacientes', p, c, p);
end;
$$;
revoke execute on function public.paciente_plano(uuid, uuid, jsonb) from public, anon;
grant execute on function public.paciente_plano(uuid, uuid, jsonb) to authenticated;

-- A ficha passa a trazer o plano.
create or replace function public.paciente_ler(c uuid, p uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pa public.pacientes;
  clinico boolean;
begin
  perform public.exigir_membro(c);
  pa := privado.exigir_paciente(c, p);
  clinico := public.pode_clinico(p);
  if clinico then
    perform privado.registrar('ler', 'pacientes', p, c, p);
  end if;
  return jsonb_build_object(
    'id', pa.id,
    'nome', pa.nome,
    'nascimento', pa.nascimento,
    'cpf', pa.cpf,
    'telefone', pa.telefone,
    'queixa_principal', case when clinico then pa.queixa_principal end,
    'pode_clinico', clinico,
    'valor_sessao', pa.valor_sessao,
    'plano', jsonb_build_object(
      'tipo', pa.plano,
      'sessoes', pa.plano_sessoes,
      'valor', case when pa.plano = 'avulsa' then pa.valor_sessao else pa.plano_valor end),
    'situacao', pa.situacao,
    'consentimento_em', pa.consentimento_em,
    'criado_em', pa.criado_em,
    'responsaveis', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'nome', r.nome, 'parentesco', r.parentesco,
               'telefone', r.telefone, 'cpf', r.cpf, 'financeiro', r.financeiro
             ) order by r.criado_em)
        from public.responsaveis r where r.paciente_id = p), '[]'::jsonb),
    'proxima_sessao', (
      select jsonb_build_object('id', s.id, 'inicio', s.inicio, 'fim', s.fim,
                                'modalidade', s.modalidade, 'status', s.status)
        from public.sessoes s
       where s.paciente_id = p and s.inicio >= now() and s.status in ('agendada', 'confirmada')
       order by s.inicio limit 1),
    'repeticao', (
      select jsonb_build_object('id', rc.id, 'dia_semana', rc.dia_semana, 'hora', to_char(rc.hora, 'HH24:MI'),
                                'duracao_min', rc.duracao_min, 'modalidade', rc.modalidade)
        from public.recorrencias rc
       where rc.paciente_id = p and (rc.fim is null or rc.fim >= greatest(privado.hoje(), rc.inicio))
       order by rc.criada_em desc limit 1),
    'contagem', jsonb_build_object(
      'realizadas', (select count(*) from public.sessoes s where s.paciente_id = p and s.status = 'realizada'),
      'faltas', (select count(*) from public.sessoes s where s.paciente_id = p and s.status = 'falta'),
      'canceladas', (select count(*) from public.sessoes s where s.paciente_id = p and s.status = 'cancelada')
    )
  );
end;
$$;
