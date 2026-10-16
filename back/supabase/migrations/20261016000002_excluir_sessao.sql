-- Excluir sessão marcada por engano (data, horário ou repetição errados).
--
-- Excluir é diferente de desmarcar: a sessão some da agenda e do histórico, sem
-- contar como falta nem desmarcada. Por isso só sai o que não virou prontuário
-- nem dinheiro:
--   - com observação ou adendo: fica (prontuário tem guarda mínima de 5 anos);
--   - com pagamento recebido ou recibo: fica (desfazer o pagamento antes).
-- Cobrança ainda não paga sai junto, e a sessão de pacote volta ao saldo.
--
-- Numa repetição semanal dá para excluir só esta sessão ou a repetição inteira
-- (passadas e futuras). A repetição inteira também para de gerar sessões novas;
-- as que não podem sair ficam e a resposta conta quantas.

-- Por que a sessão não pode ser excluída, ou null se pode.
create function privado.bloqueio_exclusao(s uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.observacoes o where o.sessao_id = s)
      or exists (select 1 from public.adendos a where a.sessao_id = s) then 'excluir_com_observacao'
    when exists (select 1 from public.cobrancas cb where cb.sessao_id = s and cb.situacao = 'paga')
      or exists (select 1 from public.cobrancas cb join public.recibo_cobrancas rc on rc.cobranca_id = cb.id
                  where cb.sessao_id = s) then 'excluir_com_pagamento'
  end;
$$;

create function privado.apagar_sessao(s uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.cobrancas where sessao_id = s;
  -- salas_sessoes sai em cascata; o saldo do pacote é contado das sessões, então volta sozinho.
  delete from public.sessoes where id = s;
end;
$$;

-- escopo: 'esta' (só esta sessão) | 'repeticao' (todas as sessões da repetição)
-- Devolve {excluidas, mantidas}.
create function public.sessao_excluir(c uuid, s uuid, escopo text default 'esta') returns jsonb
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
  for r in select id from public.sessoes where recorrencia_id = rc.id order by inicio for update loop
    if privado.bloqueio_exclusao(r.id) is null then
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

revoke execute on function privado.bloqueio_exclusao(uuid), privado.apagar_sessao(uuid) from public, anon, authenticated;
revoke execute on function public.sessao_excluir(uuid, uuid, text) from public, anon;
grant execute on function public.sessao_excluir(uuid, uuid, text) to authenticated;
