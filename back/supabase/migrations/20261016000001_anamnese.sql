-- Anamnese: a ficha de saúde do paciente, parte do prontuário.
--
-- Uma por paciente. Dado clínico como a observação: só o psicólogo do paciente
-- lê e grava, toda leitura vai para a auditoria, e cada alteração guarda a
-- versão anterior (pelo trigger, nunca pelo Nest). Ao contrário da observação,
-- não trava com o tempo: a anamnese acompanha o paciente e é atualizada.
--
-- Laudo e medicação são estruturados (o que mais se procura de relance); o
-- resto é texto livre, um campo por tema.

create table public.anamneses (
  paciente_id             uuid primary key references public.pacientes (id) on delete cascade,
  conta_id                uuid not null references public.contas (id) on delete restrict,
  -- Possui laudo ou diagnóstico? sim | nao | nao_sabe; null = não respondido
  laudo                   text check (laudo in ('sim', 'nao', 'nao_sabe')),
  laudo_descricao         text check (length(laudo_descricao) <= 2000),
  medicacao               text check (medicacao in ('sim', 'nao', 'nao_sabe')),
  -- [{nome, dose, frequencia, prescritor}]
  medicacoes              jsonb not null default '[]'::jsonb,
  acompanhamentos         text check (length(acompanhamentos) <= 4000),
  saude_geral             text check (length(saude_geral) <= 4000),
  tratamentos_anteriores  text check (length(tratamentos_anteriores) <= 4000),
  historico_familiar      text check (length(historico_familiar) <= 4000),
  substancias             text check (length(substancias) <= 4000),
  sono_alimentacao        text check (length(sono_alimentacao) <= 4000),
  rotina                  text check (length(rotina) <= 4000),
  observacoes             text check (length(observacoes) <= 4000),
  versao                  integer not null default 1,
  autor                   uuid not null,
  criada_em               timestamptz not null default now(),
  alterada_em             timestamptz not null default now(),
  check (jsonb_typeof(medicacoes) = 'array' and jsonb_array_length(medicacoes) <= 30)
);
comment on table public.anamneses is 'Dado clínico: só pode_clinico() lê ou grava, e a leitura é auditada.';

create table public.anamneses_versoes (
  paciente_id  uuid not null references public.anamneses (paciente_id) on delete cascade,
  versao       integer not null,
  dados        jsonb not null,
  autor        uuid not null,
  gravada_em   timestamptz not null,
  primary key (paciente_id, versao)
);

alter table public.anamneses         enable row level security;
alter table public.anamneses_versoes enable row level security;
revoke all on public.anamneses, public.anamneses_versoes from anon, authenticated;

-- A versão anterior inteira vai para o histórico a cada mudança de conteúdo.
create function privado.guardar_versao_anamnese() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  antes jsonb := to_jsonb(old) - array['paciente_id', 'conta_id', 'versao', 'autor', 'criada_em', 'alterada_em'];
  depois jsonb := to_jsonb(new) - array['paciente_id', 'conta_id', 'versao', 'autor', 'criada_em', 'alterada_em'];
begin
  new.paciente_id := old.paciente_id;
  new.conta_id := old.conta_id;
  new.criada_em := old.criada_em;
  if antes is distinct from depois then
    insert into public.anamneses_versoes (paciente_id, versao, dados, autor, gravada_em)
    values (old.paciente_id, old.versao, antes, old.autor, old.alterada_em);
    new.versao := old.versao + 1;
    new.alterada_em := now();
  else
    new.versao := old.versao;
    new.alterada_em := old.alterada_em;
    new.autor := old.autor;
  end if;
  return new;
end;
$$;
create trigger anamneses_versao before update on public.anamneses
  for each row execute function privado.guardar_versao_anamnese();

-- Medicações: lista de objetos só com as quatro chaves de texto, nome obrigatório.
create function privado.medicacoes_validas(m jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(m) = 'array'
     and jsonb_array_length(m) <= 30
     and not exists (
       select 1 from jsonb_array_elements(m) e
        where jsonb_typeof(e) <> 'object'
           or exists (select 1 from jsonb_object_keys(e) k where k not in ('nome', 'dose', 'frequencia', 'prescritor'))
           or coalesce(length(btrim(e ->> 'nome')), 0) not between 1 and 120
           or coalesce(length(e ->> 'dose'), 0) > 120
           or coalesce(length(e ->> 'frequencia'), 0) > 120
           or coalesce(length(e ->> 'prescritor'), 0) > 120
     );
$$;

create function privado.exigir_clinico(c uuid, p uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  if not public.pode_clinico(p) then
    raise exception 'so_clinico' using errcode = 'P0001';
  end if;
end;
$$;

-- ------------------------------------------------------------ leitura e gravação

-- Sem registrar a leitura: quem chama decide (a leitura de tela registra; a ficha exportada registra "exportar").
create function privado.anamnese_json(p uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'laudo', a.laudo, 'laudo_descricao', a.laudo_descricao,
           'medicacao', a.medicacao, 'medicacoes', a.medicacoes,
           'acompanhamentos', a.acompanhamentos, 'saude_geral', a.saude_geral,
           'tratamentos_anteriores', a.tratamentos_anteriores, 'historico_familiar', a.historico_familiar,
           'substancias', a.substancias, 'sono_alimentacao', a.sono_alimentacao,
           'rotina', a.rotina, 'observacoes', a.observacoes,
           'versao', a.versao, 'criada_em', a.criada_em, 'alterada_em', a.alterada_em)
    from public.anamneses a where a.paciente_id = p;
$$;

-- Quem não é o psicólogo do paciente recebe só {pode_clinico: false}, sem erro.
create function public.anamnese_ler(c uuid, p uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  if not public.pode_clinico(p) then
    return jsonb_build_object('pode_clinico', false);
  end if;
  perform privado.registrar('ler', 'anamneses', p, c, p);
  return jsonb_build_object('pode_clinico', true) || coalesce(privado.anamnese_json(p), '{}'::jsonb);
end;
$$;

-- Grava só as chaves enviadas; null limpa. Cria a anamnese na primeira vez
-- (num insert só: a primeira gravação não deixa uma "versão vazia" no histórico).
create function public.anamnese_gravar(c uuid, p uuid, d jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.anamneses;
  v_novo boolean;
begin
  perform privado.exigir_clinico(c, p);
  if d ? 'medicacoes' and not privado.medicacoes_validas(coalesce(d -> 'medicacoes', '[]'::jsonb)) then
    raise exception 'medicacoes_invalidas' using errcode = 'P0001';
  end if;
  select * into a from public.anamneses where paciente_id = p;
  v_novo := not found;
  if v_novo then
    a.paciente_id := p;
    a.conta_id := c;
    a.medicacoes := '[]'::jsonb;
    a.versao := 1;
    a.criada_em := now();
    a.alterada_em := now();
  end if;
  if d ? 'laudo' then a.laudo := nullif(d ->> 'laudo', ''); end if;
  if d ? 'laudo_descricao' then a.laudo_descricao := nullif(btrim(d ->> 'laudo_descricao'), ''); end if;
  if d ? 'medicacao' then a.medicacao := nullif(d ->> 'medicacao', ''); end if;
  if d ? 'medicacoes' then a.medicacoes := coalesce(d -> 'medicacoes', '[]'::jsonb); end if;
  if d ? 'acompanhamentos' then a.acompanhamentos := nullif(btrim(d ->> 'acompanhamentos'), ''); end if;
  if d ? 'saude_geral' then a.saude_geral := nullif(btrim(d ->> 'saude_geral'), ''); end if;
  if d ? 'tratamentos_anteriores' then a.tratamentos_anteriores := nullif(btrim(d ->> 'tratamentos_anteriores'), ''); end if;
  if d ? 'historico_familiar' then a.historico_familiar := nullif(btrim(d ->> 'historico_familiar'), ''); end if;
  if d ? 'substancias' then a.substancias := nullif(btrim(d ->> 'substancias'), ''); end if;
  if d ? 'sono_alimentacao' then a.sono_alimentacao := nullif(btrim(d ->> 'sono_alimentacao'), ''); end if;
  if d ? 'rotina' then a.rotina := nullif(btrim(d ->> 'rotina'), ''); end if;
  if d ? 'observacoes' then a.observacoes := nullif(btrim(d ->> 'observacoes'), ''); end if;
  a.autor := auth.uid();

  if v_novo then
    insert into public.anamneses values (a.*);
  else
    -- O trigger decide se houve mudança e guarda a versão anterior.
    update public.anamneses set
      laudo = a.laudo, laudo_descricao = a.laudo_descricao, medicacao = a.medicacao, medicacoes = a.medicacoes,
      acompanhamentos = a.acompanhamentos, saude_geral = a.saude_geral,
      tratamentos_anteriores = a.tratamentos_anteriores, historico_familiar = a.historico_familiar,
      substancias = a.substancias, sono_alimentacao = a.sono_alimentacao, rotina = a.rotina,
      observacoes = a.observacoes, autor = a.autor
    where paciente_id = p;
  end if;
  perform privado.registrar(case when v_novo then 'criar' else 'editar' end, 'anamneses', p, c, p);
end;
$$;

-- ------------------------------------------------------------ cadastro já com a anamnese

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
  -- Anamnese inicial: idem, pelas mesmas regras da aba Anamnese.
  if jsonb_typeof(p -> 'anamnese') = 'object' and p -> 'anamnese' <> '{}'::jsonb then
    perform public.anamnese_gravar(c, v_id, p -> 'anamnese');
  end if;
  perform privado.conferir_menor(v_id);
  perform privado.registrar('criar', 'pacientes', v_id, c, v_id);
  return v_id;
end;
$$;

-- ------------------------------------------------------------ ficha exportada leva a anamnese

create or replace function public.ficha_clinica(c uuid, p uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ficha jsonb;
begin
  perform public.exigir_membro(c);
  perform privado.exigir_paciente(c, p);
  if not public.pode_clinico(p) then
    raise exception 'so_clinico' using errcode = 'P0001';
  end if;
  ficha := public.paciente_ler(c, p);
  perform privado.registrar('exportar', 'pacientes', p, c, p);
  return ficha || jsonb_build_object(
    'emitida_em', now(),
    'anamnese', privado.anamnese_json(p),
    'profissional', (
      select jsonb_build_object('nome', pr.nome, 'crp', pr.crp)
        from public.pacientes pa join public.profissionais pr on pr.membro_id = pa.profissional_id
       where pa.id = p),
    'sessoes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'inicio', s.inicio, 'fim', s.fim, 'modalidade', s.modalidade, 'status', s.status,
               'observacao', o.texto, 'alterada_em', o.alterada_em,
               'adendos', coalesce((
                 select jsonb_agg(jsonb_build_object('texto', a.texto, 'criado_em', a.criado_em) order by a.criado_em)
                   from public.adendos a where a.sessao_id = s.id), '[]'::jsonb)
             ) order by s.inicio)
        from public.sessoes s
        left join public.observacoes o on o.sessao_id = s.id
       where s.paciente_id = p and s.inicio <= now()), '[]'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------------ permissões

revoke execute on function
  privado.guardar_versao_anamnese(), privado.medicacoes_validas(jsonb), privado.exigir_clinico(uuid, uuid),
  privado.anamnese_json(uuid)
from public, anon, authenticated;

revoke execute on function public.anamnese_ler(uuid, uuid), public.anamnese_gravar(uuid, uuid, jsonb) from public, anon;
grant execute on function public.anamnese_ler(uuid, uuid), public.anamnese_gravar(uuid, uuid, jsonb) to authenticated;
