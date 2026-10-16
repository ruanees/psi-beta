import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { NovoPacienteDto } from '../src/pacientes/pacientes.dto';
import { PacientesService } from '../src/pacientes/pacientes.service';
import { CAMPOS_ANAMNESE, anamneseDoBanco, anamneseParaBanco } from '../src/prontuario/anamnese';
import { AnamneseParcialDto } from '../src/prontuario/anamnese.dto';
import { ProntuarioService } from '../src/prontuario/prontuario.service';
import type { SupabaseService } from '../src/supabase/supabase.service';

// Anamnese: o nome de cada campo dos dois lados, lido da própria migration.

const PASTA = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readdirSync(PASTA)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(PASTA, f), 'utf8'))
  .join('\n');

function definicao(funcao: string): RegExpMatchArray {
  const todas = [...sql.matchAll(new RegExp(`create (?:or replace )?function public\\.${funcao}\\(([^)]*)\\)[\\s\\S]*?\\n\\$\\$;`, 'g'))];
  assert.ok(todas.length, `função ${funcao} não encontrada`);
  return todas[todas.length - 1];
}
const parametros = (f: string) => definicao(f)[1].split(',').map((p) => p.trim().split(/\s+/)[0]).filter(Boolean).sort();

describe('anamnese: API x banco', () => {
  it('todo campo da API é coluna da tabela, é gravado e é lido', () => {
    const tabela = /create table public\.anamneses \(([\s\S]*?)\n\);/.exec(sql)![1];
    const gravar = definicao('anamnese_gravar')[0];
    const ler = /create function privado\.anamnese_json[\s\S]*?\n\$\$;/.exec(sql)![0];
    for (const banco of Object.values(CAMPOS_ANAMNESE)) {
      assert.match(tabela, new RegExp(`^\\s+${banco}\\s`, 'm'), `coluna ${banco}`);
      assert.match(gravar, new RegExp(`d \\? '${banco}'`), `gravação de ${banco}`);
      assert.match(ler, new RegExp(`'${banco}', a\\.${banco}`), `leitura de ${banco}`);
    }
  });

  it('cada RPC recebe os parâmetros que a função declara', async () => {
    const chamadas: { funcao: string; args: string[] }[] = [];
    const falso = {
      rpc: async (_j: string, funcao: string, args: Record<string, unknown>) => {
        chamadas.push({ funcao, args: Object.keys(args).sort() });
        return funcao === 'anamnese_ler' ? { pode_clinico: true } : 'id';
      },
    } as unknown as SupabaseService;
    const s = new ProntuarioService(falso);
    await s.anamnese('t', 'c', 'p');
    await s.gravarAnamnese('t', 'c', 'p', { laudo: 'sim' });
    for (const { funcao, args } of chamadas) assert.deepEqual(args, parametros(funcao), funcao);
  });

  it('o cadastro leva a anamnese inicial até o paciente_criar', async () => {
    let enviado: Record<string, unknown> = {};
    const falso = {
      rpc: async (_j: string, _f: string, args: { p: Record<string, unknown> }) => {
        enviado = args.p;
        return 'id';
      },
    } as unknown as SupabaseService;
    await new PacientesService(falso).criar('t', 'c', {
      nome: 'Ana',
      consentimento: true,
      anamnese: { medicacao: 'sim', medicacoes: [{ nome: ' Sertralina ', dose: '50 mg', frequencia: '  ', prescritor: null }] },
    });
    assert.deepEqual(enviado.anamnese, { medicacao: 'sim', medicacoes: [{ nome: 'Sertralina', dose: '50 mg' }] });
    assert.match(definicao('paciente_criar')[0], /anamnese_gravar\(c, v_id, p -> 'anamnese'\)/);
  });
});

describe('anamnese: conversão e validação', () => {
  it('só os campos enviados vão ao banco; null atravessa para limpar', () => {
    assert.deepEqual(anamneseParaBanco({ rotina: null, laudoDescricao: 'TDAH' }), { laudo_descricao: 'TDAH', rotina: null });
  });

  it('sem anamnese, a leitura vem toda em null, com a lista vazia', () => {
    const a = anamneseDoBanco(null, false);
    assert.equal(a.podeClinico, false);
    assert.equal(a.laudo, null);
    assert.deepEqual(a.medicacoes, []);
    assert.equal(a.versao, null);
  });

  it('recusa resposta fora de sim, não ou não sabe, e medicamento sem nome', () => {
    const erros = (o: object) => validateSync(plainToInstance(AnamneseParcialDto, o)).length;
    assert.equal(erros({ laudo: 'sim', medicacao: 'nao_sabe' }), 0);
    assert.ok(erros({ laudo: 'talvez' }) > 0);
    assert.ok(erros({ medicacoes: [{ dose: '10 mg' }] }) > 0);
    const cadastro = plainToInstance(NovoPacienteDto, { nome: 'A', consentimento: true, anamnese: { laudo: 'x' } });
    assert.ok(validateSync(cadastro).length > 0, 'a validação entra na anamnese do cadastro');
  });
});
