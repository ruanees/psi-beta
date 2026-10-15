import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { CAMPOS_CONFIGURACOES, CAMPOS_PERFIL, paraApi, paraBanco } from '../src/contas/contas.service';

// Prova que prende o nome do campo dos dois lados. No DIME, `ok` no lugar de
// `done` e `papel` no lugar de `funcao` passaram calados: o mock respondia o
// que lhe mandavam. Aqui o lado do banco é lido da própria migration.

const PASTA = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readdirSync(PASTA)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(PASTA, f), 'utf8'))
  .join('\n');

function colunasDe(tabela: string): string[] {
  const m = new RegExp(`create table public\\.${tabela} \\(([\\s\\S]*?)\\n\\);`).exec(sql);
  assert.ok(m, `tabela ${tabela} não encontrada nas migrations`);
  return [...m[1].matchAll(/^\s+([a-z_]+)\s/gm)].map((c) => c[1]);
}

function chavesGravadas(funcao: string): string[] {
  const m = new RegExp(`create function public\\.${funcao}\\([\\s\\S]*?\\n\\$\\$;`).exec(sql);
  assert.ok(m, `função ${funcao} não encontrada`);
  return [...m[0].matchAll(/p \? '([a-z_]+)'/g)].map((c) => c[1]);
}

describe('nomes de campo: API x banco', () => {
  it('perfil: todo campo da API existe como coluna de profissionais', () => {
    const colunas = colunasDe('profissionais');
    for (const banco of Object.values(CAMPOS_PERFIL)) assert.ok(colunas.includes(banco), banco);
  });

  it('perfil: perfil_gravar aceita exatamente os campos que a API manda', () => {
    assert.deepEqual(chavesGravadas('perfil_gravar').sort(), Object.values(CAMPOS_PERFIL).sort());
  });

  it('configurações: coluna, gravação e API batem', () => {
    const colunas = colunasDe('configuracoes').filter((c) => c !== 'conta_id');
    assert.deepEqual(colunas.sort(), Object.values(CAMPOS_CONFIGURACOES).sort());
    assert.deepEqual(chavesGravadas('configuracoes_gravar').sort(), Object.values(CAMPOS_CONFIGURACOES).sort());
  });

  it('conta_ler devolve as chaves que o serviço lê', () => {
    for (const banco of [...Object.values(CAMPOS_PERFIL), ...Object.values(CAMPOS_CONFIGURACOES)]) {
      assert.match(sql, new RegExp(`'${banco}', (p|cf)\\.${banco}`), banco);
    }
  });
});

describe('gravação campo a campo', () => {
  it('undefined fica de fora, null atravessa para limpar', () => {
    assert.deepEqual(paraBanco({ crp: null, nome: undefined, epsiNumero: '123' }, CAMPOS_PERFIL), {
      crp: null,
      epsi_numero: '123',
    });
  });

  it('leitura preenche ausente com null', () => {
    assert.deepEqual(paraApi({ nome: 'Ana' }, CAMPOS_PERFIL), {
      nome: 'Ana',
      crp: null,
      epsiNumero: null,
      valorSessaoPadrao: null,
    });
  });
});
