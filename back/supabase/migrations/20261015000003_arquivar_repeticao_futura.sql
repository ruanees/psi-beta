-- Dar alta ou arquivar falhava ("Algum valor está fora do permitido") quando a
-- repetição semanal ainda não tinha começado: o fim virava ontem, antes do
-- início, e a regra `fim >= inicio - 1` recusava. Agora a repetição que ainda
-- não começou termina na véspera do próprio início, ou seja, fica vazia.
--
-- Repetição ativa passa a ser: sem fim, ou com fim a partir de hoje E a partir do
-- próprio início. Sem a segunda parte, a vazia continuaria aparecendo na ficha
-- (o mesmo valia para "encerrar repetição" na primeira sessão de uma futura).

create or replace function public.paciente_situacao(c uuid, p uuid, nova text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  if nova not in ('ativo', 'alta', 'arquivado') then
    raise exception 'transicao_invalida' using errcode = 'P0001';
  end if;
  update public.pacientes set situacao = nova where id = p;
  if nova <> 'ativo' then
    update public.recorrencias set fim = greatest(privado.hoje(), inicio) - 1
     where paciente_id = p and (fim is null or fim >= privado.hoje());
    delete from public.sessoes
     where paciente_id = p and inicio > now() and status in ('agendada', 'confirmada') and recorrencia_id is not null;
    update public.sessoes set status = 'cancelada', desmarcada_em = now(), alterada_em = now()
     where paciente_id = p and inicio > now() and status in ('agendada', 'confirmada');
  end if;
  perform privado.registrar(case when nova = 'arquivado' then 'arquivar' else 'editar' end, 'pacientes', p, c, p);
end;
$$;

-- A ficha: só a linha da repetição muda.
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
