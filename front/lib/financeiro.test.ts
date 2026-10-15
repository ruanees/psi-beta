import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { descricaoCobranca, limitesDoMes, nomeDoMes } from './financeiro.ts';

describe('financeiro', () => {
  it('limites do mês, inclusive fevereiro e dezembro', () => {
    assert.deepEqual(limitesDoMes('2026-10'), { de: '2026-10-01', ate: '2026-10-31' });
    assert.deepEqual(limitesDoMes('2028-02'), { de: '2028-02-01', ate: '2028-02-29' });
    assert.deepEqual(limitesDoMes('2026-12'), { de: '2026-12-01', ate: '2026-12-31' });
  });

  it('nome do mês', () => {
    assert.equal(nomeDoMes('2026-03'), 'março de 2026');
  });

  it('descrição de cada origem, com a data da sessão no fuso do consultório', () => {
    assert.equal(
      descricaoCobranca({ origem: 'sessao', sessaoInicio: '2026-10-15T01:30:00Z', pacoteQuantidade: null, referencia: null }),
      'Sessão de 14/10/26',
    );
    assert.equal(
      descricaoCobranca({ origem: 'pacote', sessaoInicio: null, pacoteQuantidade: 10, referencia: null }),
      'Pacote de 10 sessões',
    );
    assert.equal(
      descricaoCobranca({ origem: 'mensal', sessaoInicio: null, pacoteQuantidade: null, referencia: '2026-10-01' }),
      'Mensalidade de outubro de 2026',
    );
  });
});
