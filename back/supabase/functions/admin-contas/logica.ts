// Função admin-contas: o único lugar que usa a chave de serviço do Supabase.
//
// Criar login, trocar senha ou e-mail de outra pessoa, desativar e apagar
// exigem a chave de serviço, que ignora toda a RLS. Ela não entra no Nest de
// nenhum dos dois repositórios nem em arquivo nenhum: o Supabase a entrega a
// esta função pelo ambiente. Quem chama é o back do senda-backoffice, sempre
// com o token de quem pediu, nunca com um token de servidor.
//
// Antes de agir, a função pergunta ao banco, com esse mesmo token, se a pessoa
// pode (plataforma_eu, plataforma_login_conferir). Quem decide é o banco; aqui
// não há regra de acesso escrita uma segunda vez.
//
// Este arquivo não importa nada e não toca em Deno: index.ts liga ao
// Deno.serve, e os testes (back/test/admin-contas.test.ts e o teste de
// contrato do senda-backoffice) chamam tratar() direto.
//
// Contrato, num formato só (lição do DIME: `{ok}` numa função e texto cru em
// outra viraram "[object Object]" na tela):
//   pedido   POST { acao, id?, email? }  com Authorization: Bearer <token de quem pediu>
//   sucesso  200  criar → { id, senha }   senha → { senha }   demais → {}
//   recusa   4xx/5xx { erro: '<chave>' }  — sempre uma chave de ERROS, nunca texto livre

export const ACOES = ['criar', 'senha', 'email', 'desativar', 'reativar', 'apagar'] as const;
export type Acao = (typeof ACOES)[number];

/** Toda chave que a função devolve, com o status HTTP. O backoffice tem a frase de cada uma. */
export const ERROS = {
  metodo: 405,
  sem_acesso: 401,
  pedido_invalido: 400,
  so_super: 403,
  segundo_fator: 403,
  proprio_login: 409,
  login_super: 409,
  login_com_consultorio: 409,
  login_inexistente: 404,
  email_em_uso: 409,
  sem_configuracao: 503,
  banco_indisponivel: 503,
  login_indisponivel: 503,
  recusado: 502,
} as const;
export type Erro = keyof typeof ERROS;

/** Chaves que o banco levanta e que atravessam como estão. Qualquer outra vira `recusado`. */
const DO_BANCO: readonly Erro[] = [
  'sem_acesso',
  'so_super',
  'segundo_fator',
  'proprio_login',
  'login_super',
  'login_com_consultorio',
  'login_inexistente',
];

export interface Ambiente {
  url?: string;
  /** Chave pública: vai com o token de quem pediu, para o banco decidir. */
  anon?: string;
  /** Chave de serviço: só depois que o banco disse que pode. */
  servico?: string;
  fetch?: typeof fetch;
  /** Para teste: senha provisória fixa. */
  sortear?: () => string;
}

// "Desativado" no GoTrue é banido por prazo; cem anos é para sempre na prática.
const BANIDO = '876000h';

// Sem `constructor(readonly erro)`: o Node lê este arquivo tirando só os tipos, e essa sintaxe não é só tipo.
class Recusa extends Error {
  readonly erro: Erro;
  constructor(erro: Erro) {
    super(erro);
    this.erro = erro;
  }
}

function responder(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function recusar(erro: Erro): Response {
  return responder(ERROS[erro], { erro });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Pedido {
  acao: Acao;
  id?: string;
  email?: string;
}

function lerPedido(corpo: unknown): Pedido | null {
  if (!corpo || typeof corpo !== 'object') return null;
  const c = corpo as Record<string, unknown>;
  // Campo que não existe não dá erro, chega undefined (lição do DIME: `corpo.alvo` contra `{id}`).
  // Aqui campo estranho é recusa.
  if (Object.keys(c).some((k) => !['acao', 'id', 'email'].includes(k))) return null;
  if (typeof c.acao !== 'string' || !(ACOES as readonly string[]).includes(c.acao)) return null;
  const acao = c.acao as Acao;
  const email = typeof c.email === 'string' ? c.email.trim().toLowerCase() : undefined;
  const id = typeof c.id === 'string' ? c.id : undefined;
  if (acao === 'criar') return email && EMAIL.test(email) && id === undefined ? { acao, email } : null;
  if (!id || !UUID.test(id)) return null;
  if (acao === 'email') return email && EMAIL.test(email) ? { acao, id, email } : null;
  return c.email === undefined ? { acao, id } : null;
}

/** 14 caracteres, com minúscula, maiúscula e número: passa na regra "letters_digits" de 10+. */
export function sortearSenha(): string {
  const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const numeros = '23456789';
  const todos = letras + numeros;
  const n = new Uint32Array(14);
  crypto.getRandomValues(n);
  const s = Array.from(n, (v) => todos[v % todos.length]);
  s[0] = letras[n[0] % 24]; // minúscula
  s[1] = letras[24 + (n[1] % 24)]; // maiúscula
  s[2] = numeros[n[2] % numeros.length];
  return s.join('');
}

/** A chave nova (sb_…) não é JWT: vai só no apikey. A antiga (JWT) vai nos dois. */
function cabecalhos(chave: string, token?: string): Record<string, string> {
  const autorizacao = token ?? (chave.startsWith('eyJ') ? chave : undefined);
  return {
    apikey: chave,
    'Content-Type': 'application/json',
    ...(autorizacao ? { Authorization: `Bearer ${autorizacao}` } : {}),
  };
}

async function rpc(amb: Required<Ambiente>, token: string, nome: string, args: object): Promise<unknown> {
  let r: Response;
  try {
    r = await amb.fetch(`${amb.url}/rest/v1/rpc/${nome}`, {
      method: 'POST',
      headers: cabecalhos(amb.anon, token),
      body: JSON.stringify(args),
    });
  } catch {
    throw new Recusa('banco_indisponivel');
  }
  const texto = await r.text();
  let dados: unknown = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    throw new Recusa('banco_indisponivel');
  }
  if (r.ok) return dados;
  // Token inválido ou vencido: o PostgREST recusa antes de chegar à função.
  if (r.status === 401) throw new Recusa('sem_acesso');
  const d = (dados ?? {}) as { code?: unknown; message?: unknown };
  if (typeof d.code !== 'string') throw new Recusa('banco_indisponivel');
  const chave = typeof d.message === 'string' ? d.message : '';
  throw new Recusa((DO_BANCO as readonly string[]).includes(chave) ? (chave as Erro) : 'recusado');
}

async function admin(amb: Required<Ambiente>, metodo: string, caminho: string, corpo?: object): Promise<unknown> {
  let r: Response;
  try {
    r = await amb.fetch(`${amb.url}/auth/v1/admin/users${caminho}`, {
      method: metodo,
      headers: cabecalhos(amb.servico),
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new Recusa('login_indisponivel');
  }
  const texto = await r.text();
  let dados: unknown = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    throw new Recusa('login_indisponivel');
  }
  if (r.ok) return dados;
  if (r.status >= 500) throw new Recusa('login_indisponivel');
  const d = (dados ?? {}) as { error_code?: unknown; code?: unknown };
  const codigo = typeof d.error_code === 'string' ? d.error_code : typeof d.code === 'string' ? d.code : '';
  if (codigo === 'email_exists' || codigo === 'user_already_exists') throw new Recusa('email_em_uso');
  if (r.status === 404 || codigo === 'user_not_found') throw new Recusa('login_inexistente');
  throw new Recusa('recusado');
}

export async function tratar(req: Request, ambiente: Ambiente): Promise<Response> {
  if (req.method !== 'POST') return recusar('metodo');
  const amb: Required<Ambiente> = {
    url: (ambiente.url ?? '').replace(/\/$/, ''),
    anon: ambiente.anon ?? '',
    servico: ambiente.servico ?? '',
    fetch: ambiente.fetch ?? fetch,
    sortear: ambiente.sortear ?? sortearSenha,
  };
  if (!amb.url || !amb.anon || !amb.servico) return recusar('sem_configuracao');

  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1];
  if (!token) return recusar('sem_acesso');

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return recusar('pedido_invalido');
  }
  const p = lerPedido(corpo);
  if (!p) return recusar('pedido_invalido');

  try {
    if (p.acao === 'criar') {
      const eu = (await rpc(amb, token, 'plataforma_eu', {})) as { super?: unknown } | null;
      if (eu?.super !== true) return recusar('so_super');
      const senha = amb.sortear();
      const u = (await admin(amb, 'POST', '', { email: p.email, password: senha, email_confirm: true })) as {
        id?: unknown;
      } | null;
      if (typeof u?.id !== 'string') return recusar('recusado');
      return responder(200, { id: u.id, senha });
    }

    await rpc(amb, token, 'plataforma_login_conferir', { u: p.id, acao: p.acao });
    const caminho = `/${encodeURIComponent(p.id ?? '')}`;
    switch (p.acao) {
      case 'senha': {
        const senha = amb.sortear();
        await admin(amb, 'PUT', caminho, { password: senha });
        return responder(200, { senha });
      }
      case 'email':
        await admin(amb, 'PUT', caminho, { email: p.email, email_confirm: true });
        return responder(200, {});
      case 'desativar':
        await admin(amb, 'PUT', caminho, { ban_duration: BANIDO });
        return responder(200, {});
      case 'reativar':
        await admin(amb, 'PUT', caminho, { ban_duration: 'none' });
        return responder(200, {});
      case 'apagar':
        await admin(amb, 'DELETE', caminho);
        return responder(200, {});
    }
  } catch (e) {
    if (e instanceof Recusa) return recusar(e.erro);
    return recusar('recusado');
  }
}
