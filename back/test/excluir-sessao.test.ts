import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ESCOPOS_EXCLUSAO } from '../src/agenda/agenda.dto';
import { AgendaService } from '../src/agenda/agenda.service';
import { traduzirBanco, ErroBanco } from '../src/comum/erros';
import type { SalaService } from '../src/sala/sala.service';
import type { SupabaseService } from '../src/supabase/supabase.service';

const PASTA = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readdirSync(PASTA)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(PASTA, f), 'utf8'))
  .join('\n');

describe('excluir sessão: API x banco', () => {
  it('chama sessao_excluir com os parâmetros que a função declara', async () => {
    let chamada: { funcao: string; args: Record<string, unknown> } | undefined;
    const falso = {
      rpc: async (_j: string, funcao: string, args: Record<string, unknown>) => {
        chamada = { funcao, args };
        return { excluidas: 1, mantidas: 0 };
      },
    } as unknown as SupabaseService;
    const r = await new AgendaService(falso, {} as SalaService).excluir('t', 'c', 's');
    assert.deepEqual(r, { excluidas: 1, mantidas: 0 });
    assert.equal(chamada!.funcao, 'sessao_excluir');
    assert.deepEqual(chamada!.args, { c: 'c', s: 's', escopo: 'esta' });
    const m = /create function public\.sessao_excluir\(([^)]*)\)/.exec(sql)!;
    assert.deepEqual(m[1].split(',').map((p) => p.trim().split(/\s+/)[0]), ['c', 's', 'escopo']);
  });

  it('os escopos da API são os que o banco conhece', () => {
    const corpo = /create function public\.sessao_excluir[\s\S]*?\n\$\$;/.exec(sql)![0];
    for (const e of ESCOPOS_EXCLUSAO) assert.match(corpo, new RegExp(`escopo (=|<>) '${e}'`), e);
  });

  it('as recusas têm frase pronta, sem erro genérico', () => {
    for (const chave of ['excluir_com_observacao', 'excluir_com_pagamento']) {
      assert.match(sql, new RegExp(`'${chave}'`), `o banco levanta ${chave}`);
      assert.equal(traduzirBanco(new ErroBanco('P0001', chave)).status, 409, chave);
    }
  });
});
