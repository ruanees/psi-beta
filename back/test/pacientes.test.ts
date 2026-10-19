import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { CAMPOS_PACIENTE, CAMPOS_RESPONSAVEL } from '../src/pacientes/pacientes.service';

// Os nomes que o serviço manda ao banco, conferidos contra o que as funções
// da migration leem. Campo com nome plausível e errado passa calado no mock.

const PASTA = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readdirSync(PASTA)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(PASTA, f), 'utf8'))
  .join('\n');

/** A definição em vigor: a última, contando as que uma migration posterior troca (`create or replace`). */
function corpo(funcao: string): string {
  const todas = [...sql.matchAll(new RegExp(`create (?:or replace )?function public\\.${funcao}\\([\\s\\S]*?\\n\\$\\$;`, 'g'))];
  assert.ok(todas.length, `função ${funcao} não encontrada`);
  return todas[todas.length - 1][0];
}

function chaves(texto: string, variavel: string, operador: '?' | '->>'): string[] {
  const re = operador === '?' ? new RegExp(`${variavel} \\? '([a-z_]+)'`, 'g') : new RegExp(`${variavel} ->> '([a-z_]+)'`, 'g');
  return [...new Set([...texto.matchAll(re)].map((x) => x[1]))].sort();
}

describe('pacientes: API x banco', () => {
  it('paciente_gravar aceita exatamente os campos que a API manda', () => {
    assert.deepEqual(chaves(corpo('paciente_gravar'), 'campos', '?'), Object.values(CAMPOS_PACIENTE).sort());
  });

  it('paciente_criar lê todos os campos do paciente, mais o consentimento e o psicólogo', () => {
    assert.deepEqual(
      chaves(corpo('paciente_criar'), 'p', '->>'),
      [...Object.values(CAMPOS_PACIENTE), 'consentimento', 'profissional_id'].sort(),
    );
  });

  it('responsáveis: criar e salvar leem os mesmos nomes que a API manda', () => {
    const esperado = Object.values(CAMPOS_RESPONSAVEL).sort();
    assert.deepEqual(chaves(corpo('paciente_criar'), 'r', '->>'), esperado);
    assert.deepEqual(chaves(corpo('responsavel_salvar'), 'dados', '?'), esperado);
  });

  it('sessao_criar lê o que o serviço da agenda manda', () => {
    assert.deepEqual(chaves(corpo('sessao_criar'), 'd', '->>'), ['duracao_min', 'inicio', 'modalidade', 'paciente_id', 'repetir_semanal']);
  });

  it('paciente_criar repassa o plano para paciente_plano', () => {
    assert.match(corpo('paciente_criar'), /paciente_plano\(c, v_id, p -> 'plano'\)/);
  });

  it('paciente_plano lê o que o serviço manda', () => {
    assert.deepEqual(chaves(corpo('paciente_plano'), 'd', '->>'), ['plano', 'sessoes', 'valor']);
  });

  it('pacientes_listar não devolve a queixa principal (lista não é dado clínico)', () => {
    assert.doesNotMatch(corpo('pacientes_listar'), /queixa/);
  });
});
