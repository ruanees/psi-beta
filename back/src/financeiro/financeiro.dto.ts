import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export const SITUACOES_COBRANCA = ['pendente', 'vencida', 'paga', 'cancelada'] as const;
export type SituacaoCobranca = (typeof SITUACOES_COBRANCA)[number];

export const ORIGENS_COBRANCA = ['sessao', 'pacote', 'mensal'] as const;
export type OrigemCobranca = (typeof ORIGENS_COBRANCA)[number];

export const FORMAS_PAGAMENTO = ['pix', 'dinheiro', 'cartao', 'transferencia', 'boleto'] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

const DATA = /^\d{4}-\d{2}-\d{2}$/;

// ------------------------------------------------------------ leitura

export class CobrancaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) pacienteId: string;
  @ApiProperty() pacienteNome: string;
  @ApiProperty({ enum: ORIGENS_COBRANCA, enumName: 'OrigemCobranca' }) origem: OrigemCobranca;
  @ApiProperty() valor: number;
  @ApiProperty({ format: 'date' }) vencimento: string;
  @ApiProperty({ enum: SITUACOES_COBRANCA, enumName: 'SituacaoCobranca', description: 'Vencida = pendente com vencimento passado.' })
  situacao: SituacaoCobranca;
  @ApiProperty({ enum: FORMAS_PAGAMENTO, enumName: 'FormaPagamento', nullable: true }) forma: FormaPagamento | null;
  @ApiProperty({ type: String, nullable: true, format: 'date' }) pagaEm: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Por que foi cancelada ou teve o pagamento desfeito.' })
  motivo: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) sessaoId: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) sessaoInicio: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) pacoteId: string | null;
  @ApiProperty({ type: Number, nullable: true }) pacoteQuantidade: number | null;
  @ApiProperty({ type: String, nullable: true, format: 'date', description: 'Mensalidade: primeiro dia do mês.' })
  referencia: string | null;
}

export class PacienteAcabandoDto {
  @ApiProperty({ format: 'uuid' }) pacienteId: string;
  @ApiProperty() pacienteNome: string;
  @ApiProperty() restantes: number;
}

export class PainelFinanceiroDto {
  @ApiProperty({ description: 'Pendentes, inclusive vencidas.' }) aReceber: number;
  @ApiProperty() vencidas: number;
  @ApiProperty() valorVencido: number;
  @ApiProperty({ description: 'Pagas neste mês.' }) recebidoMes: number;
  @ApiProperty({ type: PacienteAcabandoDto, isArray: true, description: 'Pacientes ativos com 1 ou 0 sessão de pacote restante.' })
  pacotesAcabando: PacienteAcabandoDto[];
}

export class CobrancaDoPacoteDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['pendente', 'paga', 'cancelada'] }) situacao: 'pendente' | 'paga' | 'cancelada';
  @ApiProperty({ format: 'date' }) vencimento: string;
}

export class PacoteDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() quantidade: number;
  @ApiProperty() valor: number;
  @ApiProperty({ format: 'date-time' }) criadoEm: string;
  @ApiProperty() usadas: number;
  @ApiProperty() restantes: number;
  @ApiProperty({ type: CobrancaDoPacoteDto, nullable: true }) cobranca: CobrancaDoPacoteDto | null;
}

export class PacoteDaSessaoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ description: 'Esta é a sessão número N do pacote.' }) numero: number;
  @ApiProperty() quantidade: number;
}

export class CobrancaDaSessaoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() valor: number;
  @ApiProperty({ format: 'date' }) vencimento: string;
  @ApiProperty({ enum: SITUACOES_COBRANCA, enumName: 'SituacaoCobranca' }) situacao: SituacaoCobranca;
  @ApiProperty({ enum: FORMAS_PAGAMENTO, enumName: 'FormaPagamento', nullable: true }) forma: FormaPagamento | null;
  @ApiProperty({ type: String, nullable: true, format: 'date' }) pagaEm: string | null;
}

export class SessaoFinanceiroDto {
  @ApiProperty({ type: PacoteDaSessaoDto, nullable: true }) pacote: PacoteDaSessaoDto | null;
  @ApiProperty({ type: CobrancaDaSessaoDto, nullable: true }) cobranca: CobrancaDaSessaoDto | null;
}

// ------------------------------------------------------------ escrita

export class FiltroCobrancasDto {
  @ApiPropertyOptional({ enum: SITUACOES_COBRANCA, enumName: 'SituacaoCobranca', description: 'Pendente inclui as vencidas.' })
  @IsOptional()
  @IsIn(SITUACOES_COBRANCA)
  situacao?: SituacaoCobranca;

  @ApiPropertyOptional({ format: 'date', description: 'Vencimento a partir de.' })
  @IsOptional()
  @Matches(DATA, { message: 'Data no formato AAAA-MM-DD.' })
  de?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Vencimento até.' })
  @IsOptional()
  @Matches(DATA, { message: 'Data no formato AAAA-MM-DD.' })
  ate?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Paciente inválido.' })
  paciente?: string;
}

export class PagarDto {
  @ApiProperty({ enum: FORMAS_PAGAMENTO, enumName: 'FormaPagamento' })
  @IsIn(FORMAS_PAGAMENTO, { message: 'Escolha a forma de pagamento.' })
  forma: FormaPagamento;

  @ApiPropertyOptional({ format: 'date', description: 'Sem data, hoje.' })
  @IsOptional()
  @Matches(DATA, { message: 'Data do pagamento no formato AAAA-MM-DD.' })
  pagaEm?: string;
}

export class MotivoDto {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MinLength(1, { message: 'Informe o motivo.' })
  @MaxLength(300)
  motivo: string;
}

export class ValorCobrancaDto {
  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Valor em reais, com até dois decimais.' })
  @Min(0)
  @Max(99999.99)
  valor: number;
}

export class NovoPacoteDto {
  @ApiPropertyOptional({ description: 'Sem quantidade, a do plano do paciente.' })
  @IsOptional()
  @IsInt({ message: 'Número de sessões inteiro.' })
  @Min(1)
  @Max(100)
  quantidade?: number;

  @ApiPropertyOptional({ description: 'Sem valor, o do plano do paciente.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Valor em reais, com até dois decimais.' })
  @Min(0)
  @Max(99999.99)
  valor?: number;
}
