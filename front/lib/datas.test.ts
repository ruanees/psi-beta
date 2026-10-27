import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  diaDaSemana,
  frequencia,
  idade,
  inicioDaSemana,
  instante,
  partes,
  repeticaoPorExtenso,
  rotuloDaSemana,
  somarDias,
} from './datas.ts';

describe('datas no fuso do consultório', () => {
  it('17h UTC é 14h em São Paulo, no mesmo dia', () => {
    assert.deepEqual(partes('2026-10-18T17:00:00Z'), { dia: '2026-10-18', minutos: 14 * 60, hora: '14:00' });
  });

  it('1h UTC ainda é o dia anterior em São Paulo', () => {
    assert.equal(partes('2026-10-19T01:30:00Z').dia, '2026-10-18');
  });

  it('semana começa no domingo', () => {
    assert.equal(diaDaSemana('2026-10-18'), 0);
    assert.equal(inicioDaSemana('2026-10-21'), '2026-10-18');
    assert.equal(inicioDaSemana('2026-10-18'), '2026-10-18');
  });

  it('somar dias atravessa mês e ano', () => {
    assert.equal(somarDias('2026-10-30', 3), '2026-11-02');
    assert.equal(somarDias('2026-12-31', 1), '2027-01-01');
  });

  it('instante leva o deslocamento do consultório', () => {
    assert.equal(instante('2026-10-20', '14:00'), '2026-10-20T14:00:00-03:00');
    assert.equal(partes(instante('2026-10-20', '14:00')).hora, '14:00');
  });

  it('rótulo da semana em um ou dois meses', () => {
    assert.equal(rotuloDaSemana('2026-10-18'), '18 – 24 de outubro de 2026');
    assert.equal(rotuloDaSemana('2026-10-25'), '25 – 31 de outubro de 2026');
    assert.equal(rotuloDaSemana('2026-11-29'), '29 de novembro – 5 de dezembro de 2026');
  });

  it('idade em anos completos', () => {
    assert.equal(idade(null), null);
    assert.ok((idade('2000-01-01') ?? 0) >= 26);
  });

  it('repetição semanal e quinzenal por extenso', () => {
    assert.equal(frequencia(1), 'toda semana');
    assert.equal(frequencia(null), 'toda semana');
    assert.equal(frequencia(2), 'a cada 15 dias');
    assert.equal(repeticaoPorExtenso(2, 1), 'Toda terça');
    assert.equal(repeticaoPorExtenso(6, 1), 'Todo sábado');
    assert.equal(repeticaoPorExtenso(0, null), 'Todo domingo');
    assert.equal(repeticaoPorExtenso(4, 2), 'Quinta, a cada 15 dias');
  });
});
