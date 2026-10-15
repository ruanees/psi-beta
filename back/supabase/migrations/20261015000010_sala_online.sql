-- Fase 5a: sala da sessão online, com link colado.
--
-- O paciente recebe UM link dele (/sala/<token>), que serve para todas as
-- sessões online: a página pública mostra só a próxima sessão (data, hora,
-- nome do profissional) e libera o botão da chamada de 15 minutos antes até
-- 15 minutos depois do fim. O link da chamada (Meet ou outro) não circula
-- solto: só aparece nessa janela.
--
-- O link da chamada vem da sessão (colado para ela) ou, sem isso, do link
-- fixo do profissional no perfil. Na 5b a plataforma passa a gerar o do Meet.

alter table public.profissionais add column sala_link text
  check (sala_link ~ '^https://[^[:space:]<>"'']{4,}$' and length(sala_link) <= 300);

create table public.salas_pacientes (
  paciente_id  uuid primary key references public.pacientes (id) on delete cascade,
  conta_id     uuid not null references public.contas (id) on delete restrict,
  token        text not null unique check (token ~ '^[0-9a-f]{64}$'),
  criado_em    timestamptz not null default now()
);
comment on table public.salas_pacientes is
  'Link fixo do paciente para a sala online. O token é segredo: trocar invalida o anterior.';

create table public.salas_sessoes (
  sessao_id    uuid primary key references public.sessoes (id) on delete cascade,
  conta_id     uuid not null references public.contas (id) on delete restrict,
  origem       text not null default 'colado' check (origem in ('colado', 'google_meet')),
  link         text not null check (link ~ '^https://[^[:space:]<>"'']{4,}$' and length(link) <= 300),
  alterado_em  timestamptz not null default now()
);

alter table public.salas_pacientes enable row level security;
alter table public.salas_sessoes   enable row level security;
revoke all on public.salas_pacientes, public.salas_sessoes from anon, authenticated;

-- 256 bits de gen_random_uuid (244 aleatórios), em hexadecimal.
create function privado.novo_token() returns text
language sql volatile set search_path = '' as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

create function privado.token_do_paciente(c uuid, p uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v text;
begin
  select sp.token into v from public.salas_pacientes sp where sp.paciente_id = p;
  if v is null then
    insert into public.salas_pacientes (paciente_id, conta_id, token)
    values (p, c, privado.novo_token())
    on conflict (paciente_id) do nothing;
    select sp.token into v from public.salas_pacientes sp where sp.paciente_id = p;
  end if;
  return v;
end;
$$;

create function privado.link_valido(l text) returns boolean
language sql immutable set search_path = '' as $$
  select l ~ '^https://[^[:space:]<>"'']{4,}$' and length(l) <= 300;
$$;

-- ------------------------------------------------------------ profissional

-- A sala de uma sessão, para a janela da agenda.
create function public.sala_sessao(c uuid, s uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ss public.sessoes;
  v_perfil text;
  v_sessao text;
  v_epsi text;
begin
  perform public.exigir_membro(c);
  select * into ss from public.sessoes where id = s and conta_id = c;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0001';
  end if;
  select p.sala_link, p.epsi_numero into v_perfil, v_epsi
    from public.profissionais p where p.membro_id = ss.profissional_id;
  select ls.link into v_sessao from public.salas_sessoes ls where ls.sessao_id = s;
  return jsonb_build_object(
    'link', coalesce(v_sessao, v_perfil),
    'link_sessao', v_sessao,
    'link_perfil', v_perfil,
    'token', privado.token_do_paciente(c, ss.paciente_id),
    'epsi_ok', v_epsi is not null
  );
end;
$$;

-- Cola (ou limpa, com null) o link da chamada desta sessão.
create function public.sala_sessao_gravar(c uuid, s uuid, link text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ss public.sessoes;
  v text := nullif(btrim(link), '');
begin
  perform public.exigir_membro(c);
  select * into ss from public.sessoes where id = s and conta_id = c;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0001';
  end if;
  if v is null then
    delete from public.salas_sessoes where sessao_id = s;
  else
    if not privado.link_valido(v) then
      raise exception 'link_invalido' using errcode = 'P0001';
    end if;
    insert into public.salas_sessoes (sessao_id, conta_id, link) values (s, c, v)
    on conflict (sessao_id) do update set link = excluded.link, origem = 'colado', alterado_em = now();
  end if;
  perform privado.registrar('editar', 'salas_sessoes', s, c, ss.paciente_id);
end;
$$;

-- Troca o link do paciente: o anterior para de funcionar na hora.
create function public.sala_paciente_renovar(c uuid, p uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v text := privado.novo_token();
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  insert into public.salas_pacientes (paciente_id, conta_id, token) values (p, c, v)
  on conflict (paciente_id) do update set token = excluded.token, criado_em = now();
  perform privado.registrar('editar', 'salas_pacientes', p, c, p);
  return v;
end;
$$;

-- A próxima sessão online (hoje ou adiante), para o Início.
create function public.proxima_online(c uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  return (
    select jsonb_build_object(
             'id', s.id, 'paciente_id', s.paciente_id, 'paciente_nome', pa.nome,
             'inicio', s.inicio, 'fim', s.fim, 'modalidade', s.modalidade, 'status', s.status,
             'recorrencia_id', s.recorrencia_id, 'link', coalesce(ls.link, pr.sala_link))
      from public.sessoes s
      join public.pacientes pa on pa.id = s.paciente_id
      left join public.salas_sessoes ls on ls.sessao_id = s.id
      left join public.profissionais pr on pr.membro_id = s.profissional_id
     where s.conta_id = c and s.modalidade = 'online'
       and s.status in ('agendada', 'confirmada')
       and s.fim + interval '15 minutes' > now()
     order by s.inicio
     limit 1
  );
end;
$$;

-- ------------------------------------------------------------ paciente (sem login)

-- A página pública da sala. Devolve só a próxima sessão online do paciente:
-- quando, com quem e, dentro da janela, o link da chamada. Nada do paciente.
create function public.sala_publica(t text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  sp public.salas_pacientes;
  ss public.sessoes;
  v_nome text;
  v_link text;
  v_abre timestamptz;
  v_situacao text;
begin
  if t is null or t !~ '^[0-9a-f]{64}$' then
    raise exception 'sala_nao_encontrada' using errcode = 'P0001';
  end if;
  select * into sp from public.salas_pacientes where token = t;
  if not found then
    raise exception 'sala_nao_encontrada' using errcode = 'P0001';
  end if;
  select pr.nome into v_nome
    from public.pacientes pa join public.profissionais pr on pr.membro_id = pa.profissional_id
   where pa.id = sp.paciente_id;

  -- 'realizada' entra: o psicólogo pode marcar presença com a chamada em andamento.
  select * into ss from public.sessoes s
   where s.paciente_id = sp.paciente_id and s.modalidade = 'online'
     and s.status in ('agendada', 'confirmada', 'realizada')
     and s.fim + interval '15 minutes' > now()
   order by s.inicio
   limit 1;
  if not found then
    return jsonb_build_object('profissional', v_nome, 'situacao', 'sem_sessao');
  end if;

  v_abre := ss.inicio - interval '15 minutes';
  if now() < v_abre then
    v_situacao := 'cedo';
  else
    select coalesce(ls.link, pr.sala_link) into v_link
      from public.profissionais pr
      left join public.salas_sessoes ls on ls.sessao_id = ss.id
     where pr.membro_id = ss.profissional_id;
    v_situacao := case when v_link is null then 'sem_link' else 'aberta' end;
  end if;
  return jsonb_build_object(
    'profissional', v_nome,
    'situacao', v_situacao,
    'inicio', ss.inicio,
    'fim', ss.fim,
    'abre_em', v_abre,
    'link', v_link
  );
end;
$$;

-- ------------------------------------------------------------ perfil ganha o link fixo

create or replace function public.perfil_gravar(c uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_membro uuid := public.exigir_membro(c);
begin
  if nullif(btrim(p ->> 'sala_link'), '') is not null
     and not privado.link_valido(btrim(p ->> 'sala_link')) then
    raise exception 'link_invalido' using errcode = 'P0001';
  end if;
  update public.profissionais set
    nome                = case when p ? 'nome' then p ->> 'nome' else nome end,
    crp                 = case when p ? 'crp' then nullif(p ->> 'crp', '') else crp end,
    epsi_numero         = case when p ? 'epsi_numero' then nullif(p ->> 'epsi_numero', '') else epsi_numero end,
    valor_sessao_padrao = case when p ? 'valor_sessao_padrao'
                               then (p ->> 'valor_sessao_padrao')::numeric else valor_sessao_padrao end,
    sala_link           = case when p ? 'sala_link' then nullif(btrim(p ->> 'sala_link'), '') else sala_link end
  where membro_id = v_membro;
  if not found then
    raise exception 'sem_acesso' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.conta_ler(c uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_membro uuid := public.exigir_membro(c);
begin
  return (
    select jsonb_build_object(
      'id', ct.id,
      'nome', ct.nome,
      'papeis', to_jsonb(m.papeis),
      'perfil', (
        select jsonb_build_object(
          'nome', p.nome,
          'crp', p.crp,
          'epsi_numero', p.epsi_numero,
          'valor_sessao_padrao', p.valor_sessao_padrao,
          'sala_link', p.sala_link
        ) from public.profissionais p where p.membro_id = m.id
      ),
      'configuracoes', (
        select jsonb_build_object(
          'falta_cobra_avulsa', cf.falta_cobra_avulsa,
          'aviso_minimo_horas', cf.aviso_minimo_horas,
          'inatividade_minutos', cf.inatividade_minutos,
          'vencimento_mensal_dia', cf.vencimento_mensal_dia
        ) from public.configuracoes cf where cf.conta_id = ct.id
      )
    )
    from public.contas ct
    join public.membros m on m.conta_id = ct.id and m.id = v_membro
  );
end;
$$;

-- ------------------------------------------------------------ permissões

revoke execute on function privado.novo_token(), privado.token_do_paciente(uuid, uuid), privado.link_valido(text)
from public, anon, authenticated;

revoke execute on function
  public.sala_sessao(uuid, uuid), public.sala_sessao_gravar(uuid, uuid, text),
  public.sala_paciente_renovar(uuid, uuid), public.proxima_online(uuid), public.sala_publica(text)
from public, anon;

grant execute on function
  public.sala_sessao(uuid, uuid), public.sala_sessao_gravar(uuid, uuid, text),
  public.sala_paciente_renovar(uuid, uuid), public.proxima_online(uuid)
to authenticated;

-- A única função de negócio aberta sem login.
grant execute on function public.sala_publica(text) to anon, authenticated;
