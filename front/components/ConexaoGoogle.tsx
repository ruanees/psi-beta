'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type Dto } from '@/lib/api.ts';
import { fd } from '@/lib/formato.ts';
import { useApp } from './EstadoApp';
import { Icone } from './Icone';

// Configurações: conta Google para o Senda criar as salas do Meet. Some
// inteira enquanto a integração não estiver ligada no servidor.

export function ConexaoGoogle() {
  const { conta } = useApp();
  const [s, setS] = useState<Dto<'GoogleStatusDto'> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  const carregar = useCallback(() => {
    api('get', '/contas/{conta}/google', { params: { conta: conta.id } })
      .then(setS)
      .catch(() => setS(null));
  }, [conta.id]);

  useEffect(() => {
    carregar();
    if (new URLSearchParams(window.location.search).get('google') === 'ok') {
      setAviso('Conta Google conectada. As sessões online passam a ganhar sala do Meet sozinhas.');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [carregar]);

  if (!s?.disponivel) return null;

  const conectar = async () => {
    setErro(null);
    setOcupado(true);
    try {
      const { url } = await api('post', '/contas/{conta}/google/conectar', { params: { conta: conta.id } });
      window.location.assign(url);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o Google.');
      setOcupado(false);
    }
  };
  const desconectar = async () => {
    setErro(null);
    setOcupado(true);
    try {
      await api('delete', '/contas/{conta}/google', { params: { conta: conta.id } });
      setAviso('Conta Google desconectada. As salas do Meet já criadas continuam funcionando.');
      setConfirmar(false);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível desconectar.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="cartao pilha" data-g="p">
      <div className="cartao-topo">
        <h2>
          <Icone nome="video" /> Google Meet
        </h2>
        {s.conectada && !s.falhou && <span className="etiqueta" data-v="ac">Conectada</span>}
      </div>
      {aviso && (
        <div className="aviso" data-t="ok" role="status">
          {aviso}
        </div>
      )}
      {erro && (
        <div className="aviso" data-t="erro" role="alert">
          {erro}
        </div>
      )}

      {!s.conectada ? (
        <>
          <p className="mudo">
            Conecte sua conta Google uma vez e o Senda cria a sala do Meet de cada paciente online. O paciente entra pelo link
            dele, sem você precisar colar nada.
          </p>
          <div className="linha">
            <button type="button" className="btn" disabled={ocupado} onClick={conectar}>
              Conectar Google
            </button>
          </div>
          <small className="mudo">O Senda só pede para criar salas do Meet. Não grava nem transcreve sessão nenhuma.</small>
        </>
      ) : (
        <>
          {s.falhou ? (
            <div className="aviso" data-t="atencao">
              O Google não aceita mais a conexão de <strong>{s.email}</strong>. Conecte de novo para voltar a gerar as salas.
            </div>
          ) : (
            <p>
              Conectada como <strong>{s.email}</strong>
              {s.conectadaEm && <span className="mudo"> desde {fd(s.conectadaEm)}</span>}.
            </p>
          )}
          <div className="linha">
            {s.falhou && (
              <button type="button" className="btn" disabled={ocupado} onClick={conectar}>
                Conectar de novo
              </button>
            )}
            {!confirmar ? (
              <button type="button" className="btn" data-v="leve" onClick={() => setConfirmar(true)}>
                Desconectar
              </button>
            ) : (
              <>
                <button type="button" className="btn" data-v="perigo" disabled={ocupado} onClick={desconectar}>
                  Desconectar a conta Google
                </button>
                <button type="button" className="btn" data-v="leve" onClick={() => setConfirmar(false)}>
                  Cancelar
                </button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
