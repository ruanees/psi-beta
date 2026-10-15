import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { MODALIDADES, STATUS_SESSAO, type Modalidade, type StatusSessao, PacienteDto } from '../pacientes/pacientes.dto';
import { SessaoAgendaDto } from '../agenda/agenda.dto';

// ------------------------------------------------------------ observação

export class VersaoObservacaoDto {
  @ApiProperty() versao: number;
  @ApiProperty() texto: string;
  @ApiProperty({ format: 'date-time' }) gravadaEm: string;
}

export class AdendoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() texto: string;
  @ApiProperty({ format: 'date-time' }) criadoEm: string;
}

export class ObservacaoDto {
  @ApiProperty({ description: 'Quem lê é o psicólogo do paciente. Se não for, os outros campos vêm vazios.' })
  podeClinico: boolean;
  @ApiProperty({ description: 'Sessão realizada ou com falta: aceita observação.' }) registravel: boolean;
  @ApiProperty({ description: 'Ainda dá para corrigir (30 dias depois da sessão). Depois, só adendo.' }) editavel: boolean;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) editavelAte: string | null;
  @ApiProperty({ type: String, nullable: true }) texto: string | null;
  @ApiProperty({ type: Number, nullable: true }) versao: number | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) alteradaEm: string | null;
  @ApiProperty({ type: VersaoObservacaoDto, isArray: true, description: 'Versões anteriores, da mais nova para a mais antiga.' })
  versoes: VersaoObservacaoDto[];
  @ApiProperty({ type: AdendoDto, isArray: true }) adendos: AdendoDto[];
}

export class TextoObservacaoDto {
  @ApiProperty({ maxLength: 20000 })
  @IsString()
  @MaxLength(20000, { message: 'Observação com até 20 mil caracteres.' })
  texto: string;
}

// ------------------------------------------------------------ histórico

export class ItemHistoricoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date-time' }) inicio: string;
  @ApiProperty({ format: 'date-time' }) fim: string;
  @ApiProperty({ enum: MODALIDADES, enumName: 'Modalidade' }) modalidade: Modalidade;
  @ApiProperty({ enum: STATUS_SESSAO, enumName: 'StatusSessao' }) status: StatusSessao;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) recorrenciaId: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Só para o psicólogo do paciente.' }) observacao: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) alteradaEm: string | null;
  @ApiProperty({ type: Number, nullable: true }) versao: number | null;
  @ApiProperty() adendos: number;
  @ApiProperty({ format: 'date-time' }) editavelAte: string;
}

export class PendenciaDto extends SessaoAgendaDto {
  @ApiProperty({ format: 'date-time', description: 'Depois disso, a observação só entra como adendo.' }) editavelAte: string;
}

// ------------------------------------------------------------ ficha

export class AdendoFichaDto {
  @ApiProperty() texto: string;
  @ApiProperty({ format: 'date-time' }) criadoEm: string;
}

export class SessaoFichaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date-time' }) inicio: string;
  @ApiProperty({ format: 'date-time' }) fim: string;
  @ApiProperty({ enum: MODALIDADES, enumName: 'Modalidade' }) modalidade: Modalidade;
  @ApiProperty({ enum: STATUS_SESSAO, enumName: 'StatusSessao' }) status: StatusSessao;
  @ApiProperty({ type: String, nullable: true }) observacao: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) alteradaEm: string | null;
  @ApiProperty({ type: AdendoFichaDto, isArray: true }) adendos: AdendoFichaDto[];
}

export class ProfissionalFichaDto {
  @ApiProperty() nome: string;
  @ApiProperty({ type: String, nullable: true }) crp: string | null;
}

export class FichaClinicaDto {
  @ApiProperty({ type: PacienteDto }) paciente: PacienteDto;
  @ApiProperty({ type: ProfissionalFichaDto, nullable: true }) profissional: ProfissionalFichaDto | null;
  @ApiProperty({ format: 'date-time' }) emitidaEm: string;
  @ApiProperty({ type: SessaoFichaDto, isArray: true, description: 'Da mais antiga para a mais recente.' }) sessoes: SessaoFichaDto[];
}

// ------------------------------------------------------------ acessos

export const ACOES_AUDITORIA = ['ler', 'criar', 'editar', 'arquivar', 'exportar', 'excluir'] as const;

export class AcessoDto {
  @ApiProperty({ format: 'date-time' }) em: string;
  @ApiProperty({ enum: ACOES_AUDITORIA, enumName: 'AcaoAuditoria' }) acao: (typeof ACOES_AUDITORIA)[number];
  @ApiProperty({ description: 'O que foi acessado: pacientes, observacoes, sessoes…' }) tabela: string;
  @ApiProperty({ description: 'Nome do profissional, ou "Membro da conta".' }) quem: string;
}
