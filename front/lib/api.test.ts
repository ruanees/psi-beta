import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ErroApi, falhaDeGravacao } from './api.ts';

describe('selo de gravação', () => {
  it('aparece quando a alteração se perdeu', () => {
    assert.equal(falhaDeGravacao(new ErroApi(0, 'Sem conexão')), true);
    assert.equal(falhaDeGravacao(new ErroApi(503, 'Fora do ar')), true);
    assert.equal(falhaDeGravacao(new ErroApi(500, 'Erro')), true);
    assert.equal(falhaDeGravacao(new TypeError('fetch failed')), true);
  });

  it('não repete a recusa por regra que a própria tela já mostra', () => {
    for (const status of [400, 401, 403, 404, 409, 422]) assert.equal(falhaDeGravacao(new ErroApi(status, 'Recusa')), false, String(status));
  });
});
