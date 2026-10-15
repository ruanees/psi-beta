import { BadRequestException, Injectable } from '@nestjs/common';
import { paraBanco } from '../comum/campos';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  BuscaPacientesDto,
  NovoPacienteDto,
  NovoResponsavelDto,
  PacienteDto,
  PacienteParcialDto,
  PacienteResumoDto,
  ResponsavelParcialDto,
  SessaoResumoDto,
  SituacaoPaciente,
} from './pacientes.dto';

// API ↔ banco. test/pacientes.test.ts prende os dois lados contra a migration.
export const CAMPOS_PACIENTE = {
  nome: 'nome',
  nascimento: 'nascimento',
  cpf: 'cpf',
  telefone: 'telefone',
  queixaPrincipal: 'queixa_principal',
  valorSessao: 'valor_sessao',
} as const satisfies Record<keyof PacienteParcialDto, string>;

export const CAMPOS_RESPONSAVEL = {
  nome: 'nome',
  parentesco: 'parentesco',
  telefone: 'telefone',
  cpf: 'cpf',
  financeiro: 'financeiro',
} as const satisfies Record<keyof ResponsavelParcialDto, string>;

interface PacienteBanco {
  id: string;
  nome: string;
  nascimento: string | null;
  cpf: string | null;
  telefone: string | null;
  queixa_principal: string | null;
  pode_clinico: boolean;
  valor_sessao: number | null;
  situacao: SituacaoPaciente;
  consentimento_em: string;
  criado_em: string;
  responsaveis: { id: string; nome: string; parentesco: string | null; telefone: string | null; cpf: string | null; financeiro: boolean }[];
  proxima_sessao: SessaoResumoDto | null;
  repeticao: { id: string; dia_semana: number; hora: string; duracao_min: number; modalidade: 'presencial' | 'online' } | null;
  contagem: { realizadas: number; faltas: number; canceladas: number };
}

@Injectable()
export class PacientesService {
  constructor(private readonly supabase: SupabaseService) {}

  async listar(jwt: string, conta: string, filtro: BuscaPacientesDto): Promise<PacienteResumoDto[]> {
    const linhas = await this.supabase.rpc<
      { id: string; nome: string; telefone: string | null; nascimento: string | null; situacao: SituacaoPaciente;
        responsavel: string | null; proxima_sessao: string | null; ultima_sessao: string | null }[]
    >(jwt, 'pacientes_listar', { c: conta, busca: filtro.busca ?? null, filtro_situacao: filtro.situacao ?? null });
    return linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      telefone: l.telefone,
      nascimento: l.nascimento,
      situacao: l.situacao,
      responsavel: l.responsavel,
      proximaSessao: l.proxima_sessao,
      ultimaSessao: l.ultima_sessao,
    }));
  }

  async criar(jwt: string, conta: string, dto: NovoPacienteDto): Promise<{ id: string }> {
    naoNoFuturo(dto.nascimento);
    const p = { ...paraBanco(dto, CAMPOS_PACIENTE), consentimento: dto.consentimento };
    const resps = (dto.responsaveis ?? []).map((r: NovoResponsavelDto) => paraBanco(r, CAMPOS_RESPONSAVEL));
    const id = await this.supabase.rpc<string>(jwt, 'paciente_criar', { c: conta, p, resps });
    return { id };
  }

  async ler(jwt: string, conta: string, paciente: string): Promise<PacienteDto> {
    const b = await this.supabase.rpc<PacienteBanco>(jwt, 'paciente_ler', { c: conta, p: paciente });
    return {
      id: b.id,
      nome: b.nome,
      nascimento: b.nascimento,
      cpf: b.cpf,
      telefone: b.telefone,
      queixaPrincipal: b.queixa_principal,
      podeClinico: b.pode_clinico,
      valorSessao: b.valor_sessao,
      situacao: b.situacao,
      consentimentoEm: b.consentimento_em,
      criadoEm: b.criado_em,
      responsaveis: b.responsaveis,
      proximaSessao: b.proxima_sessao,
      repeticao: b.repeticao && {
        id: b.repeticao.id,
        diaSemana: b.repeticao.dia_semana,
        hora: b.repeticao.hora,
        duracaoMin: b.repeticao.duracao_min,
        modalidade: b.repeticao.modalidade,
      },
      contagem: b.contagem,
    };
  }

  gravar(jwt: string, conta: string, paciente: string, dto: PacienteParcialDto): Promise<void> {
    naoNoFuturo(dto.nascimento ?? undefined);
    return this.supabase.rpc<void>(jwt, 'paciente_gravar', {
      c: conta,
      p: paciente,
      campos: paraBanco(dto, CAMPOS_PACIENTE),
    });
  }

  /** Só sem atendimento registrado; quem decide é o banco (guarda mínima do prontuário). */
  excluir(jwt: string, conta: string, paciente: string): Promise<void> {
    return this.supabase.rpc<void>(jwt, 'paciente_excluir', { c: conta, p: paciente });
  }

  situacao(jwt: string, conta: string, paciente: string, situacao: SituacaoPaciente): Promise<void> {
    return this.supabase.rpc<void>(jwt, 'paciente_situacao', { c: conta, p: paciente, nova: situacao });
  }

  async salvarResponsavel(
    jwt: string,
    conta: string,
    paciente: string,
    responsavel: string | null,
    dto: ResponsavelParcialDto,
  ): Promise<{ id: string }> {
    const id = await this.supabase.rpc<string>(jwt, 'responsavel_salvar', {
      c: conta,
      p: paciente,
      r: responsavel,
      dados: paraBanco(dto, CAMPOS_RESPONSAVEL),
    });
    return { id };
  }

  removerResponsavel(jwt: string, conta: string, paciente: string, responsavel: string): Promise<void> {
    return this.supabase.rpc<void>(jwt, 'responsavel_remover', { c: conta, p: paciente, r: responsavel });
  }
}

function naoNoFuturo(data: string | undefined): void {
  if (!data) return;
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  if (data > hoje) {
    throw new BadRequestException({ mensagem: 'A data de nascimento não pode estar no futuro.', codigo: 'validacao' });
  }
}
