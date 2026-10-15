'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type Dto } from '@/lib/api.ts';
import { reaisParaCampo, valorEmReais } from '@/lib/campos.ts';
import { fd, moeda } from '@/lib/formato.ts';
import { valorPorSessao } from '@/lib/planos.ts';
import { STATUS_COBRANCA } from '@/lib/status.ts';
import { useApp } from './EstadoApp';

// Aba Pacotes: os pacotes vendidos, com sessões usadas e restantes. Pacote é
// pago adiantado e não tem validade; a cobrança do valor inteiro nasce junto.
// O saldo é contado pelo banco: realizada e falta gastam, desmarcada não.

type Pacote = Dto<'PacoteDto'>;

export function PacotesPaciente({ paciente, plano }: { paciente: string; plano: Dto<'PlanoDto'> }) {
  const { conta } = useApp();
  const params = { conta: conta.id, paciente };
  const [pacotes, setPacotes] = useState<Pacote[] | null>(null);
  const [vendendo, setVendendo] = useState(false);
  const [qtd, setQtd] = useState('');
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setPacotes(await api('get', '/contas/{conta}/pacientes/{paciente}/pacotes', { params: { conta: conta.id, paciente } }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar os pacotes.');
    }
  }, [conta.id, paciente]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrirVenda() {
    // Começa do plano do paciente, se ele for de pacote.
    setQtd(plano.tipo === 'pacote' && plano.sessoes ? String(plano.sessoes) : '');
    setValor(plano.tipo === 'pacote' ? reaisParaCampo(plano.valor) : '');
    setErro(null);
    setVendendo(true);
  }

  async function vender(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      await api('post', '/contas/{conta}/pacientes/{paciente}/pacotes', {
        params,
        corpo: { quantidade: Number(qtd), valor: valorEmReais(valor) },
      });
      setVendendo(false);
      await carregar();
    } catch (er) {
      setErro(er instanceof Error ? er.message : 'Não foi possível vender o pacote.');
    } finally {
      setOcupado(false);
    }
  }

  const cada = valorPorSessao(valorEmReais(valor) ?? null, qtd ? Number(qtd) : null);

  return (
    <section className="cartao">
      <div className="cartao-topo">
        <h2>Pacotes</h2>
        {!vendendo && (
          <button className="btn" data-v="suave" onClick={abrirVenda}>
            Vender pacote
          </button>
        )}
      </div>
      {erro && (
        <div className="aviso" data-t="erro" role="alert">
          {erro}
        </div>
      )}
      {vendendo && (
        <form className="bloco-responsavel pilha" data-g="p" onSubmit={(e) => void vender(e)}>
          <div className="grade" data-n="2">
            <label className="campo">
              <span>Sessões no pacote</span>
              <input className="ent" inputMode="numeric" value={qtd} required onChange={(e) => setQtd(e.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="campo">
              <span>Valor do pacote (R$)</span>
              <input className="ent" inputMode="decimal" value={valor} required onChange={(e) => setValor(e.target.value)} />
              <small>{cada != null ? `${moeda(cada)} por sessão.` : 'Pago adiantado, sem validade.'}</small>
            </label>
          </div>
          <p className="mudo pequeno">A cobrança do valor inteiro nasce junto, pendente, com vencimento hoje.</p>
          <div className="linha">
            <button className="btn" disabled={ocupado}>
              {ocupado ? 'Gravando…' : 'Vender pacote'}
            </button>
            <button type="button" className="btn" data-v="sec" onClick={() => setVendendo(false)}>
              Voltar
            </button>
          </div>
        </form>
      )}
      {pacotes === null && !erro ? (
        <p className="mudo">Carregando…</p>
      ) : pacotes && pacotes.length === 0 ? (
        <div className="vazio">Nenhum pacote vendido.</div>
      ) : (
        <ul className="lista">
          {(pacotes ?? []).map((p) => {
            const st = p.cobranca ? STATUS_COBRANCA[p.cobranca.situacao] : null;
            return (
              <li key={p.id}>
                <span className="cobranca-texto">
                  <strong>
                    {p.quantidade} sessões · {moeda(p.valor)}
                  </strong>
                  <small className="mudo">Vendido em {fd(p.criadoEm)}</small>
                  <span className="barra-saldo" role="img" aria-label={`${p.usadas} de ${p.quantidade} usadas`}>
                    <span style={{ width: `${(100 * p.usadas) / p.quantidade}%` }} />
                  </span>
                </span>
                <span className="mudo num">
                  {p.usadas} usadas · <strong>{p.restantes} restantes</strong>
                </span>
                {st && (
                  <span className="selo" data-c={st.cor}>
                    {st.rotulo}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Uma linha para o Resumo: o saldo dos pacotes do paciente, se ele tiver algum. */
export function SaldoPacote({ paciente }: { paciente: string }) {
  const { conta } = useApp();
  const [pacotes, setPacotes] = useState<Pacote[] | null>(null);
  useEffect(() => {
    api('get', '/contas/{conta}/pacientes/{paciente}/pacotes', { params: { conta: conta.id, paciente } })
      .then(setPacotes)
      .catch(() => setPacotes([]));
  }, [conta.id, paciente]);
  if (!pacotes || pacotes.length === 0) return null;
  const restantes = pacotes.reduce((s, p) => s + p.restantes, 0);
  const atual = pacotes.find((p) => p.restantes > 0) ?? pacotes[0];
  return (
    <span className="etiqueta" data-v={restantes <= 1 ? undefined : 'ac'}>
      {restantes === 0
        ? 'Pacote esgotado: as próximas sessões serão cobradas avulsas'
        : `Pacote: ${atual.usadas} de ${atual.quantidade} usadas · ${restantes} ${restantes === 1 ? 'restante' : 'restantes'}`}
    </span>
  );
}
