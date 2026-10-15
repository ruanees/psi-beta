-- Plano (avulsa, pacote ou mensal) escolhido já no cadastro do paciente.
-- Sem a chave `plano`, o paciente nasce avulso, como antes.

create or replace function public.paciente_criar(c uuid, p jsonb, resps jsonb default '[]') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_membro uuid := public.exigir_membro(c);
  v_id uuid;
  r jsonb;
begin
  if coalesce((p ->> 'consentimento')::boolean, false) is not true then
    raise exception 'consentimento' using errcode = 'P0001';
  end if;
  insert into public.pacientes (conta_id, profissional_id, nome, nascimento, cpf, telefone,
                                queixa_principal, valor_sessao, consentimento_em)
  values (c, v_membro, btrim(p ->> 'nome'), (p ->> 'nascimento')::date, nullif(p ->> 'cpf', ''),
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
  perform privado.conferir_menor(v_id);
  perform privado.registrar('criar', 'pacientes', v_id, c, v_id);
  return v_id;
end;
$$;
