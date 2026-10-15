// A sessão mora no sessionStorage: some quando a aba fecha. Consultório tem
// computador compartilhado; sessão que sobrevive ao navegador fechado é a que
// o próximo paciente encontra aberta.

export interface Sessao {
  acesso: string;
  renovacao: string;
  /** Epoch em segundos. */
  expiraEm: number;
}

const CHAVE = 'psi.sessao';
let atual: Sessao | null | undefined;
const ouvintes = new Set<() => void>();

export function lerSessao(): Sessao | null {
  if (atual !== undefined) return atual;
  try {
    atual = JSON.parse(sessionStorage.getItem(CHAVE) ?? 'null') as Sessao | null;
  } catch {
    atual = null;
  }
  return atual;
}

export function gravarSessao(s: Sessao | null): void {
  atual = s;
  try {
    if (s) sessionStorage.setItem(CHAVE, JSON.stringify(s));
    else sessionStorage.removeItem(CHAVE);
  } catch {
    // Sem storage (aba privada restrita): a sessão vive só na memória desta página.
  }
  ouvintes.forEach((f) => f());
}

export function aoMudarSessao(f: () => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

export type MotivoSaida = 'pediu' | 'inatividade' | 'expirou';

export function caminhoDeSaida(motivo: MotivoSaida): string {
  return motivo === 'pediu' ? '/' : `/?motivo=${motivo}`;
}
