import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
} from 'class-validator';

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
  @ApiProperty({ description: 'Cobranças pagas ainda sem recibo registrado.' }) semRecibo: number;
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

// ------------------------------------------------------------ recibos

export class PessoaReciboDto {
  @ApiProperty() nome: string;
  @ApiProperty({ type: String, nullable: true, description: '11 dígitos, sem pontuação.' }) cpf: string | null;
}

export class PacienteReciboDto extends PessoaReciboDto {
  @ApiProperty({ format: 'uuid' }) id: string;
}

export class PagadorReciboDto extends PessoaReciboDto {
  @ApiProperty({ description: 'É o responsável marcado como "paga as sessões" (não o próprio paciente).' })
  responsavel: boolean;
}

export class ItemFilaReciboDto {
  @ApiProperty({ format: 'uuid', description: 'A cobrança paga.' }) id: string;
  @ApiProperty({ enum: ORIGENS_COBRANCA, enumName: 'OrigemCobranca' }) origem: OrigemCobranca;
  @ApiProperty() valor: number;
  @ApiProperty({ format: 'date' }) pagaEm: string;
  @ApiProperty({ enum: FORMAS_PAGAMENTO, enumName: 'FormaPagamento' }) forma: FormaPagamento;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) sessaoInicio: string | null;
  @ApiProperty({ type: Number, nullable: true }) pacoteQuantidade: number | null;
  @ApiProperty({ type: String, nullable: true, format: 'date' }) referencia: string | null;
  @ApiProperty({ type: PacienteReciboDto }) paciente: PacienteReciboDto;
  @ApiProperty({ type: PagadorReciboDto }) pagador: PagadorReciboDto;
}

export class ReciboDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) pacienteId: string;
  @ApiProperty() numero: string;
  @ApiProperty({ format: 'date' }) emitidoEm: string;
  @ApiProperty() valor: number;
  @ApiProperty() pagadorNome: string;
  @ApiProperty({ type: String, nullable: true }) pagadorCpf: string | null;
  @ApiProperty() beneficiarioNome: string;
  @ApiProperty({ type: String, nullable: true }) beneficiarioCpf: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) canceladoEm: string | null;
  @ApiProperty({ type: String, nullable: true }) canceladoMotivo: string | null;
  @ApiProperty({ description: 'Quantas cobranças o recibo cobre.' }) cobrancas: number;
}

export class FiltroRecibosDto {
  @ApiPropertyOptional({ format: 'date', description: 'Emitido a partir de.' })
  @IsOptional()
  @Matches(DATA, { message: 'Data no formato AAAA-MM-DD.' })
  de?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Emitido até.' })
  @IsOptional()
  @Matches(DATA, { message: 'Data no formato AAAA-MM-DD.' })
  ate?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'Paciente inválido.' })
  paciente?: string;
}

export class NovoReciboDto {
  @ApiProperty({ type: String, format: 'uuid', isArray: true, description: 'Cobranças pagas do mesmo paciente.' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Escolha ao menos um pagamento.' })
  @ArrayMaxSize(60)
  @IsUUID('all', { each: true, message: 'Pagamento inválido.' })
  cobrancas: string[];

  @ApiProperty({ description: 'Número do recibo no Receita Saúde.' })
  @IsString()
  @MinLength(1, { message: 'Informe o número do recibo.' })
  @MaxLength(60)
  numero: string;

  @ApiProperty({ format: 'date' })
  @Matches(DATA, { message: 'Data de emissão no formato AAAA-MM-DD.' })
  emitidoEm: string;
}

// ------------------------------------------------------------ relatório

export class MesRelatorioDto {
  @ApiProperty({ format: 'date', description: 'Primeiro dia do mês.' }) mes: string;
  @ApiProperty() realizadas: number;
  @ApiProperty() faltas: number;
  @ApiProperty() recebido: number;
}

export class RelatorioMensalDto {
  @ApiProperty({ format: 'date', description: 'Primeiro dia do mês.' }) mes: string;
  @ApiProperty() realizadas: number;
  @ApiProperty() faltas: number;
  @ApiProperty() desmarcadas: number;
  @ApiProperty({ description: 'Realizadas online.' }) online: number;
  @ApiProperty() pacientesAtendidos: number;
  @ApiProperty() pacientesNovos: number;
  @ApiProperty({ description: 'Pagamentos com data no mês.' }) recebido: number;
  @ApiProperty({ description: 'Pendentes com vencimento no mês.' }) aReceber: number;
  @ApiProperty({ type: MesRelatorioDto, isArray: true, description: 'Os 12 meses até o escolhido, do mais antigo ao mais novo.' })
  porMes: MesRelatorioDto[];
}

export class MesDto {
  @ApiProperty({ example: '2026-10' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Mês no formato AAAA-MM.' })
  mes: string;
}
