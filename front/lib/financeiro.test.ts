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

describe('recibo e planilha', () => {
  it('descrição do serviço para uma, várias sessões, pacote e mensalidade', async () => {
    const { descricaoRecibo } = await import('./financeiro.ts');
    const s = (iso: string) => ({ origem: 'sessao' as const, sessaoInicio: iso, pacoteQuantidade: null, referencia: null });
    assert.equal(descricaoRecibo([s('2026-10-14T13:00:00Z')]), 'Sessão de psicoterapia em 14/10/26');
    assert.equal(
      descricaoRecibo([s('2026-10-21T13:00:00Z'), s('2026-10-07T13:00:00Z'), s('2026-10-14T13:00:00Z')]),
      'Sessões de psicoterapia em 07/10/26, 14/10/26 e 21/10/26',
    );
    assert.equal(
      descricaoRecibo([{ origem: 'pacote', sessaoInicio: null, pacoteQuantidade: 4, referencia: null }]),
      'Pacote de 4 sessões de psicoterapia',
    );
    assert.equal(
      descricaoRecibo([{ origem: 'mensal', sessaoInicio: null, pacoteQuantidade: null, referencia: '2026-10-01' }]),
      'Psicoterapia, mensalidade de outubro de 2026',
    );
  });

  it('csv com ponto e vírgula, vírgula decimal e aspas quando precisa', async () => {
    const { csv } = await import('./financeiro.ts');
    assert.equal(csv([['Mês', 'Recebido'], ['out; 2026', 1234.5]]), '﻿Mês;Recebido\r\n"out; 2026";1234,50');
  });
});
