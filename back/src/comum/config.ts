// De onde veio cada configuração. O /saude responde a origem, nunca o valor:
// sem isso, "variável não chega" e "variável não cadastrada" têm o mesmo
// sintoma, e a investigação vira adivinhação (lição do DIME).
export type Origem = 'process' | 'worker' | 'faltando';

export const NOMES_CONFIG = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_JWT_SECRET',
  'ORIGENS',
  'FRONT_URL',
  // Fase 5b: sem os três, a conexão com o Google fica desligada (e nada quebra).
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CHAVE',
] as const;
export type NomeConfig = (typeof NOMES_CONFIG)[number];

let fonteWorker: Record<string, unknown> | undefined;

/** Chamado uma vez pelo ponto de entrada do Worker, com o `env` de `cloudflare:workers`. */
export function definirFonteWorker(env: Record<string, unknown>): void {
  fonteWorker = env;
}

export function lerConfig(nome: NomeConfig): { valor?: string; origem: Origem } {
  const doProcesso = process.env[nome];
  if (doProcesso) return { valor: doProcesso, origem: 'process' };
  const doWorker = fonteWorker?.[nome];
  if (typeof doWorker === 'string' && doWorker) return { valor: doWorker, origem: 'worker' };
  return { origem: 'faltando' };
}

export class ConfigFaltando extends Error {
  constructor(readonly nome: NomeConfig) {
    super(`Configuração ausente: ${nome}`);
  }
}

export function exigirConfig(nome: NomeConfig): string {
  const { valor } = lerConfig(nome);
  if (!valor) throw new ConfigFaltando(nome);
  return valor;
}

export function origensPermitidas(): string[] {
  return (lerConfig('ORIGENS').valor ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Quando esta versão do Worker foi publicada, pelo binding `version_metadata`
 * do wrangler.toml. Fora do Worker (testes, Node), `local`.
 */
export function versaoPublicada(): string {
  const meta = fonteWorker?.VERSAO_CF as { timestamp?: unknown; id?: unknown } | undefined;
  if (meta && typeof meta.timestamp === 'string' && meta.timestamp) return meta.timestamp;
  return process.env.PSI_VERSAO ?? 'local';
}
