-- Transferir pacientes de um psicólogo para outro, dentro do consultório.
--
-- É decisão do consultório, e quem responde por ele é o titular: só ele
-- transfere (so_titular). O backoffice não entra aqui; ele nem vê paciente.
--
-- O caso que pede isto: o psicólogo que saiu (backoffice, "tirar acesso")
-- deixa os pacientes guardados, e ninguém lê o clínico deles. Transferir
-- passa o paciente, com o prontuário, para outro psicólogo do consultório:
-- pode_clinico segue o paciente, então quem recebe passa a ler e escrever o
-- clínico, e quem entregou deixa de ler. Serve também entre dois psicólogos
-- que continuam no consultório.
--
-- O que muda e o que fica:
--  - o paciente passa a ser do psicólogo de destino;
--  - as sessões futuras (agendadas ou confirmadas) e a repetição semanal
--    em vigor vão junto: é ele quem atende daqui para a frente;
--  - as sessões passadas ficam com quem atendeu, e o que cada um escreveu no
--    prontuário continua sendo de quem escreveu;
--  - a sala do Meet do paciente, criada pela conta Google de quem entregou,
--    é solta: a próxima sessão online cria outra pela conta de quem recebe.
--
-- Choque de agenda é recusado antes de mexer em nada (agenda_em_choque):
-- uma sessão futura do paciente no mesmo horário de uma sessão de quem recebe.
--
-- Cada transferência fica registrada (paciente_transferencias), com o
-- motivo, e na auditoria, por paciente.

create table public.paciente_transferencias (
  id           uuid primary key default gen_random_uuid(),
  conta_id     uuid not null references public.contas (id) on delete restrict,
  paciente_id  uuid not null references public.pacientes (id) on delete cascade,
  de           uuid not null references public.membros (id) on delete restrict,
  para         uuid not null references public.membros (id) on delete restrict,
  motivo       text check (length(motivo) <= 500),
  quem         uuid not null,
  em           timestamptz not null default now()
);
create index paciente_transferencias_conta_em on public.paciente_transferencias (conta_id, em desc);

alter table public.paciente_transferencias enable row level security;
-- Nenhuma política: só as funções abaixo leem e gravam.
revoke all on public.paciente_transferencias from anon, authenticated;

-- ------------------------------------------------------------ apoio

create function privado.exigir_titular(c uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  if not public.tem_papel(c, 'titular') then
    raise exception 'so_titular' using errcode = 'P0001';
  end if;
end;
$$;

-- Como o psicólogo aparece: o nome do perfil profissional, ou o e-mail.
create function privado.nome_do_membro(m uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(pr.nome, u.email)
    from public.membros mb
    join auth.users u on u.id = mb.user_id
    left join public.profissionais pr on pr.membro_id = mb.id
   where mb.id = m;
$$;

revoke all on function privado.exigir_titular(uuid), privado.nome_do_membro(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------ leitura

-- Os psicólogos do consultório, para escolher de quem e para quem: quem tem
-- perfil profissional ou paciente, saído ou não. `ativo` é quem pode receber.
create function public.equipe_psicologos(c uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform privado.exigir_titular(c);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'membro_id', x.id,
             'nome', x.nome,
             'ativo', x.ativo,
             'pacientes', x.pacientes
           ) order by x.ativo desc, lower(x.nome))
      from (
        select m.id, privado.nome_do_membro(m.id) as nome,
               m.removido_em is null and 'psicologo' = any (m.papeis) as ativo,
               (select count(*) from public.pacientes pa where pa.profissional_id = m.id) as pacientes
          from public.membros m
         where m.conta_id = c
           and (exists (select 1 from public.profissionais pr where pr.membro_id = m.id)
                or exists (select 1 from public.pacientes pa where pa.profissional_id = m.id))
      ) x
  ), '[]'::jsonb);
end;
$$;

-- Os pacientes de um psicólogo, com a próxima sessão: o que vai junto.
-- Nada clínico (nem queixa, nem prontuário).
create function public.pacientes_do_psicologo(c uuid, m uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform privado.exigir_titular(c);
  if not exists (select 1 from public.membros where id = m and conta_id = c) then
    raise exception 'nao_encontrado' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', pa.id,
             'nome', pa.nome,
             'situacao', pa.situacao,
             'proxima_sessao', (
               select min(s.inicio) from public.sessoes s
                where s.paciente_id = pa.id and s.inicio >= now() and s.status in ('agendada', 'confirmada')
             )
           ) order by pa.situacao = 'arquivado', lower(pa.nome))
      from public.pacientes pa
     where pa.conta_id = c and pa.profissional_id = m
  ), '[]'::jsonb);
end;
$$;

-- As últimas transferências do consultório.
create function public.transferencias_listar(c uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform privado.exigir_titular(c);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id,
             'paciente_id', t.paciente_id,
             'paciente', pa.nome,
             'de', privado.nome_do_membro(t.de),
             'para', privado.nome_do_membro(t.para),
             'motivo', t.motivo,
             'quem', (select u.email from auth.users u where u.id = t.quem),
             'em', t.em
           ) order by t.em desc)
      from (select * from public.paciente_transferencias where conta_id = c order by em desc limit 50) t
      join public.pacientes pa on pa.id = t.paciente_id
  ), '[]'::jsonb);
end;
$$;

-- ------------------------------------------------------------ escrita

-- d = { de, para, pacientes?: [id], motivo? }. Sem `pacientes`, vão todos os
-- pacientes de `de`. Devolve quantos foram.
create function public.pacientes_transferir(c uuid, d jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_de      uuid := (d ->> 'de')::uuid;
  v_para    uuid := (d ->> 'para')::uuid;
  v_motivo  text := nullif(btrim(d ->> 'motivo'), '');
  v_lista   uuid[];
  v_ids     uuid[];
  p         uuid;
begin
  perform privado.exigir_titular(c);
  if not exists (select 1 from public.membros where id = v_de and conta_id = c) then
    raise exception 'nao_encontrado' using errcode = 'P0001';
  end if;
  if v_para is null or v_para = v_de or not exists (
       select 1 from public.membros m
        where m.id = v_para and m.conta_id = c and m.removido_em is null and 'psicologo' = any (m.papeis)
     ) then
    raise exception 'destino_invalido' using errcode = 'P0001';
  end if;

  if d ? 'pacientes' and jsonb_typeof(d -> 'pacientes') = 'array' then
    select coalesce(array_agg(distinct x::uuid), '{}') into v_lista from jsonb_array_elements_text(d -> 'pacientes') x;
    if exists (
         select 1 from unnest(v_lista) i
          where not exists (select 1 from public.pacientes pa where pa.id = i and pa.conta_id = c and pa.profissional_id = v_de)
       ) then
      raise exception 'paciente_de_outro' using errcode = 'P0001';
    end if;
  end if;

  -- Trava os pacientes que vão: duas transferências ao mesmo tempo não se cruzam.
  select coalesce(array_agg(pa.id order by pa.id), '{}') into v_ids
    from (
      select pa.id from public.pacientes pa
       where pa.conta_id = c and pa.profissional_id = v_de and (v_lista is null or pa.id = any (v_lista))
       order by pa.id
         for update
    ) pa;
  if cardinality(v_ids) = 0 then
    raise exception 'nada_a_transferir' using errcode = 'P0001';
  end if;

  if exists (
       select 1
         from public.sessoes s
         join public.sessoes o
           on o.profissional_id = v_para and o.status <> 'cancelada'
          and not (o.paciente_id = any (v_ids))
          and tstzrange(o.inicio, o.fim) && tstzrange(s.inicio, s.fim)
        where s.paciente_id = any (v_ids) and s.inicio >= now() and s.status in ('agendada', 'confirmada')
     ) then
    raise exception 'agenda_em_choque' using errcode = 'P0001';
  end if;

  update public.pacientes set profissional_id = v_para where id = any (v_ids);
  update public.sessoes set profissional_id = v_para, alterada_em = now()
   where paciente_id = any (v_ids) and inicio >= now() and status in ('agendada', 'confirmada');
  update public.recorrencias set profissional_id = v_para
   where paciente_id = any (v_ids) and (fim is null or fim >= privado.hoje());
  update public.salas_pacientes set meet_link = null, meet_espaco = null where paciente_id = any (v_ids);

  foreach p in array v_ids loop
    insert into public.paciente_transferencias (conta_id, paciente_id, de, para, motivo, quem)
    values (c, p, v_de, v_para, v_motivo, auth.uid());
    perform privado.registrar('editar', 'pacientes', p, c, p);
  end loop;
  return cardinality(v_ids);
end;
$$;

grant execute on function public.equipe_psicologos(uuid), public.pacientes_do_psicologo(uuid, uuid),
  public.transferencias_listar(uuid), public.pacientes_transferir(uuid, jsonb) to authenticated;
