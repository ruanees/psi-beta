-- Excluir paciente cadastrado por engano.
--
-- O prontuário tem guarda mínima de 5 anos (Resolução CFP 001/2009): paciente
-- com atendimento registrado (sessão realizada ou falta) não se exclui, se
-- arquiva. Sem atendimento, o cadastro é só um cadastro e pode sair inteiro:
-- sessões futuras, repetição e responsáveis vão junto. A auditoria guarda que
-- houve a exclusão, por quem e quando — sem o nome, que deixou de existir.

alter table public.auditoria drop constraint auditoria_acao_check;
alter table public.auditoria add constraint auditoria_acao_check
  check (acao in ('ler', 'criar', 'editar', 'arquivar', 'exportar', 'excluir'));

create function public.paciente_excluir(c uuid, p uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  if exists (select 1 from public.sessoes s where s.paciente_id = p and s.status in ('realizada', 'falta')) then
    raise exception 'paciente_com_atendimento' using errcode = 'P0001';
  end if;
  delete from public.sessoes where paciente_id = p;
  delete from public.recorrencias where paciente_id = p;
  delete from public.responsaveis where paciente_id = p;
  delete from public.pacientes where id = p;
  perform privado.registrar('excluir', 'pacientes', p, c, p);
end;
$$;

revoke execute on function public.paciente_excluir(uuid, uuid) from public, anon;
grant execute on function public.paciente_excluir(uuid, uuid) to authenticated;
