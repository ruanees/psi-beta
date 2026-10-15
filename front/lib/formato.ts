// O único lugar que escreve data, dinheiro e duração. Data escrita à mão numa
// tela é onde a segunda grafia começa (no DIME, `2026-09-19` ao lado de `19/09/26`).

const DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' });
const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});
const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Data ISO (`2026-09-19` ou `2026-09-19T14:00:00Z`) → `19/09/26`. Vazio vira travessão. */
export function fd(iso: string | null | undefined): string {
  if (!iso) return '—';
  // Data pura é dia do calendário, não instante: meio-dia evita virar o dia anterior no fuso.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATA.format(d);
}

/** Date ou epoch em milissegundos → `19/09/26`. */
export function fdDe(d: Date | number): string {
  const data = typeof d === 'number' ? new Date(d) : d;
  return Number.isNaN(data.getTime()) ? '—' : DATA.format(data);
}

/** Date ou ISO → `19/09/26, 14:00`. */
export function fdh(d: Date | string): string {
  const data = typeof d === 'string' ? new Date(d) : d;
  return Number.isNaN(data.getTime()) ? '—' : DATA_HORA.format(data);
}

/** 180 → `R$ 180,00`. Nulo vira travessão, nunca `R$ 0,00`. */
export function moeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return MOEDA.format(valor).replace(/ /g, ' ');
}

/** Minutos → `50 min`, `1 h`, `1 h 30 min`. */
export function duracao(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos < 0) return '—';
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
