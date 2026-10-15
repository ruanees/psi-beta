'use client';

import type { Dto } from '@/lib/api.ts';
import { valorEmReais } from '@/lib/campos.ts';
import { moeda } from '@/lib/formato.ts';
import { PLANO, valorPorSessao } from '@/lib/planos.ts';

// Escolha do plano e os campos de cada um. Só desenha: quem usa guarda o estado
// e decide quando gravar (a ficha tem botão; o cadastro grava junto com o resto).

type Plano = Dto<'Plano'>;

interface Props {
  tipo: Plano;
  /** Texto dos campos, como digitado. */
  sessoes: string;
  valor: string;
  valorPadrao: number | null | undefined;
  aoEscolher: (t: Plano) => void;
  aoMudarSessoes: (v: string) => void;
  aoMudarValor: (v: string) => void;
}

export function CamposDoPlano({ tipo, sessoes, valor, valorPadrao, aoEscolher, aoMudarSessoes, aoMudarValor }: Props) {
  const cada = tipo === 'pacote' ? valorPorSessao(valorEmReais(valor) ?? null, sessoes ? Number(sessoes) : null) : null;
  return (
    <>
      <div className="segmento" role="group" aria-label="Plano">
        {(Object.keys(PLANO) as Plano[]).map((t) => (
          <button key={t} type="button" aria-pressed={tipo === t} onClick={() => aoEscolher(t)}>
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
              onChange={(e) => aoMudarValor(e.target.value)}
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
                onChange={(e) => aoMudarSessoes(e.target.value.replace(/\D/g, ''))}
                placeholder="Ex.: 4"
                required
              />
            </label>
            <label className="campo">
              <span>Valor do pacote (R$)</span>
              <input className="ent" inputMode="decimal" value={valor} onChange={(e) => aoMudarValor(e.target.value)} required />
              <small>{cada != null ? `${moeda(cada)} por sessão.` : 'Pago adiantado.'}</small>
            </label>
          </>
        )}

        {tipo === 'mensal' && (
          <>
            <label className="campo">
              <span>Valor do mês (R$)</span>
              <input className="ent" inputMode="decimal" value={valor} onChange={(e) => aoMudarValor(e.target.value)} required />
            </label>
            <label className="campo">
              <span>Sessões por mês</span>
              <input
                className="ent"
                inputMode="numeric"
                value={sessoes}
                onChange={(e) => aoMudarSessoes(e.target.value.replace(/\D/g, ''))}
                placeholder="Opcional"
              />
              <small>Só para referência; vazio segue a agenda.</small>
            </label>
          </>
        )}
      </div>
    </>
  );
}
