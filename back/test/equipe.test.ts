import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { traduzir } from '../src/comum/erro.filter';
import { ErroBanco } from '../src/comum/erros';
import {
  CAMPOS_PACIENTE_DO_PSICOLOGO,
  CAMPOS_PSICOLOGO,
  CAMPOS_TRANSFERENCIA,
  CAMPOS_TRANSFERIR,
  EquipeService,
} from '../src/equipe/equipe.service';
import type { SupabaseService } from '../src/supabase/supabase.service';

// Transferir pacientes: o serviço contra o que a migration de verdade lê e
// monta. Nome de argumento ou de campo trocado passaria calado num mock.

const PASTA = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readdirSync(PASTA)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(PASTA, f), 'utf8'))
  .join('\n');

function corpo(funcao: string): string {
  const todas = [...sql.matchAll(new RegExp(`create (?:or replace )?function public\\.${funcao}\\([\\s\\S]*?\\n\\$\\$;`, 'g'))];
  assert.ok(todas.length, `função ${funcao} não encontrada`);
  return todas[todas.length - 1][0];
}

const parametros = (funcao: string) =>
  (/^create (?:or replace )?function [a-z_.]+\(([^)]*)\)/.exec(corpo(funcao))?.[1] ?? '')
    .split(',')
    .map((p) => p.trim().split(/\s+/)[0])
    .filter(Boolean)
    .sort();
const construidas = (texto: string) => new Set([...texto.matchAll(/'([a-z_]+)', /g)].map((c) => c[1]));
const lidas = (texto: string, v: string) =>
  [...new Set([...texto.matchAll(new RegExp(`${v} (?:->>|->|\\?) '([a-z_]+)'`, 'g'))].map((c) => c[1]))].sort();

describe('transferir pacientes: API x banco', () => {
  it('cada chamada do serviço existe no banco com os mesmos nomes de argumento', async () => {
    const chamadas: { nome: string; args: Record<string, unknown> }[] = [];
    const falso = {
      rpc: async (_jwt: string, nome: string, args: Record<string, unknown> = {}) => {
        chamadas.push({ nome, args });
        return nome === 'pacientes_transferir' ? 1 : [];
      },
    } as unknown as SupabaseService;
    const s = new EquipeService(falso);
    const id = '00000000-0000-4000-8000-000000000001';
    await s.psicologos('j', id);
    await s.pacientesDe('j', id, id);
    await s.transferencias('j', id);
    await s.transferir('j', id, { de: id, para: id, pacientes: [id], motivo: 'm' });
    assert.equal(chamadas.length, 4);
    for (const c of chamadas) assert.deepEqual(parametros(c.nome), Object.keys(c.args).sort(), c.nome);
  });

  it('cada campo da API sai da função, e a transferência lê exatamente o que a API manda', () => {
    const casos: [string, Record<string, string>][] = [
      ['equipe_psicologos', CAMPOS_PSICOLOGO],
      ['pacientes_do_psicologo', CAMPOS_PACIENTE_DO_PSICOLOGO],
      ['transferencias_listar', CAMPOS_TRANSFERENCIA],
    ];
    for (const [f, mapa] of casos) {
      const feitas = construidas(corpo(f));
      for (const banco of Object.values(mapa)) assert.ok(feitas.has(banco), `${f}: ${banco}`);
    }
    assert.deepEqual(lidas(corpo('pacientes_transferir'), 'd'), Object.values(CAMPOS_TRANSFERIR).sort());
  });

  it('nenhuma das funções devolve dado clínico', () => {
    for (const f of ['equipe_psicologos', 'pacientes_do_psicologo', 'transferencias_listar']) {
      assert.doesNotMatch(corpo(f), /queixa|observac|anamnes/, f);
    }
  });

  it('toda recusa da transferência tem frase pronta', () => {
    const texto = ['equipe_psicologos', 'pacientes_do_psicologo', 'transferencias_listar', 'pacientes_transferir']
      .map(corpo)
      .join('\n');
    const chaves = new Set([...texto.matchAll(/raise exception '([a-z_]+)'/g)].map((c) => c[1]));
    chaves.add('so_titular');
    for (const c of chaves) assert.notEqual(traduzir(new ErroBanco('P0001', c)).status, 500, `${c} sem frase`);
  });
});
