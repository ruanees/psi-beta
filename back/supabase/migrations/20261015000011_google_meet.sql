-- Fase 5b: link do Meet gerado pela plataforma, pela conta Google do psicólogo.
--
-- O psicólogo conecta a conta Google uma vez (Configurações). O back guarda o
-- refresh token CIFRADO com uma chave que só o Worker tem: o banco nunca vê o
-- token em claro e nada aqui o devolve ao front.
--
-- Cada paciente ganha UMA sala do Meet, criada na primeira sessão online e
-- usada em todas as seguintes, como o link do paciente (/sala/<token>).
-- Ordem do link da chamada: colado na sessão > Meet do paciente > fixo do perfil.

create table public.integracoes_google (
  membro_id      uuid primary key references public.membros (id) on delete cascade,
  conta_id       uuid not null references public.contas (id) on delete restrict,
  email_google   text not null check (length(email_google) between 3 and 254),
  token_cifrado  text not null check (length(token_cifrado) between 20 and 4000),
  conectada_em   timestamptz not null default now(),
  -- O Google recusou o token (revogado ou expirado): pede reconexão.
  falhou_em      timestamptz
);
alter table public.integracoes_google enable row level security;
revoke all on public.integracoes_google from anon, authenticated;

alter table public.salas_pacientes
  add column meet_link text check (meet_link ~ '^https://meet\.google\.com/[A-Za-z0-9_-]{3,100}$'),
  add column meet_espaco text check (meet_espaco ~ '^spaces/[A-Za-z0-9_-]{1,128}$');

-- O link da chamada de uma sessão, numa regra só.
create function privado.link_da_sessao(s uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(ls.link, sp.meet_link, pr.sala_link)
    from public.sessoes ss
    left join public.salas_sessoes ls on ls.sessao_id = ss.id
    left join public.salas_pacientes sp on sp.paciente_id = ss.paciente_id
    left join public.profissionais pr on pr.membro_id = ss.profissional_id
   where ss.id = s;
$$;

-- ------------------------------------------------------------ conexão com o Google

create function public.google_status(c uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_membro uuid := public.exigir_membro(c);
  g public.integracoes_google;
begin
  select * into g from public.integracoes_google where membro_id = v_membro;
  if not found then
    return jsonb_build_object('conectada', false);
  end if;
  return jsonb_build_object(
    'conectada', true,
    'email', g.email_google,
    'conectada_em', g.conectada_em,
    'falhou', g.falhou_em is not null
  );
end;
$$;

create function public.google_gravar(c uuid, email text, token text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_membro uuid := public.exigir_membro(c);
begin
  insert into public.integracoes_google (membro_id, conta_id, email_google, token_cifrado)
  values (v_membro, c, email, token)
  on conflict (membro_id) do update
    set email_google = excluded.email_google, token_cifrado = excluded.token_cifrado,
        conectada_em = now(), falhou_em = null;
  perform privado.registrar('editar', 'integracoes_google', v_membro, c);
end;
$$;

-- Desconecta e devolve o token cifrado, para o back revogá-lo no Google.
create function public.google_remover(c uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_membro uuid := public.exigir_membro(c);
  v text;
begin
  delete from public.integracoes_google where membro_id = v_membro returning token_cifrado into v;
  perform privado.registrar('editar', 'integracoes_google', v_membro, c);
  return v;
end;
$$;

-- O token (cifrado) do psicólogo do paciente, para criar a sala dele. Null se
-- não há conexão ou se o Google já recusou o token.
create function public.google_token(c uuid, p uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  pa public.pacientes;
begin
  perform public.exigir_membro(c);
  pa := privado.exigir_paciente(c, p);
  return (select g.token_cifrado from public.integracoes_google g
           where g.membro_id = pa.profissional_id and g.falhou_em is null);
end;
$$;

create function public.google_falhou(c uuid, p uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  pa public.pacientes;
begin
  perform public.exigir_membro(c);
  pa := privado.exigir_paciente(c, p);
  update public.integracoes_google set falhou_em = now() where membro_id = pa.profissional_id;
end;
$$;

-- Guarda a sala do Meet criada para o paciente.
create function public.sala_meet_gravar(c uuid, p uuid, link text, espaco text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  if not privado.link_valido(link) or link !~ '^https://meet\.google\.com/' then
    raise exception 'link_invalido' using errcode = 'P0001';
  end if;
  perform privado.token_do_paciente(c, p);
  update public.salas_pacientes set meet_link = link, meet_espaco = espaco where paciente_id = p;
  perform privado.registrar('editar', 'salas_pacientes', p, c, p);
end;
$$;

-- ------------------------------------------------------------ sala passa a ver o Meet do paciente

create or replace function public.sala_sessao(c uuid, s uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ss public.sessoes;
  v_perfil text;
  v_sessao text;
  v_meet text;
  v_epsi text;
  v_google text;
begin
  perform public.exigir_membro(c);
  select * into ss from public.sessoes where id = s and conta_id = c;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0001';
  end if;
  select p.sala_link, p.epsi_numero into v_perfil, v_epsi
    from public.profissionais p where p.membro_id = ss.profissional_id;
  select ls.link into v_sessao from public.salas_sessoes ls where ls.sessao_id = s;
  select sp.meet_link into v_meet from public.salas_pacientes sp where sp.paciente_id = ss.paciente_id;
  select case when g.falhou_em is null then 'conectada' else 'reconectar' end into v_google
    from public.integracoes_google g where g.membro_id = ss.profissional_id;
  return jsonb_build_object(
    'link', coalesce(v_sessao, v_meet, v_perfil),
    'link_sessao', v_sessao,
    'link_meet', v_meet,
    'link_perfil', v_perfil,
    'token', privado.token_do_paciente(c, ss.paciente_id),
    'epsi_ok', v_epsi is not null,
    'paciente_id', ss.paciente_id,
    'modalidade', ss.modalidade,
    'google', coalesce(v_google, 'desconectada')
  );
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
       and s.fim + interval '15 minutes' > now()
     order by s.inicio
     limit 1
  );
end;
$$;

create or replace function public.sala_publica(t text) returns jsonb
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
    v_link := privado.link_da_sessao(ss.id);
    v_situacao := case when v_link is null then 'sem_link' else 'aberta' end;
  end if;
  return jsonb_build_object(
    'profissional', v_nome, 'situacao', v_situacao, 'inicio', ss.inicio,
    'fim', ss.fim, 'abre_em', v_abre, 'link', v_link
  );
end;
$$;

-- ------------------------------------------------------------ permissões

revoke execute on function privado.link_da_sessao(uuid) from public, anon, authenticated;

revoke execute on function
  public.google_status(uuid), public.google_gravar(uuid, text, text), public.google_remover(uuid),
  public.google_token(uuid, uuid), public.google_falhou(uuid, uuid),
  public.sala_meet_gravar(uuid, uuid, text, text)
from public, anon;

grant execute on function
  public.google_status(uuid), public.google_gravar(uuid, text, text), public.google_remover(uuid),
  public.google_token(uuid, uuid), public.google_falhou(uuid, uuid),
  public.sala_meet_gravar(uuid, uuid, text, text)
to authenticated;
