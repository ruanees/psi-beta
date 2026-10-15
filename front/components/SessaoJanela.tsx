'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { api, type Dto } from '@/lib/api.ts';
import { DESLOCAMENTO, diaPorExtenso, hoje, instante, partes } from '@/lib/datas.ts';
import { duracao } from '@/lib/formato.ts';
import { MODALIDADE, STATUS_SESSAO } from '@/lib/status.ts';
import { useApp } from './EstadoApp';
import { Icone } from './Icone';
import { FinanceiroDaSessao } from './FinanceiroDaSessao';
import { Janela } from './Janela';
import { ObservacaoEditor } from './ObservacaoEditor';

// Uma janela só para a sessão: agendar, ver, remarcar e desmarcar. Um
// formulário para criar e corrigir — dois se desencontram no dia em que um
// campo muda de lugar (lição do DIME).

export type SessaoVista = Pick<
  Dto<'SessaoAgendaDto'>,
  'id' | 'pacienteId' | 'pacienteNome' | 'inicio' | 'fim' | 'modalidade' | 'status' | 'recorrenciaId'
>;

export type ModoSessao =
  | { tipo: 'nova'; dia?: string; hora?: string; paciente?: { id: string; nome: string } }
  | { tipo: 'ver'; sessao: SessaoVista };

const DURACOES = [30, 40, 45, 50, 60, 90];

interface Props {
  modo: ModoSessao;
  aoFechar: () => void;
  /** Chamado depois de qualquer gravação, para quem abriu reler os dados. */
  aoMudar: () => void;
}

export function SessaoJanela({ modo, aoFechar, aoMudar }: Props) {
  if (modo.tipo === 'nova') return <NovaSessao modo={modo} aoFechar={aoFechar} aoMudar={aoMudar} />;
  return <VerSessao sessao={modo.sessao} aoFechar={aoFechar} aoMudar={aoMudar} />;
}

// ------------------------------------------------------------ campos comuns

interface Valores {
  dia: string;
  hora: string;
  duracaoMin: number;
  modalidade: Dto<'Modalidade'>;
}

function CamposDaSessao({ v, mudar }: { v: Valores; mudar: (p: Partial<Valores>) => void }) {
  return (
    <>
      <div className="grade" data-n="2">
        <label className="campo">
          <span>Dia</span>
          <input className="ent" type="date" value={v.dia} required onChange={(e) => mudar({ dia: e.target.value })} />
        </label>
        <label className="campo">
          <span>Horário</span>
          <input className="ent" type="time" step={300} value={v.hora} required onChange={(e) => mudar({ hora: e.target.value })} />
        </label>
      </div>
      <div className="grade" data-n="2">
        <label className="campo">
          <span>Duração</span>
          <select className="ent" value={v.duracaoMin} onChange={(e) => mudar({ duracaoMin: Number(e.target.value) })}>
            {[...new Set([...DURACOES, v.duracaoMin])].sort((a, b) => a - b).map((d) => (
              <option key={d} value={d}>
                {duracao(d)}
              </option>
            ))}
          </select>
        </label>
        <div className="campo">
          <span>Modalidade</span>
          <div className="segmento" role="group" aria-label="Modalidade">
            {(Object.keys(MODALIDADE) as Dto<'Modalidade'>[]).map((m) => (
              <button key={m} type="button" aria-pressed={v.modalidade === m} onClick={() => mudar({ modalidade: m })}>
                {MODALIDADE[m]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------ nova

function NovaSessao({
  modo,
  aoFechar,
  aoMudar,
}: {
  modo: Extract<ModoSessao, { tipo: 'nova' }>;
  aoFechar: () => void;
  aoMudar: () => void;
}) {
  const { conta } = useApp();
  const [pacientes, setPacientes] = useState<Dto<'PacienteResumoDto'>[] | null>(modo.paciente ? [] : null);
  const [pacienteId, setPacienteId] = useState(modo.paciente?.id ?? '');
  const [v, setV] = useState<Valores>({
    dia: modo.dia ?? hoje(),
    hora: modo.hora ?? '09:00',
    duracaoMin: 50,
    modalidade: 'presencial',
  });
  const [repetir, setRepetir] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (modo.paciente) return;
    api('post', '/contas/{conta}/pacientes/buscar', { params: { conta: conta.id }, corpo: { situacao: 'ativo' } })
      .then(setPacientes)
      .catch((e: Error) => setErro(e.message));
  }, [conta.id, modo.paciente]);

  const agendar = async (e: FormEvent) => {
    e.preventDefault();
    if (!pacienteId) return setErro('Escolha o paciente.');
    setErro(null);
    setOcupado(true);
    try {
      await api('post', '/contas/{conta}/sessoes', {
        params: { conta: conta.id },
        corpo: { pacienteId, inicio: instante(v.dia, v.hora), duracaoMin: v.duracaoMin, modalidade: v.modalidade, repetirSemanal: repetir },
      });
      aoMudar();
      aoFechar();
    } catch (er) {
      setErro(er instanceof Error ? er.message : 'Não foi possível agendar.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Janela
      titulo="Nova sessão"
      subtitulo={modo.paciente?.nome}
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn" data-v="sec" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn" form="nova-sessao" disabled={ocupado}>
            {ocupado ? 'Agendando…' : 'Agendar sessão'}
          </button>
        </>
      }
    >
      <form id="nova-sessao" className="pilha" data-g="p" onSubmit={agendar}>
        {erro && (
          <div className="aviso" data-t="erro" role="alert">
            {erro}
          </div>
        )}
        {!modo.paciente && (
          <label className="campo">
            <span>Paciente</span>
            {pacientes === null ? (
              <span className="mudo">Carregando pacientes…</span>
            ) : pacientes.length === 0 ? (
              <span className="mudo">
                Nenhum paciente ativo. <Link className="lk" href="/pacientes/novo">Cadastrar paciente</Link>
              </span>
            ) : (
              <select className="ent" value={pacienteId} required onChange={(e) => setPacienteId(e.target.value)}>
                <option value="">Escolha o paciente</option>
                {pacientes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            )}
          </label>
        )}
        <CamposDaSessao v={v} mudar={(p) => setV({ ...v, ...p })} />
        <label className="alternar">
          <input type="checkbox" checked={repetir} onChange={(e) => setRepetir(e.target.checked)} />
          Repetir toda {nomeDoDiaSemana(v.dia)}, no mesmo horário
        </label>
      </form>
    </Janela>
  );
}

function nomeDoDiaSemana(dia: string): string {
  const n = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][n] ?? 'semana';
}

// ------------------------------------------------------------ ver, remarcar, desmarcar

type Etapa = 'ver' | 'remarcar' | 'desmarcar' | 'encerrar';

// Situações que se escolhem direto na janela. Falta tem botão próprio
// ("Marcar falta" / "Corrigir para falta"); desmarcar passa pela conta do aviso.
const SITUACOES_JANELA = ['agendada', 'confirmada', 'realizada', 'cancelada'] as const;

function VerSessao({ sessao, aoFechar, aoMudar }: { sessao: SessaoVista; aoFechar: () => void; aoMudar: () => void }) {
  const { conta } = useApp();
  const [etapa, setEtapa] = useState<Etapa>('ver');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Presença e falta não fecham a janela: o próximo passo é escrever a observação.
  const [status, setStatus] = useState(sessao.status);
  const ini = partes(sessao.inicio);
  const fim = partes(sessao.fim);
  const durMin = Math.round((new Date(sessao.fim).getTime() - new Date(sessao.inicio).getTime()) / 60000);
  const jaComecou = new Date(sessao.inicio).getTime() <= Date.now();
  const aberta = status === 'agendada' || status === 'confirmada';
  const st = STATUS_SESSAO[status];

  const executar = async (f: () => Promise<unknown>) => {
    setErro(null);
    setOcupado(true);
    try {
      await f();
      aoMudar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setOcupado(false);
    }
  };
  const mudarStatus = async (novo: Dto<'StatusSessaoDto'>['status']) => {
    const gravar = () =>
      api('post', '/contas/{conta}/sessoes/{sessao}/status', { params: { conta: conta.id, sessao: sessao.id }, corpo: { status: novo } });
    // A janela fica aberta: dá para ver a nova situação e seguir (observação, cobrança).
    setErro(null);
    setOcupado(true);
    try {
      await gravar();
      setStatus(novo);
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setOcupado(false);
    }
  };

  const subtitulo = `${diaPorExtenso(ini.dia)}, ${ini.hora} – ${fim.hora}`;

  if (etapa === 'remarcar') {
    return (
      <Remarcar
        sessao={sessao}
        durMin={durMin}
        voltar={() => setEtapa('ver')}
        aoFechar={aoFechar}
        aoMudar={aoMudar}
      />
    );
  }
  if (etapa === 'desmarcar') {
    return <Desmarcar sessao={sessao} subtitulo={subtitulo} voltar={() => setEtapa('ver')} aoFechar={aoFechar} aoMudar={aoMudar} />;
  }

  return (
    <Janela
      titulo={sessao.pacienteNome}
      subtitulo={subtitulo}
      icone={sessao.modalidade === 'online' ? 'video' : 'agenda'}
      aoFechar={aoFechar}
      rodape={
        etapa === 'encerrar' ? (
          <>
            <button className="btn" data-v="sec" onClick={() => setEtapa('ver')}>
              Voltar
            </button>
            <button
              className="btn"
              data-v="perigo"
              disabled={ocupado}
              onClick={() =>
                executar(() =>
                  api('post', '/contas/{conta}/sessoes/{sessao}/encerrar-repeticao', {
                    params: { conta: conta.id, sessao: sessao.id },
                  }),
                )
              }
            >
              Encerrar repetição
            </button>
          </>
        ) : (
          <>
            <Link className="btn" data-v="leve" href={`/pacientes/${sessao.pacienteId}`}>
              Abrir ficha
            </Link>
            {aberta && (
              <button className="btn" data-v="sec" onClick={() => setEtapa('remarcar')}>
                Remarcar
              </button>
            )}
            {aberta && !jaComecou && status === 'agendada' && (
              <button className="btn" disabled={ocupado} onClick={() => mudarStatus('confirmada')}>
                Confirmar
              </button>
            )}
            {aberta && jaComecou && (
              <button className="btn" disabled={ocupado} onClick={() => mudarStatus('realizada')}>
                Realizada
              </button>
            )}
          </>
        )
      }
    >
      <div className="pilha" data-g="p">
        {erro && (
          <div className="aviso" data-t="erro" role="alert">
            {erro}
          </div>
        )}
        <div className="linha">
          <span className="selo" data-c={st.cor}>
            {st.rotulo}
          </span>
          <span className="etiqueta">{MODALIDADE[sessao.modalidade]}</span>
          <span className="etiqueta">{duracao(durMin)}</span>
          {sessao.recorrenciaId && (
            <span className="etiqueta" data-v="ac">
              <Icone nome="repetir" tamanho={14} /> Toda {nomeDoDiaSemana(ini.dia)}
            </span>
          )}
        </div>

        {etapa !== 'encerrar' && (
          <div className="campo">
            <span>Situação</span>
            <div className="segmento" role="group" aria-label="Situação da sessão">
              {SITUACOES_JANELA.map((op) => {
                const bloqueio =
                  op === 'realizada' && !jaComecou
                    ? 'Só depois do horário da sessão.'
                    : op === 'cancelada' && (status === 'realizada' || status === 'falta')
                      ? 'Sessão realizada ou com falta não vira desmarcada. Volte para agendada antes.'
                      : null;
                return (
                  <button
                    key={op}
                    type="button"
                    aria-pressed={status === op}
                    disabled={ocupado || !!bloqueio}
                    title={bloqueio ?? undefined}
                    onClick={() => {
                      if (status === op) return;
                      if (op === 'cancelada') setEtapa('desmarcar');
                      else void mudarStatus(op);
                    }}
                  >
                    {STATUS_SESSAO[op].rotulo}
                  </button>
                );
              })}
            </div>
            {(status === 'realizada' || status === 'falta') && (
              <small>Voltar para agendada desfaz a cobrança ainda não paga e devolve a sessão ao pacote.</small>
            )}
          </div>
        )}

        {etapa === 'encerrar' ? (
          <div className="aviso" data-t="atencao">
            Esta sessão e as próximas da repetição saem da agenda. As que já aconteceram continuam no histórico.
          </div>
        ) : (
          <div className="pilha" data-g="p">
            {aberta && jaComecou && (
              <p className="mudo">O horário já passou. Marque se o paciente veio.</p>
            )}
            <div className="linha">
              {aberta && jaComecou && (
                <button className="btn" data-v="sec" disabled={ocupado} onClick={() => mudarStatus('falta')}>
                  Marcar falta
                </button>
              )}
              {status === 'confirmada' && !jaComecou && (
                <button className="btn" data-v="sec" disabled={ocupado} onClick={() => mudarStatus('agendada')}>
                  Tirar confirmação
                </button>
              )}
              {(status === 'realizada' || status === 'falta') && (
                <button className="btn" data-v="sec" disabled={ocupado} onClick={() => mudarStatus(status === 'realizada' ? 'falta' : 'realizada')}>
                  {status === 'realizada' ? 'Corrigir para falta' : 'Corrigir para realizada'}
                </button>
              )}
              {aberta && (
                <button className="btn" data-v="perigo" onClick={() => setEtapa('desmarcar')}>
                  Desmarcar
                </button>
              )}
              {sessao.recorrenciaId && aberta && (
                <button className="btn" data-v="leve" onClick={() => setEtapa('encerrar')}>
                  Encerrar repetição
                </button>
              )}
            </div>
            {(status === 'realizada' || status === 'falta') && (
              <FinanceiroDaSessao key={status} sessao={sessao.id} paciente={sessao.pacienteNome} />
            )}
            {(status === 'realizada' || status === 'falta') && <ObservacaoEditor sessao={sessao.id} aoGravar={aoMudar} />}
          </div>
        )}
      </div>
    </Janela>
  );
}

function Remarcar({
  sessao,
  durMin,
  voltar,
  aoFechar,
  aoMudar,
}: {
  sessao: SessaoVista;
  durMin: number;
  voltar: () => void;
  aoFechar: () => void;
  aoMudar: () => void;
}) {
  const { conta } = useApp();
  const ini = partes(sessao.inicio);
  const [v, setV] = useState<Valores>({ dia: ini.dia, hora: ini.hora, duracaoMin: durMin, modalidade: sessao.modalidade });
  const [escopo, setEscopo] = useState<'esta' | 'proximas'>('esta');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      await api('patch', '/contas/{conta}/sessoes/{sessao}', {
        params: { conta: conta.id, sessao: sessao.id },
        corpo: { inicio: instante(v.dia, v.hora), duracaoMin: v.duracaoMin, modalidade: v.modalidade, escopo },
      });
      aoMudar();
      aoFechar();
    } catch (er) {
      setErro(er instanceof Error ? er.message : 'Não foi possível remarcar.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Janela
      titulo="Remarcar sessão"
      subtitulo={sessao.pacienteNome}
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn" data-v="sec" onClick={voltar}>
            Voltar
          </button>
          <button className="btn" form="remarcar" disabled={ocupado}>
            Salvar novo horário
          </button>
        </>
      }
    >
      <form id="remarcar" className="pilha" data-g="p" onSubmit={salvar}>
        {erro && (
          <div className="aviso" data-t="erro" role="alert">
            {erro}
          </div>
        )}
        <CamposDaSessao v={v} mudar={(p) => setV({ ...v, ...p })} />
        {sessao.recorrenciaId && (
          <div className="campo">
            <span>Vale para</span>
            <div className="segmento" role="group" aria-label="Vale para">
              <button type="button" aria-pressed={escopo === 'esta'} onClick={() => setEscopo('esta')}>
                Só esta sessão
              </button>
              <button type="button" aria-pressed={escopo === 'proximas'} onClick={() => setEscopo('proximas')}>
                Esta e as próximas
              </button>
            </div>
          </div>
        )}
      </form>
    </Janela>
  );
}

/** Agora, como valor de <input type="datetime-local"> no fuso do consultório. */
function agoraLocal(): string {
  const p = partes(new Date());
  return `${p.dia}T${p.hora}`;
}

function Desmarcar({
  sessao,
  subtitulo,
  voltar,
  aoFechar,
  aoMudar,
}: {
  sessao: SessaoVista;
  subtitulo: string;
  voltar: () => void;
  aoFechar: () => void;
  aoMudar: () => void;
}) {
  const { conta } = useApp();
  const [aviso, setAviso] = useState(agoraLocal());
  const [previa, setPrevia] = useState<Dto<'DesmarcarRespostaDto'> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const avisoEm = `${aviso}:00${DESLOCAMENTO}`;

  // O servidor decide se é falta; a tela só mostra a resposta antes de confirmar.
  useEffect(() => {
    let vivo = true;
    api('post', '/contas/{conta}/sessoes/{sessao}/desmarcar', {
      params: { conta: conta.id, sessao: sessao.id },
      corpo: { avisoEm, simular: true },
    })
      .then((r) => vivo && setPrevia(r))
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [conta.id, sessao.id, avisoEm]);

  const desmarcar = async () => {
    setErro(null);
    setOcupado(true);
    try {
      await api('post', '/contas/{conta}/sessoes/{sessao}/desmarcar', {
        params: { conta: conta.id, sessao: sessao.id },
        corpo: { avisoEm },
      });
      aoMudar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível desmarcar.');
    } finally {
      setOcupado(false);
    }
  };

  const horas = previa ? Math.max(0, previa.horasAviso) : 0;
  const antecedencia = horas >= 48 ? `${Math.floor(horas / 24)} dias` : `${String(horas).replace('.', ',')} h`;

  return (
    <Janela
      titulo={`Desmarcar ${sessao.pacienteNome}`}
      subtitulo={subtitulo}
      icone="alerta"
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn" data-v="sec" onClick={voltar}>
            Voltar
          </button>
          <button className="btn" data-v="perigo" disabled={ocupado || !previa} onClick={() => void desmarcar()}>
            {previa?.resultado === 'falta' ? 'Desmarcar como falta' : 'Desmarcar sessão'}
          </button>
        </>
      }
    >
      <div className="pilha" data-g="p">
        {erro && (
          <div className="aviso" data-t="erro" role="alert">
            {erro}
          </div>
        )}
        <label className="campo">
          <span>Quando o paciente avisou</span>
          <input className="ent" type="datetime-local" value={aviso} max={agoraLocal()} onChange={(e) => setAviso(e.target.value)} />
        </label>
        {previa &&
          (previa.resultado === 'falta' ? (
            <div className="aviso" data-t="atencao">
              O aviso veio com {antecedencia} de antecedência, e o prazo do consultório é de {previa.prazoHoras} h. A
              sessão conta como <strong>falta</strong>: gasta a sessão do pacote e é cobrada.
            </div>
          ) : (
            <div className="aviso" data-t="ok">
              O aviso veio com {antecedencia} de antecedência, dentro do prazo de {previa.prazoHoras} h. A sessão fica
              desmarcada, sem cobrança, e o horário fica livre.
            </div>
          ))}
      </div>
    </Janela>
  );
}
