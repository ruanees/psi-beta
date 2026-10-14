// O mapa de cor de status, num lugar só (PLANO.md, seção 04). Status nunca
// usa a cor de ação. As fases 1 e 3 só leem daqui.

export type CorSelo = 'nt' | 'at' | 'ok' | 'er' | 'ci' | 'tracejado';

export const STATUS_SESSAO = {
  agendada: { rotulo: 'Agendada', cor: 'nt' },
  confirmada: { rotulo: 'Confirmada', cor: 'at' },
  realizada: { rotulo: 'Realizada', cor: 'ok' },
  falta: { rotulo: 'Falta', cor: 'er' },
  cancelada: { rotulo: 'Cancelada', cor: 'tracejado' },
} as const satisfies Record<string, { rotulo: string; cor: CorSelo }>;

export const STATUS_COBRANCA = {
  pendente: { rotulo: 'Pendente', cor: 'at' },
  paga: { rotulo: 'Paga', cor: 'ok' },
  vencida: { rotulo: 'Vencida', cor: 'er' },
  cancelada: { rotulo: 'Cancelada', cor: 'tracejado' },
} as const satisfies Record<string, { rotulo: string; cor: CorSelo }>;
