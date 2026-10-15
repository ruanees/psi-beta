import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { traduzir } from '../src/comum/erro.filter';
import { ErroAuth, ErroBanco, ErroTransporte } from '../src/comum/erros';
import { executar } from '../src/supabase/supabase.service';

describe('erro do banco x erro de transporte', () => {
  it('promessa rejeitada é transporte', async () => {
    await assert.rejects(executar(Promise.reject(new TypeError('fetch failed'))), ErroTransporte);
  });

  it('erro sem code é transporte', async () => {
    await assert.rejects(
      executar(Promise.resolve({ data: null, error: { message: 'TypeError: fetch failed', code: '' } })),
      ErroTransporte,
    );
  });

  it('erro com code é do banco, com a chave levantada', async () => {
    await assert.rejects(
      executar(Promise.resolve({ data: null, error: { code: 'P0001', message: 'sem_acesso' } })),
      (e: unknown) => e instanceof ErroBanco && e.codigo === 'P0001' && e.chave === 'sem_acesso',
    );
  });

  it('transporte vira 503, nunca 4xx', () => {
    assert.equal(traduzir(new ErroTransporte()).status, 503);
    assert.equal(traduzir(new ErroAuth(502, undefined)).status, 503);
  });

  it('chave conhecida do banco vira frase pronta', () => {
    const r = traduzir(new ErroBanco('P0001', 'sem_acesso'));
    assert.equal(r.status, 403);
    assert.match(r.mensagem, /não tem acesso/);
  });

  it('erro desconhecido do banco não vaza a mensagem do Postgres', () => {
    const r = traduzir(new ErroBanco('XX000', 'relation "pacientes" does not exist'));
    assert.equal(r.status, 500);
    assert.doesNotMatch(r.mensagem, /relation/);
  });

  it('função ausente no banco aponta para a migration, não para erro genérico', () => {
    const r = traduzir(new ErroBanco('PGRST202', 'Could not find the function public.x'));
    assert.equal(r.status, 503);
    assert.match(r.mensagem, /migration/);
  });

  it('credencial errada é 401 com frase pronta', () => {
    const r = traduzir(new ErroAuth(400, 'invalid_credentials'));
    assert.equal(r.status, 401);
    assert.equal(r.mensagem, 'E-mail ou senha incorretos.');
  });
});
