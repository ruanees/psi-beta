import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { duracao, fd, fdDe, moeda } from './formato.ts';

describe('formato', () => {
  it('fd escreve dd/mm/aa e não vira o dia no fuso', () => {
    assert.equal(fd('2026-09-19'), '19/09/26');
    assert.equal(fd('2026-01-01'), '01/01/26');
    assert.equal(fd(null), '—');
    assert.equal(fd('lixo'), '—');
  });

  it('fdDe aceita epoch em milissegundos', () => {
    assert.equal(fdDe(Date.UTC(2026, 8, 19, 15)), '19/09/26');
  });

  it('moeda em real, e nulo não vira zero', () => {
    assert.equal(moeda(180), 'R$ 180,00');
    assert.equal(moeda(1234.5), 'R$ 1.234,50');
    assert.equal(moeda(null), '—');
  });

  it('duracao', () => {
    assert.equal(duracao(50), '50 min');
    assert.equal(duracao(60), '1 h');
    assert.equal(duracao(90), '1 h 30 min');
  });
});
