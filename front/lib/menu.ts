// O menu é dado. Dele saem as três telas — a barra de cima, a barra de baixo
// do celular e a folha da conta. Escritas à parte, elas se desencontrariam
// caladas: o item que existe no computador e some no telefone (lição do DIME).
//
// `pronta` diz se a rota existe. Item que não está pronto aparece apagado,
// com o selo "em breve", e não vira link: 404 parece deploy quebrado.
// Cada fase liga uma linha. scripts/prova-menu.ts confere contra as páginas.
//
// Isto é conveniência, não proteção: quem corta o dado é a RLS.

export type Icone = 'inicio' | 'agenda' | 'pacientes' | 'financeiro' | 'relatorios' | 'configuracoes';

export interface ItemMenu {
  id: string;
  rotulo: string;
  rota: string;
  icone: Icone;
  pronta: boolean;
  fase: number;
}

export const MENU: readonly ItemMenu[] = [
  { id: 'inicio', rotulo: 'Início', rota: '/inicio', icone: 'inicio', pronta: true, fase: 0 },
  { id: 'agenda', rotulo: 'Agenda', rota: '/agenda', icone: 'agenda', pronta: false, fase: 1 },
  { id: 'pacientes', rotulo: 'Pacientes', rota: '/pacientes', icone: 'pacientes', pronta: false, fase: 1 },
  { id: 'financeiro', rotulo: 'Financeiro', rota: '/financeiro', icone: 'financeiro', pronta: false, fase: 3 },
  { id: 'relatorios', rotulo: 'Relatórios', rota: '/relatorios', icone: 'relatorios', pronta: false, fase: 4 },
];

/** Itens da folha da conta (o círculo no canto). */
export const MENU_CONTA: readonly ItemMenu[] = [
  { id: 'configuracoes', rotulo: 'Configurações', rota: '/configuracoes', icone: 'configuracoes', pronta: true, fase: 0 },
];

export function itemAtivo(rota: string, caminho: string): boolean {
  return caminho === rota || caminho.startsWith(`${rota}/`);
}
