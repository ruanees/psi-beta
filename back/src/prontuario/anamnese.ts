import { paraApi, paraBanco } from '../comum/campos';
import type { AnamneseDto, AnamneseParcialDto, MedicacaoDto } from './anamnese.dto';

// Nome do campo na API e no banco se cruzam só aqui. test/prontuario.test.ts
// confere este mapa contra a migration.
export const CAMPOS_ANAMNESE = {
  laudo: 'laudo',
  laudoDescricao: 'laudo_descricao',
  medicacao: 'medicacao',
  medicacoes: 'medicacoes',
  acompanhamentos: 'acompanhamentos',
  saudeGeral: 'saude_geral',
  tratamentosAnteriores: 'tratamentos_anteriores',
  historicoFamiliar: 'historico_familiar',
  substancias: 'substancias',
  sonoAlimentacao: 'sono_alimentacao',
  rotina: 'rotina',
  observacoes: 'observacoes',
} as const satisfies Record<keyof AnamneseParcialDto, string>;

/** Medicação vai sem campo vazio: o banco recusa chave fora das quatro e aceita ausência. */
function medicacaoParaBanco(m: MedicacaoDto): Record<string, string> {
  const saida: Record<string, string> = { nome: m.nome.trim() };
  for (const k of ['dose', 'frequencia', 'prescritor'] as const) {
    const v = m[k]?.trim();
    if (v) saida[k] = v;
  }
  return saida;
}

export function anamneseParaBanco(dto: AnamneseParcialDto): Record<string, unknown> {
  const d = paraBanco(dto, CAMPOS_ANAMNESE);
  if (dto.medicacoes) d.medicacoes = dto.medicacoes.map(medicacaoParaBanco);
  return d;
}

export function anamneseDoBanco(linha: Record<string, unknown> | null | undefined, podeClinico = true): AnamneseDto {
  const l = linha ?? {};
  const base = paraApi(l, CAMPOS_ANAMNESE) as Omit<AnamneseDto, 'podeClinico' | 'versao' | 'alteradaEm'>;
  const meds = Array.isArray(l.medicacoes) ? (l.medicacoes as Record<string, unknown>[]) : [];
  return {
    ...base,
    podeClinico,
    medicacoes: meds.map((m) => ({
      nome: String(m.nome ?? ''),
      dose: (m.dose as string | undefined) ?? null,
      frequencia: (m.frequencia as string | undefined) ?? null,
      prescritor: (m.prescritor as string | undefined) ?? null,
    })),
    versao: typeof l.versao === 'number' ? l.versao : null,
    alteradaEm: (l.alterada_em as string | undefined) ?? null,
  };
}
