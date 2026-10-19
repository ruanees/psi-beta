-- Papéis aplicados de verdade (auditoria de 19/10/2026, S2).
--
-- Antes, o profissional do paciente e da sessão era sempre quem chamava: a
-- recepção que cadastrava um paciente virava a "psicóloga" dele e passava a ler
-- o prontuário. Agora:
--   - dado clínico exige, além de ser o profissional do paciente, o papel psicólogo;
--   - o paciente nasce com um psicólogo da conta: o escolhido, quem cadastra (se
--     for psicólogo) ou o único psicólogo da conta;
--   - a sessão é sempre com o psicólogo do paciente, quem quer que agende.

create or replace function public.pode_clinico(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and public.aal_ok()
     and exists (
           select 1 from public.pacientes pa
             join public.membros m on m.id = pa.profissional_id
            where pa.id = p and m.user_id = auth.uid() and 'psicologo' = any (m.papeis)
         );
$$;

-- Psicólogo responsável por um paciente novo.
create function privado.psicologo_do_cadastro(c uuid, escolhido uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid;
  v_qtd int;
begin
  if escolhido is not null then
    select m.id into v_id from public.membros m
     where m.id = escolhido and m.conta_id = c and 'psicologo' = any (m.papeis);
    if v_id is null then
      raise exception 'profissional_invalido' using errcode = 'P0001';
    end if;
    return v_id;
  end if;
  select m.id into v_id from public.membros m
   where m.conta_id = c and m.user_id = auth.uid() and 'psicologo' = any (m.papeis);
  if v_id is not null then
    return v_id;
  end if;
  select (array_agg(m.id))[1], count(*) into v_id, v_qtd from public.membros m
   where m.conta_id = c and 'psicologo' = any (m.papeis);
  if v_qtd <> 1 then
    raise exception 'profissional_obrigatorio' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;
revoke execute on function privado.psicologo_do_cadastro(uuid, uuid) from public, anon, authenticated;

create or replace function public.paciente_criar(c uuid, p jsonb, resps jsonb default '[]') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_membro uuid := public.exigir_membro(c);
  v_psicologo uuid := privado.psicologo_do_cadastro(c, nullif(p ->> 'profissional_id', '')::uuid);
  v_id uuid;
  r jsonb;
begin
  if coalesce((p ->> 'consentimento')::boolean, false) is not true then
    raise exception 'consentimento' using errcode = 'P0001';
  end if;
  insert into public.pacientes (conta_id, profissional_id, nome, nascimento, cpf, telefone,
                                queixa_principal, valor_sessao, consentimento_em)
  values (c, v_psicologo, btrim(p ->> 'nome'), (p ->> 'nascimento')::date, nullif(p ->> 'cpf', ''),
          nullif(p ->> 'telefone', ''), nullif(p ->> 'queixa_principal', ''),
          (p ->> 'valor_sessao')::numeric, now())
  returning id into v_id;
  for r in select * from jsonb_array_elements(coalesce(resps, '[]'::jsonb)) loop
    insert into public.responsaveis (paciente_id, nome, parentesco, telefone, cpf, financeiro)
    values (v_id, btrim(r ->> 'nome'), nullif(r ->> 'parentesco', ''), nullif(r ->> 'telefone', ''),
            nullif(r ->> 'cpf', ''), coalesce((r ->> 'financeiro')::boolean, false));
  end loop;
  -- Plano já no cadastro: na mesma transação, com as mesmas regras de quando muda na ficha.
  if p ? 'plano' then
    perform public.paciente_plano(c, v_id, p -> 'plano');
  end if;
  -- Anamnese inicial: idem, pelas mesmas regras da aba Anamnese (só o psicólogo grava).
  if jsonb_typeof(p -> 'anamnese') = 'object' and p -> 'anamnese' <> '{}'::jsonb then
    perform public.anamnese_gravar(c, v_id, p -> 'anamnese');
  end if;
  perform privado.conferir_menor(v_id);
  perform privado.registrar('criar', 'pacientes', v_id, c, v_id);
  return v_id;
end;
$$;

create or replace function public.sessao_criar(c uuid, d jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_membro uuid := public.exigir_membro(c);
  pa public.pacientes;
  v_inicio timestamptz := (d ->> 'inicio')::timestamptz;
  v_dur int := (d ->> 'duracao_min')::int;
  v_mod text := d ->> 'modalidade';
  v_local timestamp;
  v_rec uuid;
  v_id uuid;
begin
  pa := privado.exigir_paciente(c, (d ->> 'paciente_id')::uuid);
  if pa.situacao <> 'ativo' then
    raise exception 'paciente_inativo' using errcode = 'P0001';
  end if;
  -- A sessão é com o psicólogo do paciente, não com quem agendou (a recepção, por exemplo).
  if coalesce((d ->> 'repetir_semanal')::boolean, false) then
    v_local := v_inicio at time zone 'America/Sao_Paulo';
    insert into public.recorrencias (conta_id, paciente_id, profissional_id, dia_semana, hora, duracao_min,
                                     modalidade, inicio, gerada_ate)
    values (c, pa.id, pa.profissional_id, extract(dow from v_local)::smallint, v_local::time, v_dur, v_mod,
            v_local::date, v_local::date)
    returning id into v_rec;
  end if;
  -- A primeira sessão entra explicitamente: um choque nela é erro, não pulo silencioso.
  insert into public.sessoes (conta_id, paciente_id, profissional_id, recorrencia_id, inicio, fim, modalidade)
  values (c, pa.id, pa.profissional_id, v_rec, v_inicio, v_inicio + make_interval(mins => v_dur), v_mod)
  returning id into v_id;
  if v_rec is not null then
    perform privado.gerar_recorrencia(v_rec, privado.horizonte());
  end if;
  perform privado.registrar('criar', 'sessoes', v_id, c, pa.id);
  return v_id;
end;
$$;
