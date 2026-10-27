'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type Dto } from '@/lib/api.ts';
import { fd, fdh } from '@/lib/formato.ts';
import {
  corpoDaTransferencia,
  frasePacientes,
  quemEntrega,
  quemRecebe,
  rotuloDoPsicologo,
  type Psicologo,
} from '@/lib/transferencia.ts';

type PacienteDe = Dto<'PacienteDoPsicologoDto'>;

const SITUACAO: Record<PacienteDe['situacao'], string> = { ativo: 'Ativo', alta: 'Alta', arquivado: 'Arquivado' };

/**
 * Passa pacientes de um psicólogo para outro do consultório. Só o titular vê.
 * O paciente vai com o prontuário: quem recebe passa a ler e escrever o
 * clínico, e quem entregou deixa de ler. Sessões futuras e a repetição vão
 * junto; as passadas ficam com quem atendeu.
 */
export function TransferirPacientes({ conta }: { conta: string }) {
  const [psicologos, setPsicologos] = useState<Psicologo[] | null>(null);
  const [historico, setHistorico] = useState<Dto<'TransferenciaDto'>[]>([]);
  const [de, setDe] = useState('');
  const [para, setPara] = useState('');
  const [pacientes, setPacientes] = useState<PacienteDe[] | null>(null);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [motivo, setMotivo] = useState('');
  const [msg, setMsg] = useState<{ t: 'ok' | 'erro'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([
        api('get', '/contas/{conta}/psicologos', { params: { conta } }),
        api('get', '/contas/{conta}/transferencias', { params: { conta } }),
      ]);
      setPsicologos(p);
      setHistorico(h);
    } catch (e) {
      setMsg({ t: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível carregar os psicólogos.' });
    }
  }, [conta]);
  useEffect(() => void carregar(), [carregar]);

  const escolherDe = async (membro: string) => {
    setDe(membro);
    setPara('');
    setPacientes(null);
    setEscolhidos([]);
    setMsg(null);
    if (!membro) return;
    try {
      const lista = await api('get', '/contas/{conta}/psicologos/{membro}/pacientes', { params: { conta, membro } });
      setPacientes(lista);
      setEscolhidos(lista.map((p) => p.id));
    } catch (e) {
      setMsg({ t: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível carregar os pacientes.' });
    }
  };

  if (psicologos === null) {
    return (
      <section className="cartao">
        <h2>Transferir pacientes</h2>
        {msg ? (
          <div className="aviso" data-t={msg.t}>
            {msg.texto}
          </div>
        ) : (
          <p className="mudo">Carregando…</p>
        )}
      </section>
    );
  }

  const entregam = quemEntrega(psicologos);
  const recebem = quemRecebe(psicologos, de || null);
  const nomeDe = psicologos.find((p) => p.membroId === de)?.nome ?? '';
  const nomePara = psicologos.find((p) => p.membroId === para)?.nome ?? '';

  const transferir = async () => {
    if (!de || !para || escolhidos.length === 0) return;
    const ok = window.confirm(
      `Transferir ${frasePacientes(escolhidos.length)} de ${nomeDe} para ${nomePara}?\n\n` +
        `${nomePara} passa a ler e escrever o prontuário, e ${nomeDe} deixa de ler. ` +
        'As sessões futuras e a repetição vão junto; as passadas ficam com quem atendeu.',
    );
    if (!ok) return;
    setOcupado(true);
    setMsg(null);
    try {
      const r = await api('post', '/contas/{conta}/transferencias', {
        params: { conta },
        corpo: corpoDaTransferencia(de, para, escolhidos, motivo),
      });
      setMsg({ t: 'ok', texto: `${frasePacientes(r.transferidos)} passaram para ${nomePara}.` });
      setDe('');
      setPara('');
      setPacientes(null);
      setEscolhidos([]);
      setMotivo('');
      await carregar();
    } catch (e) {
      setMsg({ t: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível transferir.' });
    } finally {
      setOcupado(false);
    }
  };

  const alternar = (id: string) =>
    setEscolhidos(escolhidos.includes(id) ? escolhidos.filter((x) => x !== id) : [...escolhidos, id]);

  return (
    <section className="cartao">
      <h2>Transferir pacientes</h2>
      <p className="mudo">
        Passa pacientes de um psicólogo para outro do consultório, com o prontuário. Quem recebe passa a ler e escrever o
        clínico; quem entregou deixa de ler. As sessões futuras e a repetição vão junto, e as passadas ficam com
        quem atendeu.
      </p>
      {msg && (
        <div className="aviso" data-t={msg.t}>
          {msg.texto}
        </div>
      )}

      {entregam.length === 0 ? (
        <p className="mudo">Nenhum psicólogo do consultório tem paciente para transferir.</p>
      ) : (
        <>
          <div className="grade" data-n="2">
            <label className="campo">
              <span>De</span>
              <select className="ent" value={de} onChange={(e) => void escolherDe(e.target.value)}>
                <option value="">Escolha o psicólogo</option>
                {entregam.map((p) => (
                  <option key={p.membroId} value={p.membroId}>
                    {rotuloDoPsicologo(p)}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Para</span>
              <select className="ent" value={para} disabled={!de} onChange={(e) => setPara(e.target.value)}>
                <option value="">{recebem.length ? 'Escolha quem recebe' : 'Nenhum outro psicólogo ativo'}</option>
                {recebem.map((p) => (
                  <option key={p.membroId} value={p.membroId}>
                    {p.nome}
                  </option>
                ))}
              </select>
              {de && recebem.length === 0 && (
                <small>Para receber, a pessoa precisa entrar no consultório como psicólogo.</small>
              )}
            </label>
          </div>

          {pacientes && (
            <div className="pilha" data-g="p">
              <div className="linha" data-entre>
                <span className="mudo pequeno">
                  {frasePacientes(escolhidos.length)} de {frasePacientes(pacientes.length)}
                </span>
                <span className="linha">
                  <button type="button" className="btn" data-v="leve" onClick={() => setEscolhidos(pacientes.map((p) => p.id))}>
                    Todos
                  </button>
                  <button type="button" className="btn" data-v="leve" onClick={() => setEscolhidos([])}>
                    Nenhum
                  </button>
                </span>
              </div>
              <ul className="lista">
                {pacientes.map((p) => (
                  <li key={p.id}>
                    <label className="alternar">
                      <input type="checkbox" checked={escolhidos.includes(p.id)} onChange={() => alternar(p.id)} />
                      {p.nome}
                    </label>
                    <span className="mudo pequeno">
                      {SITUACAO[p.situacao]}
                      {p.proximaSessao ? ` · próxima sessão ${fdh(p.proximaSessao)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {de && (
            <label className="campo">
              <span>Motivo (opcional)</span>
              <input
                className="ent"
                value={motivo}
                maxLength={500}
                placeholder="Ex.: saiu do consultório"
                onChange={(e) => setMotivo(e.target.value)}
              />
              <small>Fica no registro da transferência.</small>
            </label>
          )}

          <div>
            <button className="btn" disabled={ocupado || !de || !para || escolhidos.length === 0} onClick={() => void transferir()}>
              {ocupado ? 'Transferindo…' : `Transferir ${frasePacientes(escolhidos.length)}`}
            </button>
          </div>
        </>
      )}

      {historico.length > 0 && (
        <div className="pilha" data-g="p">
          <span className="mudo pequeno">Últimas transferências</span>
          <ul className="lista">
            {historico.map((t) => (
              <li key={t.id}>
                <span>
                  <strong>{t.paciente}</strong> · de {t.de} para {t.para}
                  {t.motivo ? ` · ${t.motivo}` : ''}
                </span>
                <span className="mudo pequeno">
                  {fd(t.em)}
                  {t.quem ? ` · por ${t.quem}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
