-- Situação da sessão trocada pela janela da agenda.
--
-- Antes, sessão realizada, com falta ou desmarcada não mudava mais. Agora dá
-- para corrigir um lançamento errado:
--   realizada ou falta → agendada ou confirmada: desfaz o que a sessão consumiu
--     (devolve a sessão ao pacote e apaga a cobrança ainda não paga). Recusa
--     se a cobrança já foi paga (desfaça o pagamento antes) ou se a sessão já
--     tem observação ou adendo (prontuário não se apaga).
--   desmarcada → agendada ou confirmada: reativa; se o horário já estiver
--     ocupado, a regra de choque de horário recusa.
-- Continua proibido: realizada ou falta virar desmarcada (é correção para
-- agendada primeiro) e qualquer volta para desmarcada fora do fluxo de desmarcar.

create or replace function privado.travar_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if old.status in ('realizada', 'falta') and new.status = 'cancelada' then
    raise exception 'sessao_encerrada' using errcode = 'P0001';
  end if;
  if old.status in ('realizada', 'falta') and new.status in ('agendada', 'confirmada') then
    if exists (select 1 from public.observacoes o where o.sessao_id = new.id)
       or exists (select 1 from public.adendos a where a.sessao_id = new.id) then
      raise exception 'sessao_com_observacao' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.cobrancas cb where cb.sessao_id = new.id and cb.situacao = 'paga') then
      raise exception 'sessao_com_pagamento' using errcode = 'P0001';
    end if;
    delete from public.cobrancas cb where cb.sessao_id = new.id;
    new.pacote_id := null;
  end if;
  return new;
end;
$$;
