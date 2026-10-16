import type { Dto } from './api.ts';

// Anamnese: rótulos e resumos usados no cadastro, na aba, no Resumo e na ficha impressa.

export type Resposta = Dto<'Resposta'>;
export type Medicacao = Dto<'MedicacaoDto'>;
export type Anamnese = Omit<Dto<'AnamneseDto'>, 'podeClinico' | 'versao' | 'alteradaEm'>;

export const RESPOSTA: Record<Resposta, string> = { sim: 'Sim', nao: 'Não', nao_sabe: 'Não sabe' };
export const RESPOSTAS = Object.keys(RESPOSTA) as Resposta[];

export type CampoTexto =
  | 'acompanhamentos'
  | 'saudeGeral'
  | 'tratamentosAnteriores'
  | 'historicoFamiliar'
  | 'substancias'
  | 'sonoAlimentacao'
  | 'rotina'
  | 'observacoes';

/** Os temas em texto livre, na ordem da tela, com a pergunta que orienta cada um. */
export const TEMAS: { campo: CampoTexto; rotulo: string; dica: string }[] = [
  { campo: 'acompanhamentos', rotulo: 'Acompanhamento com outros profissionais', dica: 'Psiquiatra, neurologista, fonoaudiólogo, terapeuta ocupacional…' },
  { campo: 'saudeGeral', rotulo: 'Saúde geral', dica: 'Doenças, internações, cirurgias, alergias.' },
  { campo: 'tratamentosAnteriores', rotulo: 'Psicoterapia e tratamentos anteriores', dica: 'Quando, por quanto tempo e como terminou.' },
  { campo: 'historicoFamiliar', rotulo: 'Histórico familiar', dica: 'Com quem mora, relações, casos de saúde mental na família.' },
  { campo: 'substancias', rotulo: 'Álcool, tabaco e outras substâncias', dica: 'O que usa, quanto e com que frequência.' },
  { campo: 'sonoAlimentacao', rotulo: 'Sono e alimentação', dica: 'Horários, qualidade do sono, apetite, mudanças recentes.' },
  { campo: 'rotina', rotulo: 'Escola, trabalho e rotina', dica: 'Ocupação, série escolar, atividades, lazer.' },
  { campo: 'observacoes', rotulo: 'Outras observações', dica: 'O que mais for relevante para o atendimento.' },
];

export const ANAMNESE_VAZIA: Anamnese = {
  laudo: null,
  laudoDescricao: null,
  medicacao: null,
  medicacoes: [],
  acompanhamentos: null,
  saudeGeral: null,
  tratamentosAnteriores: null,
  historicoFamiliar: null,
  substancias: null,
  sonoAlimentacao: null,
  rotina: null,
  observacoes: null,
};

/** "Metilfenidato 10 mg · de manhã · Dra. Lima" */
export function linhaMedicacao(m: Medicacao): string {
  return [[m.nome, m.dose].filter(Boolean).join(' '), m.frequencia, m.prescritor].filter((x) => x && x.trim()).join(' · ');
}

/** Para o Resumo: uma frase por item, ou null se ainda não foi respondido. */
export function resumoLaudo(a: Pick<Anamnese, 'laudo' | 'laudoDescricao'>): string | null {
  if (!a.laudo) return null;
  if (a.laudo === 'sim') return a.laudoDescricao?.trim() || 'Possui laudo (sem descrição).';
  return a.laudo === 'nao' ? 'Não possui laudo.' : 'Não sabe se possui laudo.';
}

export function resumoMedicacao(a: Pick<Anamnese, 'medicacao' | 'medicacoes'>): string[] | null {
  if (!a.medicacao) return null;
  if (a.medicacao === 'sim') return a.medicacoes.length ? a.medicacoes.map(linhaMedicacao) : ['Toma medicação (sem detalhes).'];
  return [a.medicacao === 'nao' ? 'Não toma medicação.' : 'Não sabe se toma medicação.'];
}

/**
 * O que vai ao servidor: textos aparados (vazio vira null), medicamentos sem
 * linha em branco. Laudo "não" apaga a descrição; medicação "não" apaga a lista.
 */
export function anamneseParaEnviar(a: Anamnese): Dto<'AnamneseParcialDto'> {
  const t = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  const medicacoes =
    a.medicacao === 'sim'
      ? a.medicacoes
          .filter((m) => m.nome.trim())
          .map((m) => ({ nome: m.nome.trim(), dose: t(m.dose), frequencia: t(m.frequencia), prescritor: t(m.prescritor) }))
      : [];
  const saida: Dto<'AnamneseParcialDto'> = {
    laudo: a.laudo,
    laudoDescricao: a.laudo === 'sim' ? t(a.laudoDescricao) : null,
    medicacao: a.medicacao,
    medicacoes,
  };
  for (const { campo } of TEMAS) saida[campo] = t(a[campo]);
  return saida;
}

/** Algo foi preenchido? O cadastro só manda a anamnese se sim. */
export function temConteudo(a: Anamnese): boolean {
  const e = anamneseParaEnviar(a);
  return Object.entries(e).some(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== null));
}
