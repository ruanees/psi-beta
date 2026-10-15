// Plano do paciente: como ele paga. Rótulo, explicação e a linha de resumo
// moram aqui, num lugar só, para a ficha e (na fase 3) o Financeiro falarem igual.
import type { Dto } from './api.ts';
import { moeda } from './formato.ts';

export const PLANO = {
  avulsa: { rotulo: 'Avulsa', dica: 'Paga sessão a sessão. Falta sem aviso no prazo também é cobrada.' },
  pacote: {
    rotulo: 'Pacote',
    dica: 'Sessões pagas adiantado, sem validade. Sessão realizada e falta sem aviso no prazo gastam uma sessão do pacote.',
  },
  mensal: { rotulo: 'Mensal', dica: 'Valor fixo por mês, independente de quantas sessões o mês tiver.' },
} as const satisfies Record<Dto<'Plano'>, { rotulo: string; dica: string }>;

/** Valor de cada sessão do pacote, arredondado ao centavo. */
export function valorPorSessao(valor: number | null, sessoes: number | null): number | null {
  if (valor == null || !sessoes || sessoes < 1 || !Number.isFinite(valor)) return null;
  return Math.round((valor / sessoes) * 100) / 100;
}

/** Uma linha: "Pacote de 4 sessões · R$ 520,00 (R$ 130,00 por sessão)". */
export function resumoPlano(plano: Dto<'PlanoDto'>, valorPadrao: number | null | undefined): string {
  if (plano.tipo === 'pacote') {
    const cada = valorPorSessao(plano.valor, plano.sessoes);
    return `Pacote de ${plano.sessoes} sessões · ${moeda(plano.valor)}${cada != null ? ` (${moeda(cada)} por sessão)` : ''}`;
  }
  if (plano.tipo === 'mensal') {
    return `Mensal · ${moeda(plano.valor)} por mês${plano.sessoes ? ` · ${plano.sessoes} sessões` : ''}`;
  }
  const valor = plano.valor ?? valorPadrao;
  if (valor == null) return 'Avulsa · valor a definir';
  return `Avulsa · ${moeda(valor)} por sessão${plano.valor == null ? ' (padrão do consultório)' : ''}`;
}
