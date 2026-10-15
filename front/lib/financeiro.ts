// O que cada cobrança é, em uma linha, e o mês como o financeiro filtra.
// Datas sempre pelo lib/formato e lib/datas: uma grafia só.
import type { Dto } from './api.ts';
import { partes } from './datas.ts';
import { fd } from './formato.ts';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-10" → "outubro de 2026". */
export function nomeDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

/** "2026-10" → primeiro e último dia do mês, para filtrar por vencimento. */
export function limitesDoMes(mes: string): { de: string; ate: string } {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

type Cobranca = Pick<Dto<'CobrancaDto'>, 'origem' | 'sessaoInicio' | 'pacoteQuantidade' | 'referencia'>;

/** "Sessão de 14/10/26", "Pacote de 10 sessões", "Mensalidade de outubro de 2026". */
export function descricaoCobranca(c: Cobranca): string {
  if (c.origem === 'sessao') return c.sessaoInicio ? `Sessão de ${fd(partes(c.sessaoInicio).dia)}` : 'Sessão';
  if (c.origem === 'pacote') return c.pacoteQuantidade ? `Pacote de ${c.pacoteQuantidade} sessões` : 'Pacote';
  return c.referencia ? `Mensalidade de ${nomeDoMes(c.referencia.slice(0, 7))}` : 'Mensalidade';
}
