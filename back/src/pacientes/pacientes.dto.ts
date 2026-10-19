import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AnamneseParcialDto } from '../prontuario/anamnese.dto';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const SITUACOES_PACIENTE = ['ativo', 'alta', 'arquivado'] as const;
export type SituacaoPaciente = (typeof SITUACOES_PACIENTE)[number];

export const STATUS_SESSAO = ['agendada', 'confirmada', 'realizada', 'falta', 'cancelada'] as const;
export type StatusSessao = (typeof STATUS_SESSAO)[number];

export const PLANOS = ['avulsa', 'pacote', 'mensal'] as const;
export type Plano = (typeof PLANOS)[number];

export const MODALIDADES = ['presencial', 'online'] as const;
export type Modalidade = (typeof MODALIDADES)[number];

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const CPF = /^\d{11}$/;

// ------------------------------------------------------------ leitura

export class ResponsavelDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() nome: string;
  @ApiProperty({ type: String, nullable: true }) parentesco: string | null;
  @ApiProperty({ type: String, nullable: true }) telefone: string | null;
  @ApiProperty({ type: String, nullable: true, description: '11 dígitos, sem pontuação.' }) cpf: string | null;
  @ApiProperty({ description: 'Paga as sessões: é o pagador do recibo.' }) financeiro: boolean;
}

export class PacienteResumoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() nome: string;
  @ApiProperty({ type: String, nullable: true }) telefone: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date' }) nascimento: string | null;
  @ApiProperty({ enum: SITUACOES_PACIENTE, enumName: 'SituacaoPaciente' }) situacao: SituacaoPaciente;
  @ApiProperty({ type: String, nullable: true, description: 'Nome do responsável principal.' }) responsavel: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) proximaSessao: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) ultimaSessao: string | null;
}

export class SessaoResumoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date-time' }) inicio: string;
  @ApiProperty({ format: 'date-time' }) fim: string;
  @ApiProperty({ enum: MODALIDADES, enumName: 'Modalidade' }) modalidade: Modalidade;
  @ApiProperty({ enum: STATUS_SESSAO, enumName: 'StatusSessao' }) status: StatusSessao;
}

export class RepeticaoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ description: '0 = domingo.' }) diaSemana: number;
  @ApiProperty({ example: '14:00' }) hora: string;
  @ApiProperty() duracaoMin: number;
  @ApiProperty({ enum: MODALIDADES, enumName: 'Modalidade' }) modalidade: Modalidade;
}

export class ContagemDto {
  @ApiProperty() realizadas: number;
  @ApiProperty() faltas: number;
  @ApiProperty() canceladas: number;
}

/** Como o paciente paga. Serve para ler e para gravar: o plano muda inteiro, de uma vez. */
export class PlanoDto {
  @ApiProperty({ enum: PLANOS, enumName: 'Plano' })
  @IsIn(PLANOS, { message: 'Plano: avulsa, pacote ou mensal.' })
  tipo: Plano;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Pacote: sessões no pacote (2 a 100). Mensal: sessões que o mês cobre, opcional. Avulsa: sempre null.',
  })
  @ValidateIf((o: PlanoDto) => o.tipo === 'pacote' || (o.tipo === 'mensal' && o.sessoes != null))
  @IsInt({ message: 'Número de sessões inteiro.' })
  @Min(1, { message: 'Número de sessões entre 1 e 100.' })
  @Max(100, { message: 'Número de sessões entre 1 e 100.' })
  sessoes: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Avulsa: valor da sessão (null usa o padrão do consultório). Pacote: valor do pacote. Mensal: valor do mês.',
  })
  @ValidateIf((o: PlanoDto) => o.tipo !== 'avulsa' || o.valor != null)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Valor em reais, com até dois decimais.' })
  @Min(0)
  @Max(99999.99)
  valor: number | null;
}

export class PacienteDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() nome: string;
  @ApiProperty({ type: String, nullable: true, format: 'date' }) nascimento: string | null;
  @ApiProperty({ type: String, nullable: true }) cpf: string | null;
  @ApiProperty({ type: String, nullable: true }) telefone: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Só vem para o psicólogo do paciente.' })
  queixaPrincipal: string | null;
  @ApiProperty({ description: 'Quem lê é o psicólogo do paciente (vê e edita dado clínico).' }) podeClinico: boolean;
  @ApiProperty({ type: Number, nullable: true, description: 'Valor da sessão avulsa. Vazio usa o padrão do consultório.' })
  valorSessao: number | null;
  @ApiProperty({ type: PlanoDto }) plano: PlanoDto;
  @ApiProperty({ enum: SITUACOES_PACIENTE, enumName: 'SituacaoPaciente' }) situacao: SituacaoPaciente;
  @ApiProperty({ format: 'date-time' }) consentimentoEm: string;
  @ApiProperty({ format: 'date-time' }) criadoEm: string;
  @ApiProperty({ type: ResponsavelDto, isArray: true }) responsaveis: ResponsavelDto[];
  @ApiProperty({ type: SessaoResumoDto, nullable: true }) proximaSessao: SessaoResumoDto | null;
  @ApiProperty({ type: RepeticaoDto, nullable: true }) repeticao: RepeticaoDto | null;
  @ApiProperty({ type: ContagemDto }) contagem: ContagemDto;
}

export class IdDto {
  @ApiProperty({ format: 'uuid' }) id: string;
}

// ------------------------------------------------------------ escrita

export class NovoResponsavelDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Informe o nome do responsável.' })
  @MaxLength(160)
  nome: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) parentesco?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) telefone?: string;

  @ApiPropertyOptional({ description: '11 dígitos, sem pontuação.' })
  @IsOptional()
  @Matches(CPF, { message: 'CPF com 11 números.' })
  cpf?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() financeiro?: boolean;
}

export class ResponsavelParcialDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1, { message: 'Informe o nome do responsável.' }) @MaxLength(160) nome?: string;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(40) parentesco?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(30) telefone?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(CPF, { message: 'CPF com 11 números.' })
  cpf?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() financeiro?: boolean;
}

export class NovoPacienteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Informe o nome do paciente.' })
  @MaxLength(160)
  nome: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Matches(DATA, { message: 'Data de nascimento no formato AAAA-MM-DD.' })
  nascimento?: string;

  @ApiPropertyOptional() @IsOptional() @Matches(CPF, { message: 'CPF com 11 números.' }) cpf?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) telefone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) queixaPrincipal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Valor em reais, com até dois decimais.' })
  @Min(0)
  @Max(99999.99)
  valorSessao?: number;

  @ApiPropertyOptional({ type: PlanoDto, description: 'Sem plano, o paciente nasce avulso com `valorSessao`.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanoDto)
  plano?: PlanoDto;

  @ApiPropertyOptional({ type: AnamneseParcialDto, description: 'Anamnese inicial, gravada junto com o cadastro.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => AnamneseParcialDto)
  anamnese?: AnamneseParcialDto;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Membro psicólogo que atende o paciente. Sem ele: quem cadastra, se for psicólogo, ou o único psicólogo da conta.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'Psicólogo inválido.' })
  profissionalId?: string;

  @ApiProperty({ description: 'O paciente (ou responsável) consentiu com o uso dos dados (LGPD). Precisa ser true.' })
  @Equals(true, { message: 'Confirme o consentimento do paciente para o uso dos dados.' })
  consentimento: boolean;

  @ApiPropertyOptional({ type: NovoResponsavelDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => NovoResponsavelDto)
  responsaveis?: NovoResponsavelDto[];
}

/** Só os campos enviados são gravados. `null` limpa um campo opcional. */
export class PacienteParcialDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1, { message: 'Informe o nome do paciente.' }) @MaxLength(160) nome?: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(DATA, { message: 'Data de nascimento no formato AAAA-MM-DD.' })
  nascimento?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(CPF, { message: 'CPF com 11 números.' })
  cpf?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(30) telefone?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(4000) queixaPrincipal?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Valor em reais, com até dois decimais.' })
  @Min(0)
  @Max(99999.99)
  valorSessao?: number | null;
}

export class SituacaoDto {
  @ApiProperty({ enum: SITUACOES_PACIENTE, enumName: 'SituacaoPaciente' })
  @IsIn(SITUACOES_PACIENTE)
  situacao: SituacaoPaciente;
}

/** A busca vai no corpo: nome de paciente nunca vai em URL, que fica em log. */
export class BuscaPacientesDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) busca?: string;

  @ApiPropertyOptional({ enum: SITUACOES_PACIENTE, enumName: 'SituacaoPaciente' })
  @IsOptional()
  @IsIn(SITUACOES_PACIENTE)
  situacao?: SituacaoPaciente;
}
