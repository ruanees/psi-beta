-- Escolha de contexto depois do login: quem é super-admin e também atende
-- num consultório escolhe por onde entrar, a operação (o Senda) ou o
-- backoffice. Os dois apps perguntam a mesma coisa ao banco: plataforma_eu.
--
-- `consultorios` é quantos consultórios este login alcança. É o próprio
-- vínculo de quem pergunta, não dado de ninguém.

create or replace function public.plataforma_eu() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sem_acesso' using errcode = 'P0001';
  end if;
  if not public.aal_ok() then
    raise exception 'segundo_fator' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'id', auth.uid(),
    'email', (select u.email from auth.users u where u.id = auth.uid()),
    'super', exists (select 1 from public.super_admins s where s.user_id = auth.uid()),
    'consultorios', (select count(*) from public.membros m where m.user_id = auth.uid())
  );
end;
$$;
