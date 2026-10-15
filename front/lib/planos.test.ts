import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { moeda } from './formato.ts';
import { resumoPlano, valorPorSessao } from './planos.ts';

describe('planos', () => {
  it('valor por sessão do pacote, ao centavo', () => {
    assert.equal(valorPorSessao(520, 4), 130);
    assert.equal(valorPorSessao(500, 3), 166.67);
    assert.equal(valorPorSessao(null, 4), null);
    assert.equal(valorPorSessao(520, null), null);
  });

  it('pacote', () => {
    assert.equal(
      resumoPlano({ tipo: 'pacote', sessoes: 4, valor: 520 }, 150),
      `Pacote de 4 sessões · ${moeda(520)} (${moeda(130)} por sessão)`,
    );
  });

  it('mensal, com e sem número de sessões', () => {
    assert.equal(resumoPlano({ tipo: 'mensal', sessoes: null, valor: 560 }, null), `Mensal · ${moeda(560)} por mês`);
    assert.equal(resumoPlano({ tipo: 'mensal', sessoes: 4, valor: 560 }, null), `Mensal · ${moeda(560)} por mês · 4 sessões`);
  });

  it('avulsa usa o valor próprio, senão o padrão, e diz qual', () => {
    assert.equal(resumoPlano({ tipo: 'avulsa', sessoes: null, valor: 150 }, 180), `Avulsa · ${moeda(150)} por sessão`);
    assert.equal(
      resumoPlano({ tipo: 'avulsa', sessoes: null, valor: null }, 180),
      `Avulsa · ${moeda(180)} por sessão (padrão do consultório)`,
    );
    assert.equal(resumoPlano({ tipo: 'avulsa', sessoes: null, valor: null }, null), 'Avulsa · valor a definir');
  });
});
