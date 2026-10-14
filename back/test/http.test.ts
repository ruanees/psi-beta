import { strict as assert } from 'node:assert';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { SignJWT } from 'jose';

// Sobe a aplicação de verdade, apontada para um Supabase que não existe
// (porta fechada). Prova que rota nasce fechada e que banco fora é 503.

const URL_SUPABASE = 'http://127.0.0.1:9';
const SEGREDO = 'segredo-de-teste-com-pelo-menos-32-caracteres';
process.env.SUPABASE_URL = URL_SUPABASE;
process.env.SUPABASE_ANON_KEY = 'anon-de-teste';
process.env.SUPABASE_JWT_SECRET = SEGREDO;
process.env.ORIGENS = 'http://localhost:3000';
process.env.FRONT_URL = 'http://localhost:3000';

// Abrir uma rota é decisão: entrar nesta lista exige mudar este teste.
const PUBLICAS = new Set(['/saude', '/openapi.json', '/sessao/entrar', '/sessao/renovar', '/sessao/recuperar']);

let app: INestApplication;
let base: string;

function token(opcoes: { emissor?: string; expira?: string; sub?: string } = {}) {
  return new SignJWT({ role: 'authenticated', aal: 'aal1', email: 'ana@teste.psi' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(opcoes.sub ?? '00000000-0000-0000-0000-00000000000a')
    .setIssuer(opcoes.emissor ?? `${URL_SUPABASE}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(opcoes.expira ?? '1h')
    .sign(new TextEncoder().encode(SEGREDO));
}

async function pedir(caminho: string, init: RequestInit & { jwt?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.jwt) headers.Authorization = `Bearer ${init.jwt}`;
  const r = await fetch(`${base}${caminho}`, { ...init, headers });
  const texto = await r.text();
  return { status: r.status, corpo: texto ? JSON.parse(texto) : null, headers: r.headers };
}

before(async () => {
  console.log = () => undefined;
  console.error = () => undefined;
  const { criarApp } = await import('../src/criar-app');
  app = await criarApp();
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});

after(() => app.close());

describe('rota nasce fechada', () => {
  it('toda rota do contrato fora da lista de públicas pede sessão', async () => {
    const { corpo: doc } = await pedir('/openapi.json');
    const caminhos = Object.entries(doc.paths as Record<string, Record<string, unknown>>);
    assert.ok(caminhos.length > 5);
    for (const [caminho, metodos] of caminhos) {
      const concreto = caminho.replace(/\{[^}]+\}/g, '00000000-0000-4000-8000-000000000000');
      for (const metodo of Object.keys(metodos)) {
        const r = await pedir(concreto, { method: metodo.toUpperCase(), body: metodo === 'get' ? undefined : '{}' });
        if (PUBLICAS.has(caminho)) assert.notEqual(r.status, 401, `${metodo} ${caminho} deveria ser pública`);
        else assert.equal(r.status, 401, `${metodo} ${caminho} está aberta sem estar na lista`);
      }
    }
  });

  it('sem sessão a frase é pronta', async () => {
    const r = await pedir('/contas');
    assert.deepEqual(r.corpo, { mensagem: 'Entre para continuar.' });
  });

  it('token de outro emissor, expirado ou adulterado é 401', async () => {
    for (const jwt of [
      await token({ emissor: 'https://outro.supabase.co/auth/v1' }),
      await token({ expira: '-1m' }),
      `${await token()}x`,
    ]) {
      assert.equal((await pedir('/contas', { jwt })).status, 401);
    }
  });
});

describe('banco fora do ar', () => {
  it('rota de dado responde 503, não 4xx', async () => {
    const r = await pedir('/contas', { jwt: await token() });
    assert.equal(r.status, 503);
    assert.match(r.corpo.mensagem, /Sem conexão/);
  });

  it('login responde 503, não "senha incorreta"', async () => {
    const r = await pedir('/sessao/entrar', {
      method: 'POST',
      body: JSON.stringify({ email: 'ana@teste.psi', senha: 'qualquer' }),
    });
    assert.equal(r.status, 503);
  });

  it('configuração ausente é 503 com o nome do que falta', async () => {
    const guardada = process.env.SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    try {
      const r = await pedir('/sessao/entrar', {
        method: 'POST',
        body: JSON.stringify({ email: 'ana@teste.psi', senha: 'x' }),
      });
      assert.equal(r.status, 503);
      assert.equal(r.corpo.codigo, 'SUPABASE_URL');
    } finally {
      process.env.SUPABASE_URL = guardada;
    }
  });
});

describe('contrato e cabeçalhos', () => {
  it('/saude diz a origem e nunca o valor', async () => {
    const r = await pedir('/saude');
    assert.equal(r.status, 200);
    assert.equal(r.corpo.supabase, true);
    assert.equal(r.corpo.config.SUPABASE_JWT_SECRET, 'process');
    assert.doesNotMatch(JSON.stringify(r.corpo), new RegExp(SEGREDO));
  });

  it('validação responde em português', async () => {
    const r = await pedir('/sessao/entrar', { method: 'POST', body: JSON.stringify({ email: 'x', senha: 'y' }) });
    assert.equal(r.status, 400);
    assert.equal(r.corpo.mensagem, 'Informe um e-mail válido.');
  });

  it('campo que o DTO não declara é recusado', async () => {
    const r = await pedir('/sessao/entrar', {
      method: 'POST',
      body: JSON.stringify({ email: 'ana@teste.psi', senha: 'y', admin: true }),
    });
    assert.equal(r.status, 400);
    assert.equal(r.corpo.mensagem, 'Campo não aceito: admin.');
  });

  it('nenhuma resposta fica em cache', async () => {
    const r = await pedir('/saude');
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });

  it('id que não é UUID é 404 antes de ir ao banco', async () => {
    const r = await pedir('/contas/abc', { jwt: await token() });
    assert.equal(r.status, 404);
  });
});
