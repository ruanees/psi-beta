import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { emailDoToken, lerTroca, urlDeTroca } from './contexto.ts';

describe('troca de contexto', () => {
  it('o token vai no fragmento, nunca na query: fragmento não chega ao servidor nem ao log', () => {
    const url = urlDeTroca('https://senda-backoffice.exemplo.dev/', 'abc/def+=');
    assert.equal(url, 'https://senda-backoffice.exemplo.dev/#entrar=abc%2Fdef%2B%3D');
    assert.equal(new URL(url).search, '');
  });

  it('quem recebe lê o mesmo token que saiu', () => {
    const url = new URL(urlDeTroca('https://x.dev', 'abc/def+='));
    assert.equal(lerTroca(url.hash), 'abc/def+=');
    assert.equal(lerTroca(''), null);
    assert.equal(lerTroca('#access_token=x&type=recovery'), null);
  });

  it('o e-mail para "continuar como" sai do token; token estranho não quebra', () => {
    const corpo = Buffer.from(JSON.stringify({ email: 'ana@exemplo.com', sub: '1' })).toString('base64url');
    assert.equal(emailDoToken(`cabeca.${corpo}.assinatura`), 'ana@exemplo.com');
    assert.equal(emailDoToken('lixo'), null);
  });
});
