'use client';

import { useEffect, useState } from 'react';
import { api, type Dto } from '@/lib/api.ts';
import { fd } from '@/lib/formato.ts';
import { LinhaSessao } from './LinhaSessao';
import { useApp } from './EstadoApp';

// Aba Histórico: tudo o que já aconteceu com o paciente, da mais recente para
// a mais antiga, com o relato de cada sessão para o psicólogo do paciente.

type Item = Dto<'ItemHistoricoDto'>;
type Periodo = '3' | '12' | 'tudo';

const PERIODOS: { id: Periodo; rotulo: string }[] = [
  { id: '3', rotulo: '3 meses' },
  { id: '12', rotulo: '12 meses' },
  { id: 'tudo', rotulo: 'Tudo' },
];

interface Props {
  paciente: string;
  podeClinico: boolean;
  /** Muda quando algo foi gravado fora daqui (janela da sessão), para reler. */
  recarga: number;
  aoAbrir: (s: Item) => void;
}

export function HistoricoPaciente({ paciente, podeClinico, recarga, aoAbrir }: Props) {
  const { conta } = useApp();
  const [itens, setItens] = useState<Item[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>('12');

  useEffect(() => {
    api('get', '/contas/{conta}/pacientes/{paciente}/historico', { params: { conta: conta.id, paciente } })
      .then((l) => {
        setItens(l);
        setErro(null);
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Erro ao carregar o histórico.'));
  }, [conta.id, paciente, recarga]);

  const desde = periodo === 'tudo' ? 0 : Date.now() - Number(periodo) * 30.44 * 864e5;
  const visiveis = (itens ?? []).filter((i) => new Date(i.inicio).getTime() >= desde);
  const semObservacao = (itens ?? []).filter((i) => i.status === 'realizada' && !i.observacao && i.adendos === 0).length;

  return (
    <section className="cartao">
      <div className="cartao-topo">
        <h2>Histórico</h2>
        <div className="segmento" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p.id} type="button" aria-pressed={periodo === p.id} onClick={() => setPeriodo(p.id)}>
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>
      {podeClinico && semObservacao > 0 && (
        <div className="aviso" data-t="atencao">
          {semObservacao === 1 ? '1 sessão realizada está' : `${semObservacao} sessões realizadas estão`} sem relato.
        </div>
      )}
      {erro && (
        <div className="aviso" data-t="erro" role="alert">
          {erro}
        </div>
      )}
      {itens === null && !erro ? (
        <p className="mudo">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <div className="vazio">Nada neste período.</div>
      ) : (
        <ol className="linha-do-tempo">
          {visiveis.map((i) => (
            <li key={i.id}>
              <LinhaSessao sessao={i} comNome={false} aoAbrir={() => aoAbrir(i)} />
              {podeClinico && (i.status === 'realizada' || i.status === 'falta') && (
                <div className="linha-do-tempo-obs">
                  {i.observacao ? (
                    <p className="observacao-texto" data-curta>
                      {i.observacao}
                    </p>
                  ) : i.status === 'realizada' && i.adendos === 0 ? (
                    <button type="button" className="lk pequeno" onClick={() => aoAbrir(i)}>
                      {new Date(i.editavelAte).getTime() > Date.now()
                        ? `Escrever o relato (até ${fd(i.editavelAte)})`
                        : 'Sem relato · adicionar adendo'}
                    </button>
                  ) : null}
                  {i.adendos > 0 && (
                    <small className="mudo">{i.adendos === 1 ? '1 adendo' : `${i.adendos} adendos`}</small>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
