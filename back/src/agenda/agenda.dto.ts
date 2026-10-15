import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { MODALIDADES, STATUS_SESSAO, type Modalidade, type StatusSessao } from '../pacientes/pacientes.dto';

export class SessaoAgendaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) pacienteId: string;
  @ApiProperty() pacienteNome: string;
  @ApiProperty({ format: 'date-time' }) inicio: string;
  @ApiProperty({ format: 'date-time' }) fim: string;
  @ApiProperty({ enum: MODALIDADES, enumName: 'Modalidade' }) modalidade: Modalidade;
  @ApiProperty({ enum: STATUS_SESSAO, enumName: 'StatusSessao' }) status: StatusSessao;
  @ApiProperty({ type: String, nullable: true, format: 'uuid', description: 'Preenchido quando a sessão se repete toda semana.' })
  recorrenciaId: string | null;
}

export class SessaoDoPacienteDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date-time' }) inicio: string;
  @ApiProperty({ format: 'date-time' }) fim: string;
  @ApiProperty({ enum: MODALIDADES, enumName: 'Modalidade' }) modalidade: Modalidade;
  @ApiProperty({ enum: STATUS_SESSAO, enumName: 'StatusSessao' }) status: StatusSessao;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) recorrenciaId: string | null;
}

export class PacienteSemProximaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() nome: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) ultimaSessao: string | null;
}

export class PainelDto {
  @ApiProperty({ type: SessaoAgendaDto, isArray: true, description: 'Sessões de hoje, menos as desmarcadas.' })
  hoje: SessaoAgendaDto[];
  @ApiProperty() sessoesSemana: number;
  @ApiProperty() pacientesAtivos: number;
  @ApiProperty({ type: PacienteSemProximaDto, isArray: true }) semProxima: PacienteSemProximaDto[];
}

export class PeriodoDto {
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({}, { message: 'Início do período inválido.' })
  de: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({}, { message: 'Fim do período inválido.' })
  ate: string;
}

export class NovaSessaoDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Escolha o paciente.' })
  pacienteId: string;

  @ApiProperty({ format: 'date-time', description: 'Com fuso: 2026-10-20T14:00:00-03:00.' })
  @IsISO8601({ strict: true }, { message: 'Data e hora inválidas.' })
  inicio: string;

  @ApiProperty({ minimum: 10, maximum: 480, example: 50 })
  @IsInt()
  @Min(10, { message: 'A sessão dura ao menos 10 minutos.' })
  @Max(480, { message: 'A sessão dura no máximo 8 horas.' })
  duracaoMin: number;

  @ApiProperty({ enum: MODALIDADES, enumName: 'Modalidade' })
  @IsIn(MODALIDADES, { message: 'Escolha presencial ou online.' })
  modalidade: Modalidade;

  @ApiPropertyOptional({ description: 'Repete toda semana, no mesmo dia e hora.' })
  @IsOptional()
  @IsBoolean()
  repetirSemanal?: boolean;
}

export const ESCOPOS = ['esta', 'proximas'] as const;

export class AlterarSessaoDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Data e hora inválidas.' })
  inicio?: string;

  @ApiPropertyOptional({ minimum: 10, maximum: 480 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(480)
  duracaoMin?: number;

  @ApiPropertyOptional({ enum: MODALIDADES, enumName: 'Modalidade' })
  @IsOptional()
  @IsIn(MODALIDADES)
  modalidade?: Modalidade;

  @ApiPropertyOptional({ enum: ESCOPOS, description: '`proximas`: esta e as próximas da repetição.' })
  @IsOptional()
  @IsIn(ESCOPOS)
  escopo?: (typeof ESCOPOS)[number];
}

export const STATUS_MARCAVEIS = ['agendada', 'confirmada', 'realizada', 'falta'] as const;

export class StatusSessaoDto {
  @ApiProperty({ enum: STATUS_MARCAVEIS, description: 'Desmarcar é a rota /desmarcar.' })
  @IsIn(STATUS_MARCAVEIS, { message: 'Situação inválida.' })
  status: (typeof STATUS_MARCAVEIS)[number];
}

export class DesmarcarDto {
  @ApiPropertyOptional({ format: 'date-time', description: 'Quando o paciente avisou. Padrão: agora.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  avisoEm?: string;

  @ApiPropertyOptional({ description: 'Só responde o que aconteceria, sem desmarcar.' })
  @IsOptional()
  @IsBoolean()
  simular?: boolean;
}

export class DesmarcarRespostaDto {
  @ApiProperty({ enum: ['cancelada', 'falta'] }) resultado: 'cancelada' | 'falta';
  @ApiProperty({ description: 'Antecedência do aviso, em horas.' }) horasAviso: number;
  @ApiProperty({ description: 'Prazo da conta, em horas.' }) prazoHoras: number;
}

export class RemovidasDto {
  @ApiProperty() removidas: number;
}
