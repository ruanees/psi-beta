'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CampoGravavel } from '@/components/CampoGravavel';
import { useApp } from '@/components/EstadoApp';
import { Icone } from '@/components/Icone';
import { FinanceiroPaciente } from '@/components/FinanceiroPaciente';
import { HistoricoPaciente } from '@/components/HistoricoPaciente';
import { PacotesPaciente, SaldoPacote } from '@/components/PacotesPaciente';
import { Recibos } from '@/components/Recibos';
import { LinhaSessao } from '@/components/LinhaSessao';
import { AcessosPaciente } from '@/components/AcessosPaciente';
import { AnamnesePaciente, SaudeResumo } from '@/components/AnamnesePaciente';
import { PlanoPaciente } from '@/components/PlanoPaciente';
import { iniciais } from '@/components/Moldura';
import { SessaoJanela, type ModoSessao } from '@/components/SessaoJanela';
import { api, type Dto } from '@/lib/api.ts';
import { cpfFormatado, soDigitos } from '@/lib/campos.ts';
import { DIAS_DA_SEMANA, diaPorExtenso, hoje, idade, partes } from '@/lib/datas.ts';
import { duracao, fd } from '@/lib/formato.ts';
import { resumoPlano } from '@/lib/planos.ts';
import { MODALIDADE, SITUACAO_PACIENTE, STATUS_SESSAO } from '@/lib/status.ts';

// Ficha do paciente. Abas do beta (PLANO.md, seção 05): Resumo, Sessões e

type Paciente = Dto<'PacienteDto'>;
type Aba = 'resumo' | 'anamnese' | 'sessoes' | 'historico' | 'pacotes' | 'financeiro' | 'recibos' | 'dados';

const ABAS: { id: Aba | string; rotulo: string; pronta: boolean; fase?: number }[] = [
  { id: 'resumo', rotulo: 'Resumo', pronta: true },
  { id: 'anamnese', rotulo: 'Anamnese', pronta: true },
  { id: 'sessoes', rotulo: 'Sessões', pronta: true },
  { id: 'historico', rotulo: 'Histórico', pronta: true },
  { id: 'dados', rotulo: 'Dados', pronta: true },
  { id: 'pacotes', rotulo: 'Pacotes', pronta: true },
  { id: 'financeiro', rotulo: 'Financeiro', pronta: true },
  { id: 'recibos', rotulo: 'Recibos', pronta: true },
];

export default function FichaDoPaciente() {
  const { id } = useParams<{ id: string }>();
  const { conta } = useApp();
  const [p, setP] = useState<Paciente | null>(null);
  const [sessoes, setSessoes] = useState<Dto<'SessaoDoPacienteDto'>[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('resumo');
  const [janela, setJanela] = useState<ModoSessao | null>(null);
  const [recarga, setRecarga] = useState(0);

  const carregar = useCallback(async () => {
    try {
      const params = { conta: conta.id, paciente: id };
      const [ficha, lista] = await Promise.all([
        api('get', '/contas/{conta}/pacientes/{paciente}', { params }),
        api('get', '/contas/{conta}/pacientes/{paciente}/sessoes', { params }),
      ]);
      // A Cloudflare pode publicar o front antes do back: sem o plano na resposta,
      // a ficha abre como avulsa em vez de quebrar a página inteira.
      setP({ ...ficha, plano: ficha.plano ?? { tipo: 'avulsa', sessoes: null, valor: ficha.valorSessao } });
      setSessoes(lista);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar o paciente.');
    }
  }, [conta.id, id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro && !p) {
    return (
      <div className="pilha">
        <Link className="lk pequeno" href="/pacientes">
          ← Pacientes
        </Link>
        <div className="aviso" data-t="erro">
          {erro}
        </div>
      </div>
    );
  }
  if (!p) return <p className="mudo">Carregando…</p>;

  const params = { conta: conta.id, paciente: p.id };
  const gravar = async (corpo: Dto<'PacienteParcialDto'>) => {
    await api('patch', '/contas/{conta}/pacientes/{paciente}', { params, corpo });
    await carregar();
  };
  const anos = idade(p.nascimento);
  const st = SITUACAO_PACIENTE[p.situacao];
  const abrirSessao = (s: Dto<'SessaoDoPacienteDto'>) =>
    setJanela({ tipo: 'ver', sessao: { ...s, pacienteId: p.id, pacienteNome: p.nome } });

  return (
    <div className="pilha">
      <Link className="lk pequeno" href="/pacientes">
        ← Pacientes
      </Link>

      <section className="cartao ficha-topo">
        <span className="avatar" data-t="g">
          {iniciais(p.nome)}
        </span>
        <div className="ficha-topo-texto">
          <div className="linha">
            <h1>{p.nome}</h1>
            <span className="selo" data-c={st.cor}>
              {st.rotulo}
            </span>
          </div>
          <p className="mudo">
            {[anos !== null ? `${anos} anos` : null, p.telefone, p.responsaveis[0] ? `resp. ${p.responsaveis[0].nome}` : null]
              .filter(Boolean)
              .join(' · ') || 'Sem contato cadastrado'}
          </p>
        </div>
        <div className="ficha-topo-acoes">
          {p.podeClinico && (
            <Link className="btn" data-v="sec" href={`/pacientes/${p.id}/ficha`}>
              Exportar ficha
            </Link>
          )}
          {p.situacao === 'ativo' && (
            <button className="btn" onClick={() => setJanela({ tipo: 'nova', paciente: { id: p.id, nome: p.nome } })}>
              <Icone nome="mais" tamanho={18} /> Agendar sessão
            </button>
          )}
        </div>
      </section>

      <nav className="abas" aria-label="Seções da ficha">
        {ABAS.map((a) =>
          a.pronta ? (
            <button key={a.id} type="button" aria-current={aba === a.id ? 'page' : undefined} onClick={() => setAba(a.id as Aba)}>
              {a.rotulo}
            </button>
          ) : (
            <span key={a.id} aria-disabled="true" title={`Chega na fase ${a.fase}`}>
              {a.rotulo}
            </span>
          ),
        )}
      </nav>

      {aba === 'resumo' && (
        <Resumo p={p} gravar={gravar} abrirSessao={abrirSessao} sessoes={sessoes ?? []} abrirAnamnese={() => setAba('anamnese')} />
      )}

      {aba === 'anamnese' && <AnamnesePaciente paciente={p.id} />}

      {aba === 'sessoes' && (
        <section className="cartao">
          <div className="cartao-topo">
            <h2>Sessões</h2>
            <span className="mudo pequeno">
              {p.contagem.realizadas} realizadas · {p.contagem.faltas} faltas · {p.contagem.canceladas} desmarcadas
            </span>
          </div>
          {!sessoes || sessoes.length === 0 ? (
            <div className="vazio">Nenhuma sessão ainda.</div>
          ) : (
            <ul className="lista-sessoes">
              {sessoes.map((s) => (
                <li key={s.id}>
                  <LinhaSessao sessao={s} comNome={false} aoAbrir={() => abrirSessao(s)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {aba === 'historico' && (
        <HistoricoPaciente paciente={p.id} podeClinico={p.podeClinico} recarga={recarga} aoAbrir={abrirSessao} />
      )}

      {aba === 'pacotes' && <PacotesPaciente paciente={p.id} plano={p.plano} />}

      {aba === 'financeiro' && <FinanceiroPaciente paciente={p.id} recarga={recarga} />}

      {aba === 'recibos' && <Recibos paciente={p.id} />}

      {aba === 'dados' && <Dados p={p} gravar={gravar} recarregar={carregar} />}

      {janela && (
        <SessaoJanela
          modo={janela}
          aoFechar={() => setJanela(null)}
          aoMudar={() => {
            void carregar();
            setRecarga((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

function Resumo({
  p,
  gravar,
  abrirSessao,
  sessoes,
  abrirAnamnese,
}: {
  p: Paciente;
  gravar: (c: Dto<'PacienteParcialDto'>) => Promise<void>;
  abrirSessao: (s: Dto<'SessaoDoPacienteDto'>) => void;
  sessoes: Dto<'SessaoDoPacienteDto'>[];
  abrirAnamnese: () => void;
}) {
  const { conta } = useApp();
  const valorPadrao = conta.perfil?.valorSessaoPadrao;
  const proxima = p.proximaSessao;
  const proximaCompleta = proxima ? sessoes.find((s) => s.id === proxima.id) : undefined;
  return (
    <div className="grade" data-n="2">
      <section className="cartao">
        <h2>Próxima sessão</h2>
        {proxima ? (
          <button type="button" className="proxima" onClick={() => proximaCompleta && abrirSessao(proximaCompleta)}>
            <span className="metrica-valor">{partes(proxima.inicio).hora}</span>
            <span>
              <strong>{diaPorExtenso(partes(proxima.inicio).dia)}</strong>
              <small className="mudo">
                {MODALIDADE[proxima.modalidade]} · {STATUS_SESSAO[proxima.status].rotulo}
              </small>
            </span>
          </button>
        ) : (
          <div className="vazio">Sem sessão marcada.</div>
        )}
        {p.repeticao && (
          <span className="etiqueta" data-v="ac">
            <Icone nome="repetir" tamanho={14} /> Toda {DIAS_DA_SEMANA[p.repeticao.diaSemana]}, {p.repeticao.hora},{' '}
            {duracao(p.repeticao.duracaoMin)}
          </span>
        )}
      </section>

      <section className="cartao">
        <h2>Atendimentos</h2>
        <div className="grade" data-n="3">
          <div className="metrica">
            <span className="metrica-valor">{p.contagem.realizadas}</span>
            <span className="metrica-rotulo">Realizadas</span>
          </div>
          <div className="metrica">
            <span className="metrica-valor">{p.contagem.faltas}</span>
            <span className="metrica-rotulo">Faltas</span>
          </div>
          <div className="metrica">
            <span className="metrica-valor">{p.contagem.canceladas}</span>
            <span className="metrica-rotulo">Desmarcadas</span>
          </div>
        </div>
        <p className="mudo pequeno">Em atendimento desde {fd(p.criadoEm)}.</p>
        <div className="linha">
          <span className="etiqueta">{resumoPlano(p.plano, valorPadrao)}</span>
          <SaldoPacote paciente={p.id} />
        </div>
      </section>

      {p.podeClinico && (
        <section className="cartao" style={{ gridColumn: '1 / -1' }}>
          <div className="cartao-topo">
            <h2>Queixa principal</h2>
            <span className="etiqueta">Dado clínico · só você vê</span>
          </div>
          <CampoGravavel
            rotulo="Queixa principal"
            valor={p.queixaPrincipal ?? ''}
            linhas={4}
            placeholder="O motivo que trouxe o paciente ao atendimento."
            gravar={(v) => gravar({ queixaPrincipal: v || null })}
          />
        </section>
      )}

      {p.podeClinico && <SaudeResumo paciente={p.id} abrir={abrirAnamnese} />}
    </div>
  );
}

function Dados({
  p,
  gravar,
  recarregar,
}: {
  p: Paciente;
  gravar: (c: Dto<'PacienteParcialDto'>) => Promise<void>;
  recarregar: () => Promise<void>;
}) {
  const { conta } = useApp();
  const router = useRouter();
  const params = { conta: conta.id, paciente: p.id };
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<Dto<'SituacaoPaciente'> | 'excluir' | null>(null);
  // Sem sessão realizada nem falta, não há prontuário a guardar: o cadastro pode sair.
  // A regra é do banco; a tela só não oferece o que ele vai recusar.
  const podeExcluir = p.contagem.realizadas + p.contagem.faltas === 0;

  const excluir = async () => {
    try {
      await api('delete', '/contas/{conta}/pacientes/{paciente}', { params });
      router.replace('/pacientes');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir.');
      setConfirmar(null);
    }
  };

  const mudarSituacao = async (situacao: Dto<'SituacaoPaciente'>) => {
    try {
      await api('post', '/contas/{conta}/pacientes/{paciente}/situacao', { params, corpo: { situacao } });
      setConfirmar(null);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível mudar a situação.');
    }
  };

  const executar = async (f: () => Promise<unknown>) => {
    setErro(null);
    try {
      await f();
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gravar.');
    }
  };

  return (
    <div className="pilha">
      {erro && (
        <div className="aviso" data-t="erro" role="alert">
          {erro}
        </div>
      )}
      <section className="cartao">
        <h2>Cadastro</h2>
        <div className="grade" data-n="2">
          <CampoGravavel rotulo="Nome completo" valor={p.nome} gravar={(v) => gravar({ nome: v })} />
          <CampoGravavel rotulo="Telefone" tipo="tel" valor={p.telefone ?? ''} gravar={(v) => gravar({ telefone: v || null })} />
          <CampoGravavel
            rotulo="Data de nascimento"
            tipo="date"
            max={hoje()}
            valor={p.nascimento ?? ''}
            gravar={(v) => gravar({ nascimento: v || null })}
          />
          <CampoGravavel
            rotulo="CPF"
            inputMode="numeric"
            valor={cpfFormatado(p.cpf)}
            dica="Necessário para o recibo do Receita Saúde."
            gravar={(v) => gravar({ cpf: soDigitos(v) ?? null })}
          />
        </div>
        <p className="mudo pequeno">Consentimento LGPD registrado em {fd(p.consentimentoEm)}.</p>
      </section>

      <PlanoPaciente
        conta={conta.id}
        paciente={p.id}
        plano={p.plano}
        valorSessao={p.valorSessao}
        valorPadrao={conta.perfil?.valorSessaoPadrao}
        aoGravar={recarregar}
      />

      <section className="cartao">
        <div className="cartao-topo">
          <h2>Pais ou responsáveis</h2>
          <button
            className="btn"
            data-v="suave"
            onClick={() =>
              void executar(() =>
                api('post', '/contas/{conta}/pacientes/{paciente}/responsaveis', {
                  params,
                  corpo: { nome: 'Novo responsável', financeiro: p.responsaveis.length === 0 },
                }),
              )
            }
          >
            <Icone nome="mais" tamanho={18} /> Adicionar responsável
          </button>
        </div>
        {p.responsaveis.length === 0 ? (
          <p className="mudo">Nenhum responsável cadastrado.</p>
        ) : (
          p.responsaveis.map((r) => {
            const rp = { ...params, responsavel: r.id };
            const gravarR = (corpo: Dto<'ResponsavelParcialDto'>) =>
              api('patch', '/contas/{conta}/pacientes/{paciente}/responsaveis/{responsavel}', { params: rp, corpo }).then(recarregar);
            return (
              <div key={r.id} className="bloco-responsavel">
                <div className="grade" data-n="2">
                  <CampoGravavel rotulo="Nome" valor={r.nome} gravar={(v) => gravarR({ nome: v })} />
                  <CampoGravavel rotulo="Parentesco" valor={r.parentesco ?? ''} gravar={(v) => gravarR({ parentesco: v || null })} />
                  <CampoGravavel rotulo="Telefone" tipo="tel" valor={r.telefone ?? ''} gravar={(v) => gravarR({ telefone: v || null })} />
                  <CampoGravavel rotulo="CPF" inputMode="numeric" valor={cpfFormatado(r.cpf)} gravar={(v) => gravarR({ cpf: soDigitos(v) ?? null })} />
                </div>
                <div className="linha" data-entre>
                  <label className="alternar">
                    <input
                      type="checkbox"
                      checked={r.financeiro}
                      onChange={(e) => void executar(() => gravarR({ financeiro: e.target.checked }))}
                    />
                    Paga as sessões (sai no recibo)
                  </label>
                  <button
                    className="btn"
                    data-v="leve"
                    onClick={() =>
                      void executar(() =>
                        api('delete', '/contas/{conta}/pacientes/{paciente}/responsaveis/{responsavel}', { params: rp }),
                      )
                    }
                  >
                    <Icone nome="lixo" tamanho={18} /> Remover
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      <AcessosPaciente paciente={p.id} />

      <section className="cartao">
        <h2>Situação do paciente</h2>
        {confirmar === 'excluir' ? (
          <div className="pilha" data-g="p">
            <div className="aviso" data-t="erro">
              O cadastro de <strong>{p.nome}</strong>, os responsáveis e as sessões marcadas saem de vez. Não dá para
              desfazer.
            </div>
            <div className="linha">
              <button className="btn" data-v="perigo" onClick={() => void excluir()}>
                Excluir de vez
              </button>
              <button className="btn" data-v="sec" onClick={() => setConfirmar(null)}>
                Voltar
              </button>
            </div>
          </div>
        ) : confirmar ? (
          <div className="pilha" data-g="p">
            <div className="aviso" data-t="atencao">
              {confirmar === 'ativo'
                ? 'O paciente volta para a lista de ativos e pode receber sessões de novo.'
                : 'A repetição semanal é encerrada e as sessões futuras saem da agenda. O histórico continua guardado.'}
            </div>
            <div className="linha">
              <button className="btn" onClick={() => void mudarSituacao(confirmar)}>
                {confirmar === 'alta' ? 'Dar alta' : confirmar === 'arquivado' ? 'Arquivar paciente' : 'Reativar paciente'}
              </button>
              <button className="btn" data-v="sec" onClick={() => setConfirmar(null)}>
                Voltar
              </button>
            </div>
          </div>
        ) : (
          <div className="linha">
            {p.situacao !== 'ativo' && (
              <button className="btn" data-v="sec" onClick={() => setConfirmar('ativo')}>
                Reativar paciente
              </button>
            )}
            {p.situacao === 'ativo' && (
              <button className="btn" data-v="sec" onClick={() => setConfirmar('alta')}>
                Dar alta
              </button>
            )}
            {p.situacao !== 'arquivado' && (
              <button className="btn" data-v="leve" onClick={() => setConfirmar('arquivado')}>
                Arquivar
              </button>
            )}
            {podeExcluir && (
              <button className="btn" data-v="perigo" onClick={() => setConfirmar('excluir')}>
                <Icone nome="lixo" tamanho={18} /> Excluir paciente
              </button>
            )}
          </div>
        )}
        <p className="mudo pequeno">
          {podeExcluir
            ? 'Excluir serve para cadastro feito por engano, sem atendimento nem anamnese registrados. Depois da primeira sessão realizada ou falta, ou da anamnese preenchida, o prontuário tem guarda mínima de 5 anos (Resolução CFP 001/2009) e o caminho é arquivar.'
            : 'Paciente com atendimento registrado não se exclui: o prontuário tem guarda mínima de 5 anos (Resolução CFP 001/2009). Arquivar tira o paciente das listas sem perder nada.'}
        </p>
      </section>
    </div>
  );
}
