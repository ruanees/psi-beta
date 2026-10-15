'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { api, type Dto } from '@/lib/api.ts';
import { reaisParaCampo, valorEmReais } from '@/lib/campos.ts';
import { moeda } from '@/lib/formato.ts';
import { PLANO, valorPorSessao } from '@/lib/planos.ts';

// Plano do paciente (avulsa, pacote ou mensal). Diferente do resto da aba Dados,
// não grava no blur: tipo, sessões e valor mudam juntos, com um botão.

type Plano = Dto<'Plano'>;

interface Props {
  conta: string;
  paciente: string;
  plano: Dto<'PlanoDto'>;
  /** Valor da sessão avulsa guardado, mesmo com o paciente em outro plano. */
  valorSessao: number | null;
  valorPadrao: number | null | undefined;
  aoGravar: () => Promise<void>;
}

export function PlanoPaciente({ conta, paciente, plano, valorSessao, valorPadrao, aoGravar }: Props) {
  const [tipo, setTipo] = useState<Plano>(plano.tipo);
  const [sessoes, setSessoes] = useState(plano.sessoes?.toString() ?? '');
  const [valor, setValor] = useState(reaisParaCampo(plano.valor));
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [gravado, setGravado] = useState(false);

  const voltar = () => {
    setTipo(plano.tipo);
    setSessoes(plano.sessoes?.toString() ?? '');
    setValor(reaisParaCampo(plano.valor));
  };
  useEffect(voltar, [plano.tipo, plano.sessoes, plano.valor]);

  // Ao trocar o tipo, o valor do outro plano não serve: começa do que estava gravado para este.
  // Voltar para avulsa traz o valor da sessão que o paciente já tinha.
  const escolher = (t: Plano) => {
    setTipo(t);
    setErro(null);
    setGravado(false);
    setSessoes(t === plano.tipo ? (plano.sessoes?.toString() ?? '') : '');
    setValor(t === plano.tipo ? reaisParaCampo(plano.valor) : t === 'avulsa' ? reaisParaCampo(valorSessao) : '');
  };

  const nSessoes = sessoes.trim() ? Number(sessoes) : null;
  const nValor = valorEmReais(valor) ?? null;
  const mudou =
    tipo !== plano.tipo ||
    (tipo !== 'avulsa' && nSessoes !== plano.sessoes) ||
    nValor !== plano.valor;
  const cada = tipo === 'pacote' ? valorPorSessao(nValor, nSessoes) : null;

  async function gravar(e: FormEvent) {
    e.preventDefault();
    setGravando(true);
    setErro(null);
    try {
      await api('put', '/contas/{conta}/pacientes/{paciente}/plano', {
        params: { conta, paciente },
        corpo: { tipo, sessoes: tipo === 'avulsa' ? null : nSessoes, valor: nValor },
      });
      await aoGravar();
      setGravado(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gravar o plano.');
    } finally {
      setGravando(false);
    }
  }

  return (
    <section className="cartao">
      <div className="cartao-topo">
        <h2>Plano</h2>
        {gravado && !mudou && <span className="mudo pequeno">Plano gravado</span>}
      </div>
      <form className="pilha" data-g="p" onSubmit={(e) => void gravar(e)}>
        <div className="segmento" role="group" aria-label="Plano">
          {(Object.keys(PLANO) as Plano[]).map((t) => (
            <button key={t} type="button" aria-pressed={tipo === t} onClick={() => escolher(t)}>
              {PLANO[t].rotulo}
            </button>
          ))}
        </div>
        <p className="mudo pequeno">{PLANO[tipo].dica}</p>

        <div className="grade" data-n="2">
          {tipo === 'avulsa' && (
            <label className="campo">
              <span>Valor da sessão (R$)</span>
              <input
                className="ent"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={valorPadrao != null ? `Padrão: ${moeda(valorPadrao)}` : ''}
              />
              <small>Vazio usa o valor padrão do consultório.</small>
            </label>
          )}

          {tipo === 'pacote' && (
            <>
              <label className="campo">
                <span>Sessões no pacote</span>
                <input
                  className="ent"
                  inputMode="numeric"
                  value={sessoes}
                  onChange={(e) => setSessoes(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ex.: 4"
                  required
                />
              </label>
              <label className="campo">
                <span>Valor do pacote (R$)</span>
                <input className="ent" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} required />
                <small>{cada != null ? `${moeda(cada)} por sessão.` : 'Pago adiantado.'}</small>
              </label>
            </>
          )}

          {tipo === 'mensal' && (
            <>
              <label className="campo">
                <span>Valor do mês (R$)</span>
                <input className="ent" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} required />
              </label>
              <label className="campo">
                <span>Sessões por mês</span>
                <input
                  className="ent"
                  inputMode="numeric"
                  value={sessoes}
                  onChange={(e) => setSessoes(e.target.value.replace(/\D/g, ''))}
                  placeholder="Opcional"
                />
                <small>Só para referência; vazio segue a agenda.</small>
              </label>
            </>
          )}
        </div>

        {erro && (
          <div className="aviso" data-t="erro" role="alert">
            {erro}
          </div>
        )}
        {mudou && (
          <div className="linha">
            <button className="btn" type="submit" disabled={gravando}>
              {gravando ? 'Gravando…' : 'Gravar plano'}
            </button>
            <button className="btn" data-v="sec" type="button" onClick={voltar}>
              Desfazer
            </button>
          </div>
        )}
        {tipo === 'pacote' && (
          <p className="mudo pequeno">Sessões usadas e restantes do pacote aparecem quando o Financeiro chegar (fase 3).</p>
        )}
      </form>
    </section>
  );
}
