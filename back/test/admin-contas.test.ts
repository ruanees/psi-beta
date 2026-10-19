import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ACOES, ERROS, sortearSenha, tratar, type Ambiente } from '../supabase/functions/admin-contas/logica';

// A função admin-contas sem rede: o fetch é trocado por respostas montadas.
// O que importa provar: nada acontece com a chave de serviço antes de o banco
// dizer que pode, com o token de quem pediu; e toda recusa tem uma chave só.

const URL_SB = 'https://projeto.supabase.co';
const ANON = 'sb_publishable_teste';
const SERVICO = 'sb_secret_teste';
const TOKEN = 'token.de.quem.pediu';
const ALVO = '00000000-0000-4000-8000-0000000000d1';

const PASTA = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readdirSync(PASTA)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(PASTA, f), 'utf8'))
  .join('\n');

interface Pedido {
  url: string;
  metodo: string;
  cabecalhos: Record<string, string>;
  corpo: unknown;
}
type Resposta = { status?: number; corpo?: unknown } | 'cai';

function montar(respostas: Record<string, Resposta>) {
  const pedidos: Pedido[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    pedidos.push({
      url: u,
      metodo: init?.method ?? 'GET',
      cabecalhos: (init?.headers ?? {}) as Record<string, string>,
      corpo: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = Object.entries(respostas).find(([k]) => u.endsWith(k))?.[1];
    if (!r) throw new Error(`sem resposta montada para ${u}`);
    if (r === 'cai') throw new TypeError('fetch failed');
    return new Response(r.corpo === undefined ? '' : JSON.stringify(r.corpo), { status: r.status ?? 200 });
  }) as typeof fetch;
  const amb: Ambiente = { url: URL_SB, anon: ANON, servico: SERVICO, fetch: f, sortear: () => 'Provisoria123' };
  return { amb, pedidos };
}

function pedido(corpo: unknown, opcoes: { metodo?: string; token?: string | null } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opcoes.token !== null) headers.Authorization = `Bearer ${opcoes.token ?? TOKEN}`;
  return new Request(`${URL_SB}/functions/v1/admin-contas`, {
    method: opcoes.metodo ?? 'POST',
    headers,
    body: opcoes.metodo === 'GET' ? undefined : JSON.stringify(corpo),
  });
}

async function ler(r: Response) {
  return { status: r.status, corpo: (await r.json()) as Record<string, unknown> };
}

const recusaDoBanco = (chave: string) => ({ status: 400, corpo: { code: 'P0001', message: chave } });

describe('admin-contas: porta', () => {
  it('só POST', async () => {
    const { amb } = montar({});
    assert.deepEqual(await ler(await tratar(pedido(null, { metodo: 'GET' }), amb)), { status: 405, corpo: { erro: 'metodo' } });
  });

  it('sem token é sem_acesso, sem configuração é 503', async () => {
    const { amb } = montar({});
    assert.deepEqual(await ler(await tratar(pedido({ acao: 'criar', email: 'a@b.co' }, { token: null }), amb)), {
      status: 401,
      corpo: { erro: 'sem_acesso' },
    });
    const r = await tratar(pedido({ acao: 'criar', email: 'a@b.co' }), { ...amb, servico: '' });
    assert.deepEqual(await ler(r), { status: 503, corpo: { erro: 'sem_configuracao' } });
  });

  it('campo estranho ou faltando é pedido_invalido, antes de qualquer chamada', async () => {
    const { amb, pedidos } = montar({});
    for (const corpo of [
      { acao: 'criar', email: 'a@b.co', alvo: ALVO },
      { acao: 'criar' },
      { acao: 'senha' },
      { acao: 'senha', id: 'não-é-uuid' },
      { acao: 'email', id: ALVO },
      { acao: 'apagar', id: ALVO, email: 'a@b.co' },
      { acao: 'promover', id: ALVO },
      'texto',
    ]) {
      assert.deepEqual(await ler(await tratar(pedido(corpo), amb)), { status: 400, corpo: { erro: 'pedido_invalido' } }, JSON.stringify(corpo));
    }
    assert.equal(pedidos.length, 0);
  });
});

describe('admin-contas: criar login', () => {
  it('quem não é super-admin não chega à chave de serviço', async () => {
    const { amb, pedidos } = montar({ '/rpc/plataforma_eu': { corpo: { super: false } } });
    assert.deepEqual(await ler(await tratar(pedido({ acao: 'criar', email: 'nova@ex.com' }), amb)), {
      status: 403,
      corpo: { erro: 'so_super' },
    });
    assert.deepEqual(pedidos.map((p) => p.url), [`${URL_SB}/rest/v1/rpc/plataforma_eu`]);
  });

  it('o banco é perguntado com o token de quem pediu; o GoTrue, com a chave de serviço', async () => {
    const { amb, pedidos } = montar({
      '/rpc/plataforma_eu': { corpo: { super: true } },
      '/admin/users': { corpo: { id: ALVO } },
    });
    const r = await ler(await tratar(pedido({ acao: 'criar', email: ' Nova@Ex.com ' }), amb));
    assert.deepEqual(r, { status: 200, corpo: { id: ALVO, senha: 'Provisoria123' } });
    const [banco, login] = pedidos;
    assert.equal(banco.cabecalhos.Authorization, `Bearer ${TOKEN}`);
    assert.equal(banco.cabecalhos.apikey, ANON);
    assert.equal(login.url, `${URL_SB}/auth/v1/admin/users`);
    assert.equal(login.cabecalhos.apikey, SERVICO);
    // Chave nova não é JWT: não vai no Authorization.
    assert.equal(login.cabecalhos.Authorization, undefined);
    assert.deepEqual(login.corpo, { email: 'nova@ex.com', password: 'Provisoria123', email_confirm: true });
  });

  it('chave de serviço antiga (JWT) vai também no Authorization', async () => {
    const { amb, pedidos } = montar({
      '/rpc/plataforma_eu': { corpo: { super: true } },
      '/admin/users': { corpo: { id: ALVO } },
    });
    await tratar(pedido({ acao: 'criar', email: 'nova@ex.com' }), { ...amb, servico: 'eyJservico' });
    assert.equal(pedidos[1].cabecalhos.Authorization, 'Bearer eyJservico');
  });

  it('e-mail que já tem login é email_em_uso', async () => {
    const { amb } = montar({
      '/rpc/plataforma_eu': { corpo: { super: true } },
      '/admin/users': { status: 422, corpo: { code: 422, error_code: 'email_exists', msg: 'already registered' } },
    });
    assert.deepEqual(await ler(await tratar(pedido({ acao: 'criar', email: 'ja@ex.com' }), amb)), {
      status: 409,
      corpo: { erro: 'email_em_uso' },
    });
  });
});

describe('admin-contas: mexer num login', () => {
  it('recusa do banco atravessa com a chave, e o GoTrue nem é chamado', async () => {
    for (const chave of ['proprio_login', 'login_super', 'login_com_consultorio', 'segundo_fator', 'so_super']) {
      const { amb, pedidos } = montar({ '/rpc/plataforma_login_conferir': recusaDoBanco(chave) });
      const r = await ler(await tratar(pedido({ acao: 'apagar', id: ALVO }), amb));
      assert.deepEqual(r, { status: ERROS[chave as keyof typeof ERROS], corpo: { erro: chave } });
      assert.equal(pedidos.length, 1);
    }
  });

  it('o banco recebe o alvo e a ação com os nomes da função', async () => {
    const { amb, pedidos } = montar({
      '/rpc/plataforma_login_conferir': { status: 200, corpo: null },
      [`/admin/users/${ALVO}`]: { corpo: {} },
    });
    await tratar(pedido({ acao: 'desativar', id: ALVO }), amb);
    assert.deepEqual(pedidos[0].corpo, { u: ALVO, acao: 'desativar' });
    const params = /create function public\.plataforma_login_conferir\(([^)]*)\)/.exec(sql)?.[1];
    assert.equal(params, 'u uuid, acao text');
    assert.deepEqual(pedidos[1], { ...pedidos[1], metodo: 'PUT', corpo: { ban_duration: '876000h' } });
  });

  it('cada ação vira o pedido certo ao GoTrue', async () => {
    const casos: [Record<string, string>, string, unknown, unknown][] = [
      [{ acao: 'senha', id: ALVO }, 'PUT', { password: 'Provisoria123' }, { senha: 'Provisoria123' }],
      [{ acao: 'email', id: ALVO, email: 'Novo@Ex.com' }, 'PUT', { email: 'novo@ex.com', email_confirm: true }, {}],
      [{ acao: 'reativar', id: ALVO }, 'PUT', { ban_duration: 'none' }, {}],
      [{ acao: 'apagar', id: ALVO }, 'DELETE', undefined, {}],
    ];
    for (const [corpo, metodo, enviado, devolvido] of casos) {
      const { amb, pedidos } = montar({
        '/rpc/plataforma_login_conferir': { status: 200, corpo: null },
        [`/admin/users/${ALVO}`]: { corpo: {} },
      });
      const r = await ler(await tratar(pedido(corpo), amb));
      assert.deepEqual(r, { status: 200, corpo: devolvido }, corpo.acao);
      assert.equal(pedidos[1].metodo, metodo, corpo.acao);
      assert.deepEqual(pedidos[1].corpo, enviado, corpo.acao);
    }
  });

  it('chave desconhecida do banco vira recusado; banco fora vira banco_indisponivel', async () => {
    let m = montar({ '/rpc/plataforma_login_conferir': recusaDoBanco('Algum texto do Postgres') });
    assert.deepEqual(await ler(await tratar(pedido({ acao: 'senha', id: ALVO }), m.amb)), { status: 502, corpo: { erro: 'recusado' } });
    m = montar({ '/rpc/plataforma_login_conferir': 'cai' });
    assert.deepEqual(await ler(await tratar(pedido({ acao: 'senha', id: ALVO }), m.amb)), {
      status: 503,
      corpo: { erro: 'banco_indisponivel' },
    });
    // Erro sem `code` não veio do banco: é transporte.
    m = montar({ '/rpc/plataforma_login_conferir': { status: 502, corpo: { message: 'bad gateway' } } });
    assert.equal((await ler(await tratar(pedido({ acao: 'senha', id: ALVO }), m.amb))).corpo.erro, 'banco_indisponivel');
    m = montar({ '/rpc/plataforma_login_conferir': { status: 401, corpo: { code: 'PGRST301', message: 'JWT expired' } } });
    assert.equal((await ler(await tratar(pedido({ acao: 'senha', id: ALVO }), m.amb))).corpo.erro, 'sem_acesso');
  });

  it('GoTrue fora é login_indisponivel', async () => {
    const { amb } = montar({
      '/rpc/plataforma_login_conferir': { status: 200, corpo: null },
      [`/admin/users/${ALVO}`]: { status: 500, corpo: { msg: 'erro' } },
    });
    assert.deepEqual(await ler(await tratar(pedido({ acao: 'reativar', id: ALVO }), amb)), {
      status: 503,
      corpo: { erro: 'login_indisponivel' },
    });
  });
});

describe('admin-contas: contrato', () => {
  it('toda chave que o banco levanta na conferência está em ERROS', () => {
    const corpo = /create function public\.plataforma_login_conferir[\s\S]*?\n\$\$;/.exec(sql)?.[0] ?? '';
    const chaves = [...corpo.matchAll(/raise exception '([a-z_]+)'/g)].map((c) => c[1]);
    assert.ok(chaves.length >= 4);
    for (const c of chaves.filter((c) => c !== 'acao_invalida')) assert.ok(c in ERROS, c);
  });

  it('as ações são as que a conferência do banco aceita, mais criar', () => {
    const lista = /acao not in \(([^)]*)\)/.exec(sql)?.[1] ?? '';
    const doBanco = [...lista.matchAll(/'([a-z]+)'/g)].map((c) => c[1]);
    assert.deepEqual([...doBanco, 'criar'].sort(), [...ACOES].sort());
  });

  it('senha sorteada passa na regra do projeto (10+, letras e números)', () => {
    for (let i = 0; i < 50; i++) {
      const s = sortearSenha();
      assert.match(s, /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z0-9]{14}$/);
    }
  });
});
