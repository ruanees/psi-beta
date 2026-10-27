import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { AgendaService } from '../src/agenda/agenda.service';
import { traduzirBanco, ErroBanco } from '../src/comum/erros';
import { SalaController } from '../src/sala/sala.controller';
import { LINK_SALA } from '../src/sala/sala.dto';
import { GoogleService } from '../src/google/google.service';
import { SalaService } from '../src/sala/sala.service';
import type { SupabaseService } from '../src/supabase/supabase.service';

// Sala online: nomes de parâmetro e de chave dos dois lados, e a porta pública.

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
const parametros = (f: string) =>
  definicao(f)[1].split(',').map((p) => p.trim().split(/\s+/)[0]).filter(Boolean).sort();

function servico(respostas: Record<string, unknown>) {
  const chamadas: { funcao: string; args: string[]; publica: boolean }[] = [];
  const anota = (publica: boolean) => async (...a: unknown[]) => {
    const [funcao, args] = (publica ? a : a.slice(1)) as [string, Record<string, unknown>];
    chamadas.push({ funcao, args: Object.keys(args).sort(), publica });
    return respostas[funcao];
  };
  const falso = { rpc: anota(false), rpcPublica: anota(true) } as unknown as SupabaseService;
  return { falso, chamadas };
}

describe('sala online: API x banco', () => {
  it('cada RPC recebe exatamente os parâmetros que a função declara', async () => {
    const { falso, chamadas } = servico({
      sala_sessao: { link: null, link_sessao: null, link_meet: null, link_perfil: null, token: 'x', epsi_ok: true, paciente_id: 'p', modalidade: 'online', google: 'desconectada' },
      sala_publica: { profissional: 'Ana', situacao: 'sem_sessao' },
      painel_inicio: { hoje: [], sessoes_semana: 0, pacientes_ativos: 0, sem_proxima: [] },
      proxima_online: null,
    });
    const s = new SalaService(falso, new GoogleService(falso));
    const c = '00000000-0000-0000-0000-000000000001';
    await s.daSessao('t', c, c);
    await s.gravarLink('t', c, c, null);
    await s.renovar('t', c, c);
    await s.publica('a'.repeat(64));
    await new AgendaService(falso, s).painel('t', c);
    for (const { funcao, args } of chamadas) assert.deepEqual(args, parametros(funcao), funcao);
    assert.deepEqual(chamadas.filter((x) => x.publica).map((x) => x.funcao), ['sala_publica'], 'só a sala é sem login');
  });

  it('o serviço lê as chaves que as funções devolvem', () => {
    for (const chave of ['link', 'link_sessao', 'link_meet', 'link_perfil', 'token', 'paciente_id', 'modalidade', 'google']) {
      assert.match(definicao('sala_sessao')[0], new RegExp(`'${chave}'`), chave);
    }
    for (const chave of ['profissional', 'situacao', 'inicio', 'fim', 'abre_em', 'link']) {
      assert.match(definicao('sala_publica')[0], new RegExp(`'${chave}'`), chave);
    }
    for (const chave of ['id', 'paciente_id', 'paciente_nome', 'inicio', 'fim', 'modalidade', 'status', 'recorrencia_id', 'link']) {
      assert.match(definicao('proxima_online')[0], new RegExp(`'${chave}'`), chave);
    }
  });

  it('só sala_publica é aberta ao papel anon', () => {
    const abertas = [...sql.matchAll(/grant execute on function ([\s\S]*?) to ([^;]*);/g)]
      .filter((g) => /\banon\b/.test(g[2]))
      .flatMap((g) => g[1].split(/,\s*(?=public\.)/).map((f) => f.trim().replace(/\(.*$/s, '')));
    assert.deepEqual(abertas, ['public.sala_publica']);
  });

  it('a porta pública recusa token fora do formato sem ir ao banco', async () => {
    const { falso, chamadas } = servico({});
    const ctrl = new SalaController(new SalaService(falso, new GoogleService(falso)));
    assert.throws(() => ctrl.publica('abc'), (e: unknown) => e instanceof ErroBanco && e.chave === 'sala_nao_encontrada');
    assert.throws(() => ctrl.publica('G'.repeat(64)));
    assert.equal(chamadas.length, 0);
    assert.equal(traduzirBanco(new ErroBanco('P0001', 'sala_nao_encontrada')).status, 404);
  });

  it('o filtro de link aceita os links de chamada e recusa o resto', () => {
    for (const ok of ['https://meet.google.com/abc-defg-hij', 'https://us02web.zoom.us/j/123?pwd=x', 'https://meet.jit.si/sala'])
      assert.match(ok, LINK_SALA, ok);
    for (const ruim of ['http://meet.google.com/abc', 'javascript:alert(1)', 'https://a b', 'meet.google.com/abc', 'https://"x"'])
      assert.doesNotMatch(ruim, LINK_SALA, ruim);
  });
});
