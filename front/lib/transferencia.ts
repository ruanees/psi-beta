// Transferir pacientes entre psicólogos (Configurações, só o titular). A
// regra é do banco (pacientes_transferir); aqui ficam as escolhas da tela.
import type { Dto } from './api.ts';

export type Psicologo = Dto<'PsicologoDto'>;

/** De quem pode sair: quem tem paciente, ativo ou que saiu. Quem saiu vem primeiro: é quem mais pede. */
export function quemEntrega(psicologos: readonly Psicologo[]): Psicologo[] {
  return psicologos.filter((p) => p.pacientes > 0).sort((a, b) => Number(a.ativo) - Number(b.ativo));
}

/** Para quem pode ir: psicólogo que ainda entra, e não o mesmo que entrega. */
export function quemRecebe(psicologos: readonly Psicologo[], de: string | null): Psicologo[] {
  return psicologos.filter((p) => p.ativo && p.membroId !== de);
}

export function rotuloDoPsicologo(p: Psicologo): string {
  const n = p.pacientes === 1 ? '1 paciente' : `${p.pacientes} pacientes`;
  return `${p.nome}${p.ativo ? '' : ' (saiu do consultório)'} · ${n}`;
}

/** O pedido vai sempre com a lista: nunca transfere paciente que a tela não mostrou. */
export function corpoDaTransferencia(de: string, para: string, escolhidos: readonly string[], motivo: string): Dto<'TransferirDto'> {
  const m = motivo.trim();
  return { de, para, pacientes: [...escolhidos], ...(m ? { motivo: m } : {}) };
}

export function frasePacientes(n: number): string {
  return n === 1 ? '1 paciente' : `${n} pacientes`;
}
