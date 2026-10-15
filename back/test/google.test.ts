import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ErroBanco } from '../src/comum/erros';
import { b64urlDeTexto, cifrar, decifrar, sha256 } from '../src/google/cifra';
import { ESCOPOS, GoogleService, emailDoIdToken } from '../src/google/google.service';
import { SalaService } from '../src/sala/sala.service';
import type { SupabaseService } from '../src/supabase/supabase.service';

// Conexão com o Google sem rede: o fetch é trocado por respostas montadas.
// O que importa provar: o token sai cifrado, o `state` não serve a outro
// usuário, e falha do Google nunca derruba a sala.

const CHAVE = Buffer.alloc(32, 7).toString('base64');
const USUARIO = '00000000-0000-0000-0000-00000000000a';
const CONTA = '00000000-0000-0000-0000-0000000000c1';
const PACIENTE = '00000000-0000-0000-0000-0000000000f1';

const PASTA = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readdirSync(PASTA)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(PASTA, f), 'utf8'))
  .join('\n');
function parametros(funcao: string): string[] {
  const todas = [...sql.matchAll(new RegExp(`create (?:or replace )?function public\\.${funcao}\\(([^)]*)\\)`, 'g'))];
  assert.ok(todas.length, `função ${funcao} não encontrada`);
  return todas[todas.length - 1][1].split(',').map((p) => p.trim().split(/\s+/)[0]).filter(Boolean).sort();
}

const fetchOriginal = globalThis.fetch;
type Resposta = { status?: number; corpo: unknown };
let pedidos: { url: string; corpo: string }[] = [];
function trocarFetch(respostas: Record<string, Resposta>) {
  pedidos = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    pedidos.push({ url: u, corpo: String(init?.body ?? '') });
    const r = Object.entries(respostas).find(([k]) => u.startsWith(k))?.[1];
    if (!r) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200 });
  }) as typeof fetch;
}

function banco(respostas: Record<string, unknown> = {}) {
  const chamadas: { funcao: string; args: Record<string, unknown> }[] = [];
  const falso = {
    rpc: async (_jwt: string, funcao: string, args: Record<string, unknown>) => {
      chamadas.push({ funcao, args });
      const r = respostas[funcao];
      return typeof r === 'function' ? (r as () => unknown)() : r;
    },
  } as unknown as SupabaseService;
  return { falso, chamadas };
}

const idToken = (email: string) => `x.${b64urlDeTexto(JSON.stringify({ email }))}.y`;
const ehChave = (chave: string) => (e: unknown) => e instanceof ErroBanco && e.chave === chave;

describe('google: cifra', () => {
  it('cifra e decifra; o mesmo texto nunca sai igual', async () => {
    const a = await cifrar('1//refresh-token', CHAVE);
    const b = await cifrar('1//refresh-token', CHAVE);
    assert.notEqual(a, b);
    assert.ok(!a.includes('refresh'));
    assert.equal(await decifrar(a, CHAVE), '1//refresh-token');
  });

  it('chave errada ou texto alterado não abre', async () => {
    const a = await cifrar('segredo', CHAVE);
    await assert.rejects(decifrar(a, Buffer.alloc(32, 8).toString('base64')));
    const [v, iv, c] = a.split('.');
    await assert.rejects(decifrar(`${v}.${iv}.${c.slice(0, -2)}AA`, CHAVE));
  });
});

describe('google: conexão', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'cliente.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'segredo-do-cliente';
    process.env.GOOGLE_CHAVE = CHAVE;
    process.env.FRONT_URL = 'https://senda.teste';
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CHAVE;
  });

  it('sem os segredos fica desligada e não sai para a rede', async () => {
    delete process.env.GOOGLE_CHAVE;
    const { falso, chamadas } = banco();
    const g = new GoogleService(falso);
    assert.equal(g.disponivel(), false);
    await assert.rejects(g.urlConectar(USUARIO, CONTA), ehChave('google_indisponivel'));
    assert.equal(await g.criarMeet('t', CONTA, PACIENTE), null);
    assert.equal(chamadas.length, 0);
  });

  it('a URL pede só criar sala do Meet e o e-mail, com refresh token e PKCE', async () => {
    const g = new GoogleService(banco().falso);
    const url = new URL(await g.urlConectar(USUARIO, CONTA));
    const q = url.searchParams;
    assert.equal(url.origin, 'https://accounts.google.com');
    assert.deepEqual(q.get('scope')!.split(' '), ESCOPOS);
    assert.ok(!/record|transcri|calendar|drive/i.test(q.get('scope')!));
    assert.equal(q.get('redirect_uri'), 'https://senda.teste/google/retorno');
    assert.equal(q.get('access_type'), 'offline');
    assert.equal(q.get('prompt'), 'consent');
    assert.equal(q.get('code_challenge_method'), 'S256');
    assert.match(q.get('code_challenge')!, /^[A-Za-z0-9_-]{43}$/);
  });

  it('o state só volta para o mesmo usuário, na mesma conta, em 10 minutos', async () => {
    const g = new GoogleService(banco().falso);
    const agora = Date.now();
    const estado = new URL(await g.urlConectar(USUARIO, CONTA, agora)).searchParams.get('state')!;
    assert.ok(await g.conferirEstado(estado, USUARIO, CONTA, agora));
    await assert.rejects(g.conferirEstado(estado, '00000000-0000-0000-0000-00000000000b', CONTA, agora), ehChave('google_estado_invalido'));
    await assert.rejects(g.conferirEstado(estado, USUARIO, '00000000-0000-0000-0000-0000000000c2', agora), ehChave('google_estado_invalido'));
    await assert.rejects(g.conferirEstado(estado, USUARIO, CONTA, agora + 11 * 60_000), ehChave('google_estado_invalido'));
    const [corpo, assinatura] = estado.split('.');
    const forjado = b64urlDeTexto(JSON.stringify({ u: '00000000-0000-0000-0000-00000000000b', c: CONTA, n: 'x', e: agora + 60_000 }));
    await assert.rejects(g.conferirEstado(`${forjado}.${assinatura}`, '00000000-0000-0000-0000-00000000000b', CONTA, agora));
    await assert.rejects(g.conferirEstado(`${corpo}.xx`, USUARIO, CONTA, agora));
  });

  it('o retorno troca o código com o verificador do PKCE e guarda o token cifrado', async () => {
    const { falso, chamadas } = banco();
    const g = new GoogleService(falso);
    const url = new URL(await g.urlConectar(USUARIO, CONTA));
    trocarFetch({
      'https://oauth2.googleapis.com/token': {
        corpo: { access_token: 'a', refresh_token: '1//rt', id_token: idToken('ana@gmail.com'), scope: ESCOPOS.slice(2).concat('openid', 'https://www.googleapis.com/auth/userinfo.email').join(' ') },
      },
    });
    await g.concluir('jwt', USUARIO, CONTA, 'codigo-do-google', url.searchParams.get('state')!);
    const enviado = new URLSearchParams(pedidos[0].corpo);
    assert.equal(enviado.get('code'), 'codigo-do-google');
    assert.equal(await sha256(enviado.get('code_verifier')!), url.searchParams.get('code_challenge'));
    const gravou = chamadas.find((c) => c.funcao === 'google_gravar')!;
    assert.equal(gravou.args.email, 'ana@gmail.com');
    assert.notEqual(gravou.args.token, '1//rt');
    assert.equal(await decifrar(String(gravou.args.token), CHAVE), '1//rt');
  });

  it('sem a permissão do Meet marcada, não conecta', async () => {
    const { falso, chamadas } = banco();
    const g = new GoogleService(falso);
    const estado = new URL(await g.urlConectar(USUARIO, CONTA)).searchParams.get('state')!;
    trocarFetch({ 'https://oauth2.googleapis.com/token': { corpo: { refresh_token: '1//rt', scope: 'openid email' } } });
    await assert.rejects(g.concluir('jwt', USUARIO, CONTA, 'c', estado), ehChave('google_sem_permissao'));
    assert.equal(chamadas.length, 0);
  });

  it('cria a sala do Meet do paciente e grava', async () => {
    const cifrado = await cifrar('1//rt', CHAVE);
    const { falso, chamadas } = banco({ google_token: cifrado });
    trocarFetch({
      'https://oauth2.googleapis.com/token': { corpo: { access_token: 'acesso' } },
      'https://meet.googleapis.com/v2/spaces': { corpo: { name: 'spaces/Abc1', meetingUri: 'https://meet.google.com/abc-defg-hij' } },
    });
    assert.equal(await new GoogleService(falso).criarMeet('jwt', CONTA, PACIENTE), 'https://meet.google.com/abc-defg-hij');
    assert.equal(new URLSearchParams(pedidos[0].corpo).get('refresh_token'), '1//rt');
    assert.deepEqual(chamadas.at(-1), {
      funcao: 'sala_meet_gravar',
      args: { c: CONTA, p: PACIENTE, link: 'https://meet.google.com/abc-defg-hij', espaco: 'spaces/Abc1' },
    });
  });

  it('token recusado pelo Google: marca para reconectar', async () => {
    const { falso, chamadas } = banco({ google_token: await cifrar('1//rt', CHAVE) });
    trocarFetch({ 'https://oauth2.googleapis.com/token': { status: 400, corpo: { error: 'invalid_grant' } } });
    await assert.rejects(new GoogleService(falso).criarMeet('jwt', CONTA, PACIENTE), ehChave('google_reconectar'));
    assert.ok(chamadas.some((c) => c.funcao === 'google_falhou'));
  });

  it('Google fora do ar: a janela da sessão abre com aviso, sem erro', async () => {
    const sala = { link: null, link_sessao: null, link_meet: null, link_perfil: null, token: 't', epsi_ok: true, paciente_id: PACIENTE, modalidade: 'online', google: 'conectada' };
    const { falso } = banco({ sala_sessao: sala, google_token: await cifrar('1//rt', CHAVE) });
    trocarFetch({});
    const s = new SalaService(falso, new GoogleService(falso));
    const r = await s.daSessao('jwt', CONTA, 'sessao');
    assert.equal(r.link, null);
    assert.match(r.avisoMeet ?? '', /Não foi possível gerar o link do Meet/);
    await assert.doesNotReject(s.prepararMeet('jwt', CONTA, 'sessao'));
  });

  it('desconectar revoga no Google, e falhar a revogação não impede', async () => {
    const { falso } = banco({ google_remover: await cifrar('1//rt', CHAVE) });
    trocarFetch({ 'https://oauth2.googleapis.com/revoke': { corpo: {} } });
    await new GoogleService(falso).desconectar('jwt', CONTA);
    assert.equal(new URLSearchParams(pedidos[0].corpo).get('token'), '1//rt');
    trocarFetch({});
    await assert.doesNotReject(new GoogleService(falso).desconectar('jwt', CONTA));
  });

  it('cada RPC do Google recebe os parâmetros que a função declara', async () => {
    const { falso, chamadas } = banco({
      google_status: { conectada: false },
      google_token: await cifrar('1//rt', CHAVE),
      google_remover: null,
    });
    const g = new GoogleService(falso);
    await g.status('jwt', CONTA);
    await g.desconectar('jwt', CONTA);
    trocarFetch({ 'https://oauth2.googleapis.com/token': { status: 400, corpo: { error: 'invalid_grant' } } });
    await g.criarMeet('jwt', CONTA, PACIENTE).catch(() => undefined);
    trocarFetch({
      'https://oauth2.googleapis.com/token': { corpo: { access_token: 'a' } },
      'https://meet.googleapis.com/v2/spaces': { corpo: { name: 'spaces/A', meetingUri: 'https://meet.google.com/a' } },
    });
    await g.criarMeet('jwt', CONTA, PACIENTE);
    const estado = new URL(await g.urlConectar(USUARIO, CONTA)).searchParams.get('state')!;
    trocarFetch({ 'https://oauth2.googleapis.com/token': { corpo: { refresh_token: 'r', scope: ESCOPOS.join(' ') } } });
    await g.concluir('jwt', USUARIO, CONTA, 'c', estado);
    const vistas = new Set(chamadas.map((c) => c.funcao));
    for (const f of ['google_status', 'google_remover', 'google_token', 'google_falhou', 'sala_meet_gravar', 'google_gravar']) {
      assert.ok(vistas.has(f), f);
    }
    for (const { funcao, args } of chamadas) assert.deepEqual(Object.keys(args).sort(), parametros(funcao), funcao);
  });

  it('lê o e-mail do id_token', () => {
    assert.equal(emailDoIdToken(idToken('ana@gmail.com')), 'ana@gmail.com');
    assert.equal(emailDoIdToken('lixo'), null);
    assert.equal(emailDoIdToken(undefined), null);
  });
});
