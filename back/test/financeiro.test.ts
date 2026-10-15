import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { FinanceiroService } from '../src/financeiro/financeiro.service';
import type { SupabaseService } from '../src/supabase/supabase.service';

// O serviço chama cada RPC com os nomes de parâmetro que a função do banco declara.

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

const RESPOSTAS: Record<string, unknown> = {
  painel_financeiro: { a_receber: '10.50', vencidas: 1, valor_vencido: 0, recebido_mes: 0, pacotes_acabando: [] },
  sessao_financeiro: { pacote: null, cobranca: null },
  pacote_criar: 'id',
};

function servicoQueAnota() {
  const chamadas: { funcao: string; args: string[] }[] = [];
  const falso = {
    rpc: async (_jwt: string, funcao: string, args: Record<string, unknown>) => {
      chamadas.push({ funcao, args: Object.keys(args).sort() });
      return RESPOSTAS[funcao] ?? [];
    },
  } as unknown as SupabaseService;
  return { s: new FinanceiroService(falso), chamadas };
}

describe('financeiro: API x banco', () => {
  it('cada RPC recebe exatamente os parâmetros que a função declara', async () => {
    const { s, chamadas } = servicoQueAnota();
    const c = '00000000-0000-0000-0000-000000000001';
    await s.painel('t', c);
    await s.cobrancas('t', c, { situacao: 'pendente' });
    await s.pagar('t', c, c, 'pix');
    await s.desfazer('t', c, c, 'm');
    await s.cancelar('t', c, c, 'm');
    await s.valor('t', c, c, 1);
    await s.pacotes('t', c, c);
    await s.novoPacote('t', c, c, {});
    await s.daSessao('t', c, c);
    assert.equal(chamadas.length, 9);
    for (const { funcao, args } of chamadas) assert.deepEqual(args, parametros(funcao), funcao);
  });

  it('o filtro vai com os nomes que cobrancas_listar lê', () => {
    const corpo = /create function public\.cobrancas_listar[\s\S]*?\n\$\$;/.exec(sql)![0];
    const lidas = [...new Set([...corpo.matchAll(/filtro ->> '([a-z_]+)'/g)].map((m) => m[1]))].sort();
    assert.deepEqual(lidas, ['ate', 'de', 'paciente_id', 'situacao']);
  });

  it('dinheiro sai como número, mesmo se o banco mandar texto', async () => {
    const { s } = servicoQueAnota();
    assert.equal((await s.painel('t', 'c')).aReceber, 10.5);
  });
});
