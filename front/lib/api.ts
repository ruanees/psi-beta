// A porta única para o back. Toda chamada passa aqui, e toda escrita também:
// é daqui que o selo de gravação sabe se a última alteração chegou.
// Os tipos vêm do OpenAPI do back (npm run tipos): mudou o DTO lá, o build
// daqui quebra no lugar exato.
import type { components, paths } from './api-tipos.ts';
import { gravarSessao, lerSessao, type Sessao } from './sessao.ts';

/** Um DTO do back pelo nome: `Dto<'ContaDto'>`. */
export type Dto<N extends keyof components['schemas']> = components['schemas'][N];

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

type Metodo = 'get' | 'post' | 'patch' | 'put' | 'delete';
type MetodosDe<P extends keyof paths> = {
  [M in Metodo]: [NonNullable<paths[P][M]>] extends [never] ? never : M;
}[Metodo];
type Operacao<P extends keyof paths, M extends Metodo> = NonNullable<paths[P][M]>;

type CorpoDe<O> = O extends { requestBody: { content: { 'application/json': infer C } } }
  ? C
  : O extends { requestBody?: { content: { 'application/json': infer C } } }
    ? C
    : never;

type RespostaDe<O> = O extends { responses: infer R }
  ? R extends { 200: { content: { 'application/json': infer T } } }
    ? T
    : R extends { 201: { content: { 'application/json': infer T } } }
      ? T
      : void
  : never;

type ParametrosDe<O> = O extends { parameters: { path: infer P } } ? ([P] extends [never] ? never : P) : never;

interface Opcoes<O> {
  params?: ParametrosDe<O>;
  corpo?: CorpoDe<O>;
  /** Usa este token em vez do da sessão (link de recuperação, segundo fator). */
  jwt?: string;
  /** Rota pública: não manda token nem tenta renovar. */
  publica?: boolean;
}

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
    readonly codigo?: string,
  ) {
    super(mensagem);
  }
}

// ------------------------------------------------------------ selo de gravação

export type EstadoGravacao = { falhou: false } | { falhou: true; mensagem: string };
let gravacao: EstadoGravacao = { falhou: false };
const ouvintesGravacao = new Set<(e: EstadoGravacao) => void>();

export function aoMudarGravacao(f: (e: EstadoGravacao) => void): () => void {
  ouvintesGravacao.add(f);
  return () => ouvintesGravacao.delete(f);
}

function marcarGravacao(e: EstadoGravacao) {
  gravacao = e;
  ouvintesGravacao.forEach((f) => f(gravacao));
}

// ------------------------------------------------------------ sessão expirada

let aoExpirar: (() => void) | undefined;
/** O Shell registra o que fazer quando a sessão não puder mais ser renovada. */
export function definirAoExpirar(f: () => void): void {
  aoExpirar = f;
}

let renovando: Promise<Sessao | null> | undefined;

async function renovar(): Promise<Sessao | null> {
  const s = lerSessao();
  if (!s) return null;
  renovando ??= (async () => {
    try {
      const r = await fetch(`${BASE}/sessao/renovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renovacao: s.renovacao }),
      });
      if (!r.ok) {
        // 503 é o servidor fora, não a sessão vencida: mantém a sessão.
        if (r.status >= 500) return s;
        gravarSessao(null);
        aoExpirar?.();
        return null;
      }
      const nova = (await r.json()) as Sessao;
      gravarSessao({ acesso: nova.acesso, renovacao: nova.renovacao, expiraEm: nova.expiraEm });
      return lerSessao();
    } catch {
      return s;
    } finally {
      renovando = undefined;
    }
  })();
  return renovando;
}

// ------------------------------------------------------------ chamada

function montarCaminho(caminho: string, params?: Record<string, string>): string {
  return caminho.replace(/\{([^}]+)\}/g, (_, nome: string) => {
    const v = params?.[nome];
    if (!v) throw new Error(`parâmetro ${nome} ausente em ${caminho}`);
    return encodeURIComponent(v);
  });
}

export async function api<P extends keyof paths, M extends MetodosDe<P>>(
  metodo: M,
  caminho: P,
  opcoes: Opcoes<Operacao<P, M>> = {},
): Promise<RespostaDe<Operacao<P, M>>> {
  const escrita = metodo !== 'get';
  try {
    const resultado = await chamar(metodo, caminho as string, opcoes as Opcoes<unknown>);
    if (escrita) marcarGravacao({ falhou: false });
    return resultado as RespostaDe<Operacao<P, M>>;
  } catch (e) {
    // Só escrita mexe no selo. Um GET que volta 200 diz que o servidor está
    // de pé, não que a alteração chegou lá (lição do DIME).
    if (escrita && !(e instanceof ErroApi && e.status === 401)) {
      marcarGravacao({ falhou: true, mensagem: e instanceof Error ? e.message : 'Erro ao gravar.' });
    }
    throw e;
  }
}

async function chamar(metodo: Metodo, caminho: string, opcoes: Opcoes<unknown>, tentativa = 0): Promise<unknown> {
  let token = opcoes.jwt;
  if (!token && !opcoes.publica) {
    let s = lerSessao();
    if (s && s.expiraEm - Date.now() / 1000 < 60) s = await renovar();
    if (!s) throw new ErroApi(401, 'Entre para continuar.');
    token = s.acesso;
  }

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opcoes.corpo !== undefined) headers['Content-Type'] = 'application/json';

  let r: Response;
  try {
    r = await fetch(`${BASE}${montarCaminho(caminho, opcoes.params as Record<string, string> | undefined)}`, {
      method: metodo.toUpperCase(),
      headers,
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
      cache: 'no-store',
    });
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor. Confira a internet e tente de novo.');
  }

  if (r.status === 401 && !opcoes.jwt && !opcoes.publica && tentativa === 0) {
    const s = await renovar();
    if (s) return chamar(metodo, caminho, opcoes, 1);
  }

  if (r.status === 204) return undefined;
  const texto = await r.text();
  let dados: unknown = undefined;
  try {
    dados = texto ? JSON.parse(texto) : undefined;
  } catch {
    throw new ErroApi(r.status, 'Resposta inesperada do servidor.');
  }
  if (!r.ok) {
    const d = (dados ?? {}) as { mensagem?: string; codigo?: string };
    throw new ErroApi(r.status, d.mensagem ?? 'Algo deu errado. Tente de novo.', d.codigo);
  }
  return dados;
}
