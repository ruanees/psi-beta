-- Backoffice: dar acesso a um consultório que já existe para um login que já
-- existe (o login nasce pela função admin-contas). É a "Quem entra" da ficha.
--
-- O que a pessoa alcança é o que o banco já decide pelos papéis: quem é
-- membro vê o que é do consultório; dado clínico de um paciente, só o
-- psicólogo dele (pode_clinico). Esta função não muda nenhuma regra de
-- acesso, só cria o vínculo.
--
-- Psicólogo ganha perfil profissional (profissionais), com o nome: é o que o
-- consultório escolhe na agenda e no cadastro do paciente. Os outros papéis
-- não atendem e não ganham perfil.

create function public.plataforma_membro_adicionar(c uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_email  text := lower(btrim(p ->> 'email'));
  v_nome   text := nullif(btrim(p ->> 'nome'), '');
  v_papeis text[];
  v_user   uuid;
  v_membro uuid;
begin
  perform public.exigir_super();
  if not exists (select 1 from public.contas where id = c) then
    raise exception 'conta_inexistente' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_papeis
    from jsonb_array_elements_text(coalesce(p -> 'papeis', '[]'::jsonb)) x;
  if cardinality(v_papeis) = 0
     or not v_papeis <@ array['titular', 'psicologo', 'recepcao', 'financeiro'] then
    raise exception 'papeis_invalidos' using errcode = 'P0001';
  end if;
  if 'psicologo' = any (v_papeis) and v_nome is null then
    raise exception 'nome_obrigatorio' using errcode = 'P0001';
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = v_email;
  if v_user is null then
    raise exception 'email_sem_login' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.membros m where m.conta_id = c and m.user_id = v_user) then
    raise exception 'ja_membro' using errcode = 'P0001';
  end if;
  -- A mesma regra do cliente novo: um login responde por um consultório só.
  if 'titular' = any (v_papeis)
     and exists (select 1 from public.membros m where m.user_id = v_user and 'titular' = any (m.papeis)) then
    raise exception 'login_ja_titular' using errcode = 'P0001';
  end if;

  insert into public.membros (conta_id, user_id, papeis) values (c, v_user, v_papeis) returning id into v_membro;
  if 'psicologo' = any (v_papeis) then
    insert into public.profissionais (membro_id, nome) values (v_membro, v_nome);
  end if;
  perform privado.registrar('criar', 'membros', v_membro, c);
  return v_membro;
end;
$$;

revoke execute on function public.plataforma_membro_adicionar(uuid, jsonb) from public, anon;
grant execute on function public.plataforma_membro_adicionar(uuid, jsonb) to authenticated;
