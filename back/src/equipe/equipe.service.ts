import { Injectable } from '@nestjs/common';
import { paraApi, paraBanco } from '../comum/campos';
import { SupabaseService } from '../supabase/supabase.service';
import type { PacienteDoPsicologoDto, PsicologoDto, TransferenciaDto, TransferirDto } from './equipe.dto';

// O nome no banco e o nome na API se cruzam só aqui; test/equipe.test.ts
// confere os dois lados contra a migration.
type Mapa<T> = Record<keyof T, string>;
type Linha = Record<string, unknown>;

export const CAMPOS_PSICOLOGO = {
  membroId: 'membro_id',
  nome: 'nome',
  ativo: 'ativo',
  pacientes: 'pacientes',
} as const satisfies Mapa<PsicologoDto>;

export const CAMPOS_PACIENTE_DO_PSICOLOGO = {
  id: 'id',
  nome: 'nome',
  situacao: 'situacao',
  proximaSessao: 'proxima_sessao',
} as const satisfies Mapa<PacienteDoPsicologoDto>;

export const CAMPOS_TRANSFERENCIA = {
  id: 'id',
  pacienteId: 'paciente_id',
  paciente: 'paciente',
  de: 'de',
  para: 'para',
  motivo: 'motivo',
  quem: 'quem',
  em: 'em',
} as const satisfies Mapa<TransferenciaDto>;

/** O que pacientes_transferir lê de `d`. */
export const CAMPOS_TRANSFERIR = {
  de: 'de',
  para: 'para',
  pacientes: 'pacientes',
  motivo: 'motivo',
} as const satisfies Mapa<Required<TransferirDto>>;

@Injectable()
export class EquipeService {
  constructor(private readonly supabase: SupabaseService) {}

  async psicologos(jwt: string, conta: string): Promise<PsicologoDto[]> {
    return (await this.supabase.rpc<Linha[]>(jwt, 'equipe_psicologos', { c: conta })).map(
      (l) => paraApi(l, CAMPOS_PSICOLOGO) as unknown as PsicologoDto,
    );
  }

  async pacientesDe(jwt: string, conta: string, membro: string): Promise<PacienteDoPsicologoDto[]> {
    return (await this.supabase.rpc<Linha[]>(jwt, 'pacientes_do_psicologo', { c: conta, m: membro })).map(
      (l) => paraApi(l, CAMPOS_PACIENTE_DO_PSICOLOGO) as unknown as PacienteDoPsicologoDto,
    );
  }

  async transferencias(jwt: string, conta: string): Promise<TransferenciaDto[]> {
    return (await this.supabase.rpc<Linha[]>(jwt, 'transferencias_listar', { c: conta })).map(
      (l) => paraApi(l, CAMPOS_TRANSFERENCIA) as unknown as TransferenciaDto,
    );
  }

  transferir(jwt: string, conta: string, dto: TransferirDto): Promise<number> {
    return this.supabase.rpc<number>(jwt, 'pacientes_transferir', { c: conta, d: paraBanco(dto, CAMPOS_TRANSFERIR) });
  }
}
