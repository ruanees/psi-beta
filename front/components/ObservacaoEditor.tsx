'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Dto } from '@/lib/api.ts';
import { fd, fdh } from '@/lib/formato.ts';
import { useApp } from './EstadoApp';

// Relato da sessão (no banco, `observacoes`). Grava no botão Salvar e também
// ao sair do campo; cada correção guarda a versão anterior (o banco faz isso,
// não a tela). Um mês depois da sessão ele trava, e o que faltou dizer entra
// como adendo, que não muda mais.

type Observacao = Dto<'ObservacaoDto'>;

interface Props {
  sessao: string;
  /** Avisa quem abriu (lista de pendências, histórico) que algo foi gravado. */
  aoGravar?: () => void;
  /** Sem o título: quem abriu já mostra de que sessão é o relato. */
  semTitulo?: boolean;
}

export function ObservacaoEditor({ sessao, aoGravar, semTitulo = false }: Props) {
  const { conta } = useApp();
  const params = { conta: conta.id, sessao };
  const [o, setO] = useState<Observacao | null>(null);
  const [texto, setTexto] = useState('');
  const [adendo, setAdendo] = useState('');
  const [verVersoes, setVerVersoes] = useState(false);
  const [estado, setEstado] = useState<'parado' | 'gravando' | 'gravado'>('parado');
  const [erro, setErro] = useState<string | null>(null);
  // Clicar em Salvar tira o foco do campo: sem a trava, o mesmo texto gravaria duas vezes.
  const gravandoAgora = useRef(false);

  const carregar = useCallback(async () => {
    try {
      const lida = await api('get', '/contas/{conta}/sessoes/{sessao}/observacao', { params: { conta: conta.id, sessao } });
      setO(lida);
      setTexto(lida.texto ?? '');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler o relato.');
    }
  }, [conta.id, sessao]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro && !o) {
    return (
      <div className="aviso" data-t="erro" role="alert">
        {erro}
      </div>
    );
  }
  if (!o) return <p className="mudo pequeno">Carregando relato…</p>;
  if (!o.podeClinico) return <p className="mudo pequeno">O relato desta sessão só aparece para o psicólogo do paciente.</p>;
  if (!o.registravel) return <p className="mudo pequeno">Marque presença ou falta para escrever o relato.</p>;

  // Texto igual ao gravado, ou campo vazio sem nada gravado antes: nada a salvar.
  const alterada = texto.trim() !== (o.texto ?? '').trim() && (texto.trim() !== '' || Boolean(o.texto));

  async function gravar() {
    if (!alterada || gravandoAgora.current) return;
    gravandoAgora.current = true;
    setEstado('gravando');
    setErro(null);
    try {
      await api('put', '/contas/{conta}/sessoes/{sessao}/observacao', { params, corpo: { texto } });
      await carregar();
      setEstado('gravado');
      aoGravar?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gravar.');
      setEstado('parado');
    } finally {
      gravandoAgora.current = false;
    }
  }

  async function adicionarAdendo() {
    if (!adendo.trim()) return;
    setEstado('gravando');
    setErro(null);
    try {
      await api('post', '/contas/{conta}/sessoes/{sessao}/adendos', { params, corpo: { texto: adendo } });
      setAdendo('');
      await carregar();
      setEstado('gravado');
      aoGravar?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gravar o adendo.');
      setEstado('parado');
    }
  }

  const situacao =
    estado === 'gravando'
      ? 'Salvando…'
      : alterada
        ? 'Alterações ainda não salvas'
        : o.versao
          ? `Versão ${o.versao}, gravada em ${fdh(o.alteradaEm!)}`
          : 'Ainda sem relato';

  return (
    <div className="observacao pilha" data-g="p">
      {!semTitulo && (
        <div className="cartao-topo">
          <strong>Relato da sessão</strong>
          <span className="etiqueta">Dado clínico · só você vê</span>
        </div>
      )}

      {o.editavel ? (
        <>
          <label className="campo">
            <span className="oculto">Relato da sessão</span>
            <textarea
              className="ent"
              rows={6}
              maxLength={20000}
              value={texto}
              placeholder="Como foi a sessão: temas trabalhados, combinados, o que observar na próxima."
              onChange={(e) => {
                setTexto(e.target.value);
                setEstado('parado');
              }}
              onBlur={() => void gravar()}
            />
            <small>
              {situacao} · pode ser corrigido até {fd(o.editavelAte)}
            </small>
          </label>
          <div className="linha">
            <button type="button" className="btn" disabled={!alterada || estado === 'gravando'} onClick={() => void gravar()}>
              {estado === 'gravando' ? 'Salvando…' : 'Salvar'}
            </button>
            {estado === 'gravado' && !alterada && (
              <span className="pequeno mudo" role="status">
                Relato salvo.
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          {o.texto ? <p className="observacao-texto">{o.texto}</p> : <p className="mudo">Sem relato registrado.</p>}
          <small className="mudo">
            {o.versao ? `${situacao} · ` : ''}Travado desde {fd(o.editavelAte)}: um mês depois da sessão o relato não muda
            mais.
          </small>
        </>
      )}

      {erro && (
        <div className="aviso" data-t="erro" role="alert">
          {erro}
        </div>
      )}

      {o.versoes.length > 0 && (
        <div>
          <button type="button" className="lk pequeno" onClick={() => setVerVersoes(!verVersoes)}>
            {verVersoes ? 'Esconder versões anteriores' : `Ver versões anteriores (${o.versoes.length})`}
          </button>
          {verVersoes && (
            <ol className="versoes">
              {o.versoes.map((v) => (
                <li key={v.versao}>
                  <small className="mudo">
                    Versão {v.versao} · {fdh(v.gravadaEm)}
                  </small>
                  <p className="observacao-texto">{v.texto}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {o.adendos.length > 0 && (
        <ol className="versoes">
          {o.adendos.map((a) => (
            <li key={a.id}>
              <small className="mudo">Adendo · {fdh(a.criadoEm)}</small>
              <p className="observacao-texto">{a.texto}</p>
            </li>
          ))}
        </ol>
      )}

      {!o.editavel && (
        <div className="pilha" data-g="p">
          <label className="campo">
            <span>Novo adendo</span>
            <textarea
              className="ent"
              rows={3}
              maxLength={20000}
              value={adendo}
              onChange={(e) => setAdendo(e.target.value)}
              placeholder="O que faltou registrar. Depois de gravado, o adendo não muda."
            />
          </label>
          <div className="linha">
            <button type="button" className="btn" data-v="sec" disabled={!adendo.trim() || estado === 'gravando'} onClick={() => void adicionarAdendo()}>
              Adicionar adendo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
