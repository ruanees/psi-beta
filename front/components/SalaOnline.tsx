'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, type Dto } from '@/lib/api.ts';
import { linkDoPaciente, nomeDaChamada } from '@/lib/sala.ts';
import { useApp } from './EstadoApp';
import { Icone } from './Icone';

// Na janela da sessão online: o link da chamada (desta sessão ou o fixo do
// perfil) e o link do paciente, que é um só para todas as sessões dele.

export function SalaOnline({ sessao, paciente }: { sessao: string; paciente: string }) {
  const { conta } = useApp();
  const [sala, setSala] = useState<Dto<'SalaSessaoDto'> | null>(null);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [trocar, setTrocar] = useState(false);

  const carregar = useCallback(() => {
    api('get', '/contas/{conta}/sessoes/{sessao}/sala', { params: { conta: conta.id, sessao } })
      .then((s) => {
        setSala(s);
        setTexto(s.linkSessao ?? '');
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível abrir a sala.'));
  }, [conta.id, sessao]);
  useEffect(carregar, [carregar]);

  if (!sala) return erro ? <div className="aviso" data-t="erro">{erro}</div> : null;

  const mudou = texto.trim() !== (sala.linkSessao ?? '');
  const executar = async (f: () => Promise<unknown>, ok: string) => {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      await f();
      setAviso(ok);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gravar.');
    } finally {
      setOcupado(false);
    }
  };
  const gravar = () =>
    executar(
      () => api('put', '/contas/{conta}/sessoes/{sessao}/sala', { params: { conta: conta.id, sessao }, corpo: { link: texto.trim() || null } }),
      texto.trim() ? 'Link desta sessão gravado.' : 'Esta sessão volta a usar o link do seu perfil.',
    );
  const copiar = () =>
    executar(() => navigator.clipboard.writeText(linkDoPaciente(sala.token)), 'Link do paciente copiado. Mande pelo canal que vocês já usam.');
  const gerarMeet = () =>
    executar(async () => {
      const s = await api('post', '/contas/{conta}/sessoes/{sessao}/sala/meet', { params: { conta: conta.id, sessao } });
      setSala(s);
    }, 'Sala do Meet do paciente criada. Ela vale para as próximas sessões online dele.');
  const renovar = () =>
    executar(async () => {
      const r = await api('post', '/contas/{conta}/pacientes/{paciente}/sala/renovar', { params: { conta: conta.id, paciente } });
      await navigator.clipboard.writeText(linkDoPaciente(r.token)).catch(() => undefined);
      setTrocar(false);
    }, 'Link do paciente trocado e copiado. O anterior não abre mais.');

  return (
    <div className="observacao pilha" data-g="p">
      <div className="cartao-topo">
        <strong>Sala online</strong>
        <span className="etiqueta">
          {sala.linkSessao
            ? 'Link desta sessão'
            : sala.linkMeet
              ? 'Meet do paciente'
              : sala.linkPerfil
                ? 'Link fixo do perfil'
                : 'Sem link da chamada'}
        </span>
      </div>

      {!sala.epsiOk && (
        <div className="aviso" data-t="atencao">
          Atendimento online pede cadastro no e-Psi (Resolução CFP 11/2018). Preencha o número em{' '}
          <Link href="/configuracoes">Configurações</Link>.
        </div>
      )}
      {sala.google === 'reconectar' && (
        <div className="aviso" data-t="atencao">
          O Google não aceita mais a sua conexão, então o Senda não cria salas do Meet. Conecte de novo em{' '}
          <Link href="/configuracoes">Configurações</Link>.
        </div>
      )}
      {sala.avisoMeet && sala.google !== 'reconectar' && (
        <div className="aviso" data-t="atencao">
          {sala.avisoMeet}
        </div>
      )}
      {erro && (
        <div className="aviso" data-t="erro" role="alert">
          {erro}
        </div>
      )}
      {aviso && (
        <div className="aviso" data-t="ok" role="status">
          {aviso}
        </div>
      )}

      <label className="campo">
        <span>Link da chamada desta sessão</span>
        <div className="linha">
          <input
            className="ent"
            type="url"
            inputMode="url"
            placeholder={sala.linkMeet ?? sala.linkPerfil ?? 'https://meet.google.com/…'}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
          {mudou && (
            <button type="button" className="btn" data-v="sec" disabled={ocupado} onClick={gravar}>
              Gravar
            </button>
          )}
        </div>
        <small>
          {sala.linkMeet
            ? 'Em branco, vale a sala do Meet do paciente, criada pelo Senda.'
            : sala.linkPerfil
              ? 'Em branco, vale o link fixo do seu perfil.'
              : 'Cole o link do Meet desta sessão, ou guarde um link fixo em Configurações.'}
        </small>
      </label>

      <div className="linha">
        {sala.link && (
          <a className="btn" href={sala.link} target="_blank" rel="noopener noreferrer">
            <Icone nome="video" tamanho={16} /> {nomeDaChamada(sala.link)}
          </a>
        )}
        {sala.google === 'conectada' && !sala.linkMeet && (
          <button type="button" className="btn" data-v="sec" disabled={ocupado} onClick={gerarMeet}>
            <Icone nome="video" tamanho={16} /> Gerar link do Meet
          </button>
        )}
        <button type="button" className="btn" data-v="sec" disabled={ocupado} onClick={copiar}>
          Copiar link do paciente
        </button>
        {!trocar && (
          <button type="button" className="btn" data-v="leve" onClick={() => setTrocar(true)}>
            Trocar link do paciente
          </button>
        )}
      </div>
      {trocar ? (
        <div className="aviso" data-t="atencao">
          <p>O link atual do paciente para de abrir. Use se ele foi parar com outra pessoa.</p>
          <div className="linha">
            <button type="button" className="btn" data-v="perigo" disabled={ocupado} onClick={renovar}>
              Trocar e copiar o novo
            </button>
            <button type="button" className="btn" data-v="leve" onClick={() => setTrocar(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <small className="mudo">
          O paciente usa sempre o mesmo link, sem senha. A chamada aparece para ele 15 minutos antes da sessão.
        </small>
      )}
    </div>
  );
}
