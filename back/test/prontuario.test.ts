import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ProntuarioService } from '../src/prontuario/prontuario.service';
import type { SupabaseService } from '../src/supabase/supabase.service';

// O serviço chama cada RPC com os nomes de parâmetro que a função do banco
// declara. Nome errado só aparece em produção (PGRST202), então a prova é aqui.

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

function servicoQueAnota() {
  const chamadas: { funcao: string; args: string[] }[] = [];
  const falso = {
    rpc: async (_jwt: string, funcao: string, args: Record<string, unknown>) => {
      chamadas.push({ funcao, args: Object.keys(args).sort() });
      if (funcao === 'ficha_clinica') return { sessoes: [], contagem: {}, responsaveis: [] };
      if (funcao === 'observacao_ler') return { pode_clinico: false };
      return [];
    },
  } as unknown as SupabaseService;
  return { s: new ProntuarioService(falso), chamadas };
}

describe('prontuário: API x banco', () => {
  it('cada RPC recebe exatamente os parâmetros que a função declara', async () => {
    const { s, chamadas } = servicoQueAnota();
    const c = '00000000-0000-0000-0000-000000000001';
    await s.observacao('t', c, c);
    await s.gravarObservacao('t', c, c, 'x');
    await s.adendo('t', c, c, 'x');
    await s.historico('t', c, c);
    await s.pendencias('t', c);
    await s.ficha('t', c, c);
    await s.acessos('t', c, c);
    assert.equal(chamadas.length, 7);
    for (const { funcao, args } of chamadas) assert.deepEqual(args, parametros(funcao), funcao);
  });

  it('quem não é o psicólogo do paciente recebe a observação vazia, sem erro', async () => {
    const { s } = servicoQueAnota();
    const o = await s.observacao('t', 'c', 's');
    assert.equal(o.podeClinico, false);
    assert.equal(o.texto, null);
    assert.deepEqual(o.versoes, []);
  });
});
