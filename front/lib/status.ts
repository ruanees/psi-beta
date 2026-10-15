// O mapa de cor de status, num lugar só (PLANO.md, seção 04). Status nunca
// usa a cor de ação. Âmbar = fechado e parado esperando a data; verde = aconteceu.
import type { Dto } from './api.ts';

export type CorSelo = 'nt' | 'at' | 'ok' | 'er' | 'ci' | 'tracejado';

export const STATUS_SESSAO = {
  agendada: { rotulo: 'Agendada', cor: 'nt' },
  confirmada: { rotulo: 'Confirmada', cor: 'at' },
  realizada: { rotulo: 'Realizada', cor: 'ok' },
  falta: { rotulo: 'Falta', cor: 'er' },
  cancelada: { rotulo: 'Desmarcada', cor: 'tracejado' },
} as const satisfies Record<Dto<'StatusSessao'>, { rotulo: string; cor: CorSelo }>;

export const SITUACAO_PACIENTE = {
  ativo: { rotulo: 'Ativo', cor: 'ok' },
  alta: { rotulo: 'Alta', cor: 'ci' },
  arquivado: { rotulo: 'Arquivado', cor: 'nt' },
} as const satisfies Record<Dto<'SituacaoPaciente'>, { rotulo: string; cor: CorSelo }>;

export const MODALIDADE = {
  presencial: 'Presencial',
  online: 'Online',
} as const satisfies Record<Dto<'Modalidade'>, string>;

export const STATUS_COBRANCA = {
  pendente: { rotulo: 'Pendente', cor: 'at' },
  paga: { rotulo: 'Paga', cor: 'ok' },
  vencida: { rotulo: 'Vencida', cor: 'er' },
  cancelada: { rotulo: 'Cancelada', cor: 'tracejado' },
} as const satisfies Record<Dto<'SituacaoCobranca'>, { rotulo: string; cor: CorSelo }>;

export const FORMA_PAGAMENTO = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  transferencia: 'Transferência',
  boleto: 'Boleto',
} as const satisfies Record<Dto<'FormaPagamento'>, string>;
