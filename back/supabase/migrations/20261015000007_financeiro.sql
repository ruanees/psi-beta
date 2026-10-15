-- Fase 3 — financeiro e pacotes.
--
-- Quem cobra é o banco, não a tela: quando uma sessão vira realizada ou falta,
-- um trigger decide o que ela consome, uma vez só.
--   1. Paciente com pacote com saldo: a sessão gasta uma sessão do pacote mais antigo.
--   2. Senão, pelo plano:
--      avulsa  — cobrança da sessão (valor do paciente, ou o padrão do consultório);
--                falta também é cobrada, salvo se a conta desligar (falta_cobra_avulsa);
--      pacote  — pacote acabou: cobrança da sessão pelo valor por sessão do pacote;
--      mensal  — nada por sessão: a mensalidade do mês cobre.
-- Pacote é pago adiantado: nasce com uma cobrança do valor inteiro.
-- Mensalidade nasce no mês, para cada paciente ativo no plano mensal, com
-- vencimento no dia escolhido nas Configurações (padrão 10).
--
-- "Vencida" não é gravada: é pendente com vencimento antes de hoje.

alter table public.configuracoes
  add column vencimento_mensal_dia smallint not null default 10 check (vencimento_mensal_dia between 1 and 28);

create table public.pacotes (
  id           uuid primary key default gen_random_uuid(),
  conta_id     uuid not null references public.contas (id) on delete restrict,
  paciente_id  uuid not null references public.pacientes (id) on delete restrict,
  quantidade   smallint not null check (quantidade between 1 and 100),
  valor        numeric(10, 2) not null check (valor >= 0 and valor < 100000),
  criado_em    timestamptz not null default now()
);
create index pacotes_paciente on public.pacotes (paciente_id, criado_em);

alter table public.sessoes add column pacote_id uuid references public.pacotes (id) on delete restrict;
create index sessoes_pacote on public.sessoes (pacote_id) where pacote_id is not null;

create table public.cobrancas (
  id           uuid primary key default gen_random_uuid(),
  conta_id     uuid not null references public.contas (id) on delete restrict,
  paciente_id  uuid not null references public.pacientes (id) on delete restrict,
  origem       text not null check (origem in ('sessao', 'pacote', 'mensal')),
  sessao_id    uuid unique references public.sessoes (id) on delete restrict,
  pacote_id    uuid unique references public.pacotes (id) on delete restrict,
  referencia   date,  -- mensal: primeiro dia do mês cobrado
  valor        numeric(10, 2) not null check (valor >= 0 and valor < 100000),
  vencimento   date not null,
  situacao     text not null default 'pendente' check (situacao in ('pendente', 'paga', 'cancelada')),
  forma        text check (forma in ('pix', 'dinheiro', 'cartao', 'transferencia', 'boleto')),
  paga_em      date,
  motivo       text check (length(motivo) <= 300),
  criada_em    timestamptz not null default now(),
  check ((origem = 'sessao') = (sessao_id is not null)),
  check ((origem = 'pacote') = (pacote_id is not null)),
  check ((origem = 'mensal') = (referencia is not null)),
  check ((situacao = 'paga') = (forma is not null and paga_em is not null))
);
create unique index cobrancas_mensal on public.cobrancas (paciente_id, referencia) where origem = 'mensal';
create index cobrancas_conta_vencimento on public.cobrancas (conta_id, vencimento desc);
create index cobrancas_paciente on public.cobrancas (paciente_id);

alter table public.pacotes   enable row level security;
alter table public.cobrancas enable row level security;
revoke all on public.pacotes, public.cobrancas from anon, authenticated;

-- Saldo de pacote: a única conta. Gasta quem tem pacote_id, e só realizada ou
-- falta recebem pacote_id (o trigger abaixo).
create view privado.pacote_saldo as
  select pc.id as pacote_id, pc.paciente_id, pc.quantidade,
         (select count(*) from public.sessoes s where s.pacote_id = pc.id)::int as usadas,
         pc.quantidade - (select count(*) from public.sessoes s where s.pacote_id = pc.id)::int as restantes
    from public.pacotes pc;
revoke all on privado.pacote_saldo from public;

-- ------------------------------------------------------------ sessão encerrada

-- Sessão realizada, com falta ou desmarcada não volta a ser agendada: o que ela
-- consumiu (pacote, cobrança) já foi registrado. Só realizada ↔ falta se corrige.
create function privado.travar_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'cancelada' and new.status <> 'cancelada'
     or old.status in ('realizada', 'falta') and new.status not in ('realizada', 'falta') then
    raise exception 'sessao_encerrada' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger sessoes_status_travado before update of status on public.sessoes
  for each row execute function privado.travar_status();

create function privado.ao_encerrar_sessao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  pa public.pacientes;
  v_pacote uuid;
  v_valor numeric;
begin
  if new.status not in ('realizada', 'falta') or old.status in ('realizada', 'falta') then
    return null;
  end if;
  if new.pacote_id is not null or exists (select 1 from public.cobrancas cb where cb.sessao_id = new.id) then
    return null;
  end if;
  select * into pa from public.pacientes where id = new.paciente_id;

  select ps.pacote_id into v_pacote
    from privado.pacote_saldo ps join public.pacotes pc on pc.id = ps.pacote_id
   where ps.paciente_id = pa.id and ps.restantes > 0
   order by pc.criado_em
   limit 1;
  if v_pacote is not null then
    update public.sessoes set pacote_id = v_pacote where id = new.id;
    return null;
  end if;

  if pa.plano = 'mensal' then
    return null;
  elsif pa.plano = 'pacote' then
    v_valor := round(pa.plano_valor / pa.plano_sessoes, 2);
  else
    if new.status = 'falta'
       and not coalesce((select cf.falta_cobra_avulsa from public.configuracoes cf where cf.conta_id = new.conta_id), true) then
      return null;
    end if;
    v_valor := coalesce(pa.valor_sessao,
                        (select pr.valor_sessao_padrao from public.profissionais pr where pr.membro_id = pa.profissional_id),
                        0);
  end if;
  insert into public.cobrancas (conta_id, paciente_id, origem, sessao_id, valor, vencimento)
  values (new.conta_id, pa.id, 'sessao', new.id, v_valor, (new.inicio at time zone 'America/Sao_Paulo')::date)
  on conflict do nothing;
  return null;
end;
$$;
create trigger sessoes_encerrada after update of status on public.sessoes
  for each row execute function privado.ao_encerrar_sessao();

-- Mensalidade do mês corrente para quem está no plano mensal. Chamada ao abrir
-- o financeiro, como a repetição semanal é estendida ao abrir a agenda.
-- A primeira mensalidade de um paciente não nasce vencida: quem entrou no
-- plano mensal depois do dia de vencimento paga a partir de hoje.
create function privado.gerar_mensalidades(c uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.cobrancas (conta_id, paciente_id, origem, referencia, valor, vencimento)
  select pa.conta_id, pa.id, 'mensal', date_trunc('month', privado.hoje())::date, pa.plano_valor,
         case when exists (select 1 from public.cobrancas cb where cb.paciente_id = pa.id and cb.origem = 'mensal')
              then date_trunc('month', privado.hoje())::date + (cf.vencimento_mensal_dia - 1)
              else greatest(date_trunc('month', privado.hoje())::date + (cf.vencimento_mensal_dia - 1), privado.hoje())
         end
    from public.pacientes pa
    join public.configuracoes cf on cf.conta_id = pa.conta_id
   where pa.conta_id = c and pa.plano = 'mensal' and pa.situacao = 'ativo'
  on conflict (paciente_id, referencia) where origem = 'mensal' do nothing;
$$;

revoke all on function privado.travar_status(), privado.ao_encerrar_sessao(), privado.gerar_mensalidades(uuid) from public;

-- ------------------------------------------------------------ pacotes

-- Vende um pacote: quantidade e valor vêm do pedido ou, sem eles, do plano do paciente.
create function public.pacote_criar(c uuid, p uuid, d jsonb default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pa public.pacientes;
  v_qtd smallint;
  v_valor numeric;
  v_id uuid;
begin
  perform public.exigir_membro(c);
  pa := privado.exigir_paciente(c, p);
  v_qtd := coalesce((d ->> 'quantidade')::smallint, pa.plano_sessoes);
  v_valor := coalesce((d ->> 'valor')::numeric, pa.plano_valor);
  if v_qtd is null or v_valor is null then
    raise exception 'pacote_incompleto' using errcode = 'P0001';
  end if;
  insert into public.pacotes (conta_id, paciente_id, quantidade, valor)
  values (c, p, v_qtd, v_valor)
  returning id into v_id;
  insert into public.cobrancas (conta_id, paciente_id, origem, pacote_id, valor, vencimento)
  values (c, p, 'pacote', v_id, v_valor, privado.hoje());
  perform privado.registrar('criar', 'pacotes', v_id, c, p);
  return v_id;
end;
$$;

create function public.pacotes_listar(c uuid, p uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', pc.id, 'quantidade', pc.quantidade, 'valor', pc.valor, 'criado_em', pc.criado_em,
             'usadas', ps.usadas, 'restantes', ps.restantes,
             'cobranca', (select jsonb_build_object('id', cb.id, 'situacao', cb.situacao, 'vencimento', cb.vencimento)
                            from public.cobrancas cb where cb.pacote_id = pc.id)
           ) order by pc.criado_em desc)
      from public.pacotes pc join privado.pacote_saldo ps on ps.pacote_id = pc.id
     where pc.paciente_id = p), '[]'::jsonb);
end;
$$;

-- ------------------------------------------------------------ cobranças

-- filtro: {situacao: pendente|vencida|paga|cancelada, de, ate (vencimento), paciente_id}
create function public.cobrancas_listar(c uuid, filtro jsonb default '{}')
returns table (
  id uuid, paciente_id uuid, paciente_nome text, origem text, valor numeric, vencimento date,
  situacao text, forma text, paga_em date, motivo text, sessao_id uuid, sessao_inicio timestamptz,
  pacote_id uuid, pacote_quantidade smallint, referencia date
)
language plpgsql security definer set search_path = '' as $$
declare
  hoje date;
begin
  perform public.exigir_membro(c);
  perform privado.gerar_mensalidades(c);
  hoje := privado.hoje();
  return query
    select x.* from (
      select cb.id, cb.paciente_id, pa.nome, cb.origem, cb.valor, cb.vencimento,
             case when cb.situacao = 'pendente' and cb.vencimento < hoje then 'vencida' else cb.situacao end,
             cb.forma, cb.paga_em, cb.motivo, cb.sessao_id, s.inicio, cb.pacote_id, pc.quantidade, cb.referencia
        from public.cobrancas cb
        join public.pacientes pa on pa.id = cb.paciente_id
        left join public.sessoes s on s.id = cb.sessao_id
        left join public.pacotes pc on pc.id = cb.pacote_id
       where cb.conta_id = c
         and (filtro ->> 'paciente_id' is null or cb.paciente_id = (filtro ->> 'paciente_id')::uuid)
         and (filtro ->> 'de' is null or cb.vencimento >= (filtro ->> 'de')::date)
         and (filtro ->> 'ate' is null or cb.vencimento <= (filtro ->> 'ate')::date)
    ) x (id, paciente_id, nome, origem, valor, vencimento, situacao, forma, paga_em, motivo, sessao_id, inicio,
         pacote_id, quantidade, referencia)
     where filtro ->> 'situacao' is null
        or x.situacao = filtro ->> 'situacao'
        -- "pendentes" inclui as vencidas: as duas ainda não foram pagas
        or (filtro ->> 'situacao' = 'pendente' and x.situacao = 'vencida')
     order by x.vencimento desc, x.nome
     limit 1000;
end;
$$;

create function privado.exigir_cobranca(c uuid, cb uuid) returns public.cobrancas
language plpgsql security definer set search_path = '' as $$
declare
  v public.cobrancas;
begin
  select * into v from public.cobrancas where id = cb and conta_id = c for update;
  if not found then
    raise exception 'nao_encontrado' using errcode = 'P0001';
  end if;
  return v;
end;
$$;
revoke all on function privado.exigir_cobranca(uuid, uuid) from public;

create function public.cobranca_pagar(c uuid, cb uuid, forma text, paga_em date default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.cobrancas;
begin
  perform public.exigir_membro(c);
  v := privado.exigir_cobranca(c, cb);
  if v.situacao <> 'pendente' then
    raise exception 'cobranca_nao_pendente' using errcode = 'P0001';
  end if;
  if coalesce(paga_em, privado.hoje()) > privado.hoje() then
    raise exception 'pagamento_futuro' using errcode = 'P0001';
  end if;
  update public.cobrancas
     set situacao = 'paga', forma = cobranca_pagar.forma, paga_em = coalesce(cobranca_pagar.paga_em, privado.hoje()), motivo = null
   where id = cb;
  perform privado.registrar('editar', 'cobrancas', cb, c, v.paciente_id);
end;
$$;

-- Desfaz um pagamento lançado errado. O motivo fica na cobrança e a mudança, na auditoria.
create function public.cobranca_desfazer(c uuid, cb uuid, motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.cobrancas;
begin
  perform public.exigir_membro(c);
  v := privado.exigir_cobranca(c, cb);
  if v.situacao <> 'paga' then
    raise exception 'cobranca_nao_paga' using errcode = 'P0001';
  end if;
  if motivo is null or btrim(motivo) = '' then
    raise exception 'motivo_obrigatorio' using errcode = 'P0001';
  end if;
  update public.cobrancas set situacao = 'pendente', forma = null, paga_em = null, motivo = btrim(cobranca_desfazer.motivo)
   where id = cb;
  perform privado.registrar('editar', 'cobrancas', cb, c, v.paciente_id);
end;
$$;

-- Dispensa uma cobrança pendente (cortesia, lançada por engano). Não apaga: fica cancelada, com motivo.
create function public.cobranca_cancelar(c uuid, cb uuid, motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.cobrancas;
begin
  perform public.exigir_membro(c);
  v := privado.exigir_cobranca(c, cb);
  if v.situacao <> 'pendente' then
    raise exception 'cobranca_nao_pendente' using errcode = 'P0001';
  end if;
  if motivo is null or btrim(motivo) = '' then
    raise exception 'motivo_obrigatorio' using errcode = 'P0001';
  end if;
  update public.cobrancas set situacao = 'cancelada', motivo = btrim(cobranca_cancelar.motivo) where id = cb;
  perform privado.registrar('editar', 'cobrancas', cb, c, v.paciente_id);
end;
$$;

-- Corrige o valor de uma cobrança ainda pendente (ex.: nasceu com zero por falta de valor padrão).
create function public.cobranca_valor(c uuid, cb uuid, valor numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.cobrancas;
begin
  perform public.exigir_membro(c);
  v := privado.exigir_cobranca(c, cb);
  if v.situacao <> 'pendente' then
    raise exception 'cobranca_nao_pendente' using errcode = 'P0001';
  end if;
  update public.cobrancas set valor = cobranca_valor.valor where id = cb;
  perform privado.registrar('editar', 'cobrancas', cb, c, v.paciente_id);
end;
$$;

-- O que uma sessão consumiu: "sessão 3 de 10" do pacote, ou a cobrança dela.
create function public.sessao_financeiro(c uuid, s uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ss public.sessoes;
begin
  perform public.exigir_membro(c);
  ss := privado.exigir_sessao(c, s);
  return jsonb_build_object(
    'pacote', (
      select jsonb_build_object('id', pc.id, 'quantidade', pc.quantidade,
               'numero', (select count(*) from public.sessoes x
                           where x.pacote_id = pc.id and (x.inicio, x.id) <= (ss.inicio, ss.id)))
        from public.pacotes pc where pc.id = ss.pacote_id),
    'cobranca', (
      select jsonb_build_object('id', cb.id, 'valor', cb.valor, 'vencimento', cb.vencimento, 'forma', cb.forma,
               'paga_em', cb.paga_em,
               'situacao', case when cb.situacao = 'pendente' and cb.vencimento < privado.hoje() then 'vencida'
                                else cb.situacao end)
        from public.cobrancas cb where cb.sessao_id = s)
  );
end;
$$;

-- Resumo do Início e do topo do Financeiro.
create function public.painel_financeiro(c uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  hoje date;
begin
  perform public.exigir_membro(c);
  perform privado.gerar_mensalidades(c);
  hoje := privado.hoje();
  return jsonb_build_object(
    'a_receber', coalesce((select sum(cb.valor) from public.cobrancas cb where cb.conta_id = c and cb.situacao = 'pendente'), 0),
    'vencidas', (select count(*) from public.cobrancas cb
                  where cb.conta_id = c and cb.situacao = 'pendente' and cb.vencimento < hoje),
    'valor_vencido', coalesce((select sum(cb.valor) from public.cobrancas cb
                                where cb.conta_id = c and cb.situacao = 'pendente' and cb.vencimento < hoje), 0),
    'recebido_mes', coalesce((select sum(cb.valor) from public.cobrancas cb
                               where cb.conta_id = c and cb.situacao = 'paga'
                                 and cb.paga_em >= date_trunc('month', hoje)::date), 0),
    -- pacote do paciente ativo acabando: soma do saldo de todos os pacotes dele até 1
    'pacotes_acabando', coalesce((
      select jsonb_agg(jsonb_build_object('paciente_id', x.id, 'paciente_nome', x.nome, 'restantes', x.restantes)
                       order by x.restantes, x.nome)
        from (
          select pa.id, pa.nome, sum(ps.restantes)::int as restantes
            from public.pacientes pa join privado.pacote_saldo ps on ps.paciente_id = pa.id
           where pa.conta_id = c and pa.situacao = 'ativo'
           group by pa.id, pa.nome
          having sum(ps.restantes) <= 1
        ) x), '[]'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------------ permissões

revoke execute on function
  public.pacote_criar(uuid, uuid, jsonb), public.pacotes_listar(uuid, uuid), public.cobrancas_listar(uuid, jsonb),
  public.cobranca_pagar(uuid, uuid, text, date), public.cobranca_desfazer(uuid, uuid, text),
  public.cobranca_cancelar(uuid, uuid, text), public.cobranca_valor(uuid, uuid, numeric),
  public.sessao_financeiro(uuid, uuid), public.painel_financeiro(uuid)
from public, anon;

grant execute on function
  public.pacote_criar(uuid, uuid, jsonb), public.pacotes_listar(uuid, uuid), public.cobrancas_listar(uuid, jsonb),
  public.cobranca_pagar(uuid, uuid, text, date), public.cobranca_desfazer(uuid, uuid, text),
  public.cobranca_cancelar(uuid, uuid, text), public.cobranca_valor(uuid, uuid, numeric),
  public.sessao_financeiro(uuid, uuid), public.painel_financeiro(uuid)
to authenticated;

-- ------------------------------------------------------------ funções que mudam

-- Configurações ganham o dia de vencimento da mensalidade; excluir paciente
-- passa a recusar quem já tem pacote ou cobrança (registro financeiro fica).
-- ---- conta_ler
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
          'valor_sessao_padrao', p.valor_sessao_padrao
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

-- ---- configuracoes_gravar
create or replace function public.configuracoes_gravar(c uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  if not public.tem_papel(c, 'titular') then
    raise exception 'so_titular' using errcode = 'P0001';
  end if;
  update public.configuracoes set
    falta_cobra_avulsa   = case when p ? 'falta_cobra_avulsa'
                                then (p ->> 'falta_cobra_avulsa')::boolean else falta_cobra_avulsa end,
    aviso_minimo_horas   = case when p ? 'aviso_minimo_horas'
                                then (p ->> 'aviso_minimo_horas')::integer else aviso_minimo_horas end,
    inatividade_minutos  = case when p ? 'inatividade_minutos'
                                then (p ->> 'inatividade_minutos')::integer else inatividade_minutos end,
    vencimento_mensal_dia = case when p ? 'vencimento_mensal_dia'
                                then (p ->> 'vencimento_mensal_dia')::smallint else vencimento_mensal_dia end
  where conta_id = c;
  perform privado.registrar('editar', 'configuracoes', null, c);
end;
$$;

-- ---- paciente_excluir
create or replace function public.paciente_excluir(c uuid, p uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  if exists (select 1 from public.sessoes s where s.paciente_id = p and s.status in ('realizada', 'falta')) then
    raise exception 'paciente_com_atendimento' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.cobrancas cb where cb.paciente_id = p)
     or exists (select 1 from public.pacotes pc where pc.paciente_id = p) then
    raise exception 'paciente_com_financeiro' using errcode = 'P0001';
  end if;
  delete from public.sessoes where paciente_id = p;
  delete from public.recorrencias where paciente_id = p;
  delete from public.responsaveis where paciente_id = p;
  delete from public.pacientes where id = p;
  perform privado.registrar('excluir', 'pacientes', p, c, p);
end;
$$;
