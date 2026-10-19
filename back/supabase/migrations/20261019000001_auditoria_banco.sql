-- Correções de banco da auditoria de 19/10/2026 (B1, B4, B7 e privilégios padrão).

-- ------------------------------------------------ B1: a anamnese não sai com o paciente
-- A anamnese é prontuário e tem guarda mínima de 5 anos (CFP). Antes ela saía em
-- cascata quando o cadastro era excluído; agora o banco recusa, como já recusa
-- paciente com atendimento. O caminho para quem não é mais atendido é Arquivar.

alter table public.anamneses drop constraint anamneses_paciente_id_fkey;
alter table public.anamneses
  add constraint anamneses_paciente_id_fkey
  foreign key (paciente_id) references public.pacientes (id) on delete restrict;

create or replace function public.paciente_excluir(c uuid, p uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  if exists (select 1 from public.sessoes s where s.paciente_id = p and s.status in ('realizada', 'falta')) then
    raise exception 'paciente_com_atendimento' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.anamneses a where a.paciente_id = p) then
    raise exception 'paciente_com_anamnese' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.cobrancas cb where cb.paciente_id = p)
     or exists (select 1 from public.pacotes pc where pc.paciente_id = p) then
    raise exception 'paciente_com_financeiro' using errcode = 'P0001';
  end if;
  delete from public.sessoes where paciente_id = p;
  delete from public.recorrencias where paciente_id = p;
  delete from public.responsaveis where paciente_id = p;
  delete from public.pacientes where id = p;
  perform privado.registrar('excluir', 'pacientes', p, c, p);
end;
$$;

-- ------------------------------------------------ B4: a repetição excluída guarda o que aconteceu
-- Excluir a repetição inteira apagava também as sessões realizadas, as faltas e
-- as desmarcadas sem observação, que são histórico (inclusive financeiro). Agora
-- saem só as agendadas e as confirmadas; as outras contam como mantidas.
-- Excluir só esta sessão continua igual: é a correção de um lançamento pontual.

create or replace function public.sessao_excluir(c uuid, s uuid, escopo text default 'esta') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ss public.sessoes;
  rc public.recorrencias;
  v_bloqueio text;
  v_excluidas int := 0;
  v_mantidas int := 0;
  r record;
begin
  perform public.exigir_membro(c);
  select * into ss from public.sessoes where id = s and conta_id = c for update;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0001';
  end if;

  if escopo = 'esta' then
    v_bloqueio := privado.bloqueio_exclusao(s);
    if v_bloqueio is not null then
      raise exception '%', v_bloqueio using errcode = 'P0001';
    end if;
    perform privado.apagar_sessao(s);
    perform privado.registrar('excluir', 'sessoes', s, c, ss.paciente_id);
    return jsonb_build_object('excluidas', 1, 'mantidas', 0);
  end if;

  if escopo <> 'repeticao' then
    raise exception 'transicao_invalida' using errcode = 'P0001';
  end if;
  if ss.recorrencia_id is null then
    raise exception 'sem_recorrencia' using errcode = 'P0001';
  end if;

  select * into rc from public.recorrencias where id = ss.recorrencia_id for update;
  -- A repetição para de gerar sessões (fim antes do início).
  update public.recorrencias set fim = rc.inicio - 1 where id = rc.id;
  for r in select id, status from public.sessoes where recorrencia_id = rc.id order by inicio for update loop
    if r.status in ('agendada', 'confirmada') and privado.bloqueio_exclusao(r.id) is null then
      perform privado.apagar_sessao(r.id);
      v_excluidas := v_excluidas + 1;
    else
      v_mantidas := v_mantidas + 1;
    end if;
  end loop;
  if v_mantidas = 0 then
    delete from public.recorrencias where id = rc.id;
  end if;
  perform privado.registrar('excluir', 'recorrencias', rc.id, c, rc.paciente_id);
  return jsonb_build_object('excluidas', v_excluidas, 'mantidas', v_mantidas);
end;
$$;

-- ------------------------------------------------ B7: agenda sem varredura completa
-- `s.fim > de` e `s.fim + 15 min > now()` não usam índice: a busca lia todas as
-- sessões da conta até a data pedida. Sessão dura no máximo 8 horas (check da
-- tabela), então quem termina depois de `de` começou depois de `de - 8 h`. Com
-- esse limite inferior, sessoes_conta_inicio (conta_id, inicio) atende as duas.

create or replace function public.agenda_listar(c uuid, de timestamptz, ate timestamptz)
returns table (
  id uuid, paciente_id uuid, paciente_nome text, inicio timestamptz, fim timestamptz,
  modalidade text, status text, recorrencia_id uuid
)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  if ate <= de or ate - de > interval '62 days' then
    raise exception 'periodo_invalido' using errcode = 'P0001';
  end if;
  perform privado.estender_recorrencias(c, greatest((ate at time zone 'America/Sao_Paulo')::date, privado.horizonte()));
  return query
    select s.id, s.paciente_id, pa.nome, s.inicio, s.fim, s.modalidade, s.status, s.recorrencia_id
      from public.sessoes s
      join public.pacientes pa on pa.id = s.paciente_id
     where s.conta_id = c and s.inicio < ate and s.inicio > de - interval '8 hours' and s.fim > de
     order by s.inicio;
end;
$$;

create or replace function public.proxima_online(c uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  return (
    select jsonb_build_object(
             'id', s.id, 'paciente_id', s.paciente_id, 'paciente_nome', pa.nome,
             'inicio', s.inicio, 'fim', s.fim, 'modalidade', s.modalidade, 'status', s.status,
             'recorrencia_id', s.recorrencia_id, 'link', privado.link_da_sessao(s.id))
      from public.sessoes s
      join public.pacientes pa on pa.id = s.paciente_id
     where s.conta_id = c and s.modalidade = 'online'
       and s.status in ('agendada', 'confirmada')
       and s.inicio > now() - interval '8 hours 15 minutes'
       and s.fim + interval '15 minutes' > now()
     order by s.inicio
     limit 1
  );
end;
$$;

-- ------------------------------------------------ privilégios padrão
-- O Supabase concede a anon e authenticated tudo o que nasce em public. Aqui,
-- toda tabela nova já começa fechada e toda função nova sem execute: cada
-- migration concede o que precisa, de propósito (como as atuais já fazem).

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
-- O execute para PUBLIC é padrão global do Postgres e não sai por schema: sai para tudo o que o postgres criar.
alter default privileges for role postgres revoke execute on functions from public;
