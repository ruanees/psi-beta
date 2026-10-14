// A porta única de abertura de ficha. Módulo novo entra numa linha desta
// tabela, nunca num if/else: no DIME, um despacho binário mandava tudo que não
// era show para o Audiovisual, sem erro e sem nada na tela.

export const FICHAS = {
  paciente: { rota: (id: string) => `/pacientes/${id}`, pronta: false, fase: 1 },
  sessao: { rota: (id: string) => `/agenda/sessoes/${id}`, pronta: false, fase: 1 },
} as const satisfies Record<string, { rota: (id: string) => string; pronta: boolean; fase: number }>;

export type TipoFicha = keyof typeof FICHAS;

/** Caminho da ficha, ou null se o módulo ainda não tem tela. Nunca cai em outra ficha. */
export function caminhoDaFicha(tipo: TipoFicha, id: string): string | null {
  const ficha = FICHAS[tipo];
  if (!ficha) throw new Error(`tipo de ficha desconhecido: ${String(tipo)}`);
  return ficha.pronta ? ficha.rota(id) : null;
}
