'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type Dto } from '@/lib/api.ts';
import { diaPorExtenso, partes } from '@/lib/datas.ts';
import { fd } from '@/lib/formato.ts';
import { MODALIDADE, STATUS_SESSAO } from '@/lib/status.ts';
import { useApp } from './EstadoApp';
import { ObservacaoEditor } from './ObservacaoEditor';

// Aba Relatos: o lugar de escrever o relato de cada sessão, sem passar pela
// agenda. O que ainda está sem relato vem primeiro e já aberto; sessão cujo
// horário passou e que ainda não tem presença marcada ganha os botões para
// marcar, porque o relato só existe em sessão realizada ou com falta.
// Só o psicólogo do paciente vê esta aba (a ficha esconde dos outros).

type Item = Dto<'ItemHistoricoDto'>;

interface Props {
  paciente: string;
  /** Muda quando algo foi gravado fora daqui (janela da sessão), para reler. */
  recarga: number;
  /** Presença ou falta marcada aqui: a ficha relê as contagens. */
  aoMudar: () => void;
}

const semRelato = (i: Item) => i.status === 'realizada' && !i.observacao && i.adendos === 0;

export function RelatosPaciente({ paciente, recarga, aoMudar }: Props) {
  const { conta } = useApp();
  const [itens, setItens] = useState<Item[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const l = await api('get', '/contas/{conta}/pacientes/{paciente}/historico', { params: { conta: conta.id, paciente } });
      setItens(l);
      setErro(null);
      return l;
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar os relatos.');
      return null;
    }
  }, [conta.id, paciente]);

  useEffect(() => {
    void carregar().then((l) => {
      // Abre sozinho o relato que falta escrever; sem pendência, o da última sessão, se ainda dá para corrigir.
      if (!l) return;
      setAberto((atual) => {
        if (atual) return atual;
        const ultima = l.find((i) => i.status === 'realizada' || i.status === 'falta');
        const pendente = l.find(semRelato);
        if (pendente) return pendente.id;
        return ultima && new Date(ultima.editavelAte).getTime() > Date.now() ? ultima.id : null;
      });
    });
  }, [carregar, recarga]);

  const marcar = async (sessao: string, status: 'realizada' | 'falta') => {
    setErro(null);
    setMarcando(sessao);
    try {
      await api('post', '/contas/{conta}/sessoes/{sessao}/status', { params: { conta: conta.id, sessao }, corpo: { status } });
      setAberto(sessao);
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível marcar a sessão.');
    } finally {
      setMarcando(null);
    }
  };

  const lista = itens ?? [];
  const semPresenca = lista.filter((i) => i.status === 'agendada' || i.status === 'confirmada');
  const registraveis = lista.filter((i) => i.status === 'realizada' || i.status === 'falta');
  const pendentes = registraveis.filter(semRelato).length;
  const escritos = registraveis.filter((i) => i.observacao || i.adendos > 0).length;

  return (
    <section className="cartao">
      <div className="cartao-topo">
        <h2>Relatos de sessão</h2>
        <span className="etiqueta">Dado clínico · só você vê</span>
      </div>
      {itens !== null && (
        <p className="mudo pequeno">
          {escritos === 1 ? '1 relato escrito' : `${escritos} relatos escritos`}
          {pendentes > 0 && ` · ${pendentes === 1 ? '1 sessão realizada sem relato' : `${pendentes} sessões realizadas sem relato`}`}
          . O relato pode ser corrigido por um mês depois da sessão; depois disso, o que faltou entra como adendo.
        </p>
      )}

      {erro && (
        <div className="aviso" data-t="erro" role="alert">
          {erro}
        </div>
      )}

      {semPresenca.length > 0 && (
        <div className="pilha" data-g="p">
          <strong>Falta marcar se o paciente veio</strong>
          <ul className="relatos">
            {semPresenca.map((i) => {
              const ini = partes(i.inicio);
              return (
                <li key={i.id} className="relato" data-pendente>
                  <div className="relato-topo">
                    <span className="relato-topo-texto">
                      <strong>{diaPorExtenso(ini.dia)}</strong>
                      <small className="mudo">
                        {ini.hora} · {MODALIDADE[i.modalidade]}
                      </small>
                    </span>
                    <button className="btn" disabled={marcando === i.id} onClick={() => void marcar(i.id, 'realizada')}>
                      Realizada
                    </button>
                    <button className="btn" data-v="sec" disabled={marcando === i.id} onClick={() => void marcar(i.id, 'falta')}>
                      Falta
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {itens === null && !erro ? (
        <p className="mudo">Carregando…</p>
      ) : registraveis.length === 0 ? (
        <div className="vazio">
          {semPresenca.length > 0
            ? 'Marque a presença acima para escrever o primeiro relato.'
            : 'Nenhuma sessão realizada ainda. Depois da primeira, o relato é escrito aqui.'}
        </div>
      ) : (
        <ul className="relatos">
          {registraveis.map((i) => {
            const ini = partes(i.inicio);
            const st = STATUS_SESSAO[i.status];
            const estaAberto = aberto === i.id;
            const editavel = new Date(i.editavelAte).getTime() > Date.now();
            const pendente = semRelato(i);
            return (
              <li key={i.id} className="relato" data-pendente={pendente || undefined}>
                <button
                  type="button"
                  className="relato-topo"
                  aria-expanded={estaAberto}
                  onClick={() => setAberto(estaAberto ? null : i.id)}
                >
                  <span className="relato-topo-texto">
                    <strong>{diaPorExtenso(ini.dia)}</strong>
                    <small className="mudo">
                      {ini.hora} · {MODALIDADE[i.modalidade]}
                      {pendente && (editavel ? ` · escrever até ${fd(i.editavelAte)}` : ' · travado: entra como adendo')}
                    </small>
                  </span>
                  <span className="selo" data-c={st.cor}>
                    {st.rotulo}
                  </span>
                  <span className="lk pequeno">{estaAberto ? 'Fechar' : pendente ? 'Escrever relato' : 'Abrir'}</span>
                </button>
                {estaAberto ? (
                  <div className="relato-corpo">
                    <ObservacaoEditor sessao={i.id} semTitulo aoGravar={() => void carregar()} />
                  </div>
                ) : (
                  (i.observacao || i.adendos > 0) && (
                    <div className="relato-corpo">
                      {i.observacao && (
                        <p className="observacao-texto" data-curta>
                          {i.observacao}
                        </p>
                      )}
                      {i.adendos > 0 && (
                        <small className="mudo">{i.adendos === 1 ? '1 adendo' : `${i.adendos} adendos`}</small>
                      )}
                    </div>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
