import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  ConfiguracoesDto,
  ConfiguracoesParciaisDto,
  ContaDto,
  ContaResumoDto,
  PerfilParcialDto,
  Papel,
} from './contas.dto';

// O nome do campo no banco e o nome no contrato da API se cruzam só aqui.
// Campo portado se confere contra o que está gravado (lição do DIME):
// test/contas.test.ts prende os dois lados desta tabela.
export const CAMPOS_PERFIL = {
  nome: 'nome',
  crp: 'crp',
  epsiNumero: 'epsi_numero',
  valorSessaoPadrao: 'valor_sessao_padrao',
} as const satisfies Record<keyof PerfilParcialDto, string>;

export const CAMPOS_CONFIGURACOES = {
  faltaConsomePacote: 'falta_consome_pacote',
  faltaCobraAvulsa: 'falta_cobra_avulsa',
  avisoMinimoHoras: 'aviso_minimo_horas',
  inatividadeMinutos: 'inatividade_minutos',
} as const satisfies Record<keyof ConfiguracoesDto, string>;

interface ContaBanco {
  id: string;
  nome: string;
  papeis: Papel[];
  perfil: Record<string, unknown> | null;
  configuracoes: Record<string, unknown>;
}

@Injectable()
export class ContasService {
  constructor(private readonly supabase: SupabaseService) {}

  listar(jwt: string): Promise<ContaResumoDto[]> {
    return this.supabase.rpc<ContaResumoDto[]>(jwt, 'minhas_contas');
  }

  async ler(jwt: string, conta: string): Promise<ContaDto> {
    const c = await this.supabase.rpc<ContaBanco>(jwt, 'conta_ler', { c: conta });
    return {
      id: c.id,
      nome: c.nome,
      papeis: c.papeis,
      perfil: c.perfil && (paraApi(c.perfil, CAMPOS_PERFIL) as unknown as ContaDto['perfil']),
      configuracoes: paraApi(c.configuracoes, CAMPOS_CONFIGURACOES) as unknown as ConfiguracoesDto,
    };
  }

  gravarPerfil(jwt: string, conta: string, dto: PerfilParcialDto): Promise<void> {
    return this.supabase.rpc<void>(jwt, 'perfil_gravar', { c: conta, p: paraBanco(dto, CAMPOS_PERFIL) });
  }

  gravarConfiguracoes(jwt: string, conta: string, dto: ConfiguracoesParciaisDto): Promise<void> {
    return this.supabase.rpc<void>(jwt, 'configuracoes_gravar', {
      c: conta,
      p: paraBanco(dto, CAMPOS_CONFIGURACOES),
    });
  }
}

/** Só as chaves presentes atravessam — `undefined` fica de fora, `null` vai. */
export function paraBanco(dto: object, mapa: Record<string, string>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [api, banco] of Object.entries(mapa)) {
    const v = (dto as Record<string, unknown>)[api];
    if (v !== undefined) saida[banco] = v;
  }
  return saida;
}

export function paraApi(linha: Record<string, unknown>, mapa: Record<string, string>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [api, banco] of Object.entries(mapa)) saida[api] = linha[banco] ?? null;
  return saida;
}
