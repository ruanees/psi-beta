import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LINK_SALA } from '../sala/sala.dto';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

// Papéis existem desde já no banco; no beta toda conta é titular + psicólogo.
export const PAPEIS = ['titular', 'psicologo', 'recepcao', 'financeiro'] as const;
export type Papel = (typeof PAPEIS)[number];

export class ContaResumoDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  nome: string;

  @ApiProperty({ enum: PAPEIS, isArray: true, enumName: 'Papel' })
  papeis: Papel[];
}

export class PerfilDto {
  @ApiProperty()
  nome: string;

  @ApiProperty({ type: String, nullable: true, example: '06/123456' })
  crp: string | null;

  @ApiProperty({ type: String, nullable: true })
  epsiNumero: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Em reais.' })
  valorSessaoPadrao: number | null;

  @ApiProperty({ type: String, nullable: true, description: 'Link fixo da sala online, usado quando a sessão não tem link próprio.' })
  salaLink: string | null;
}

export class ConfiguracoesDto {
  @ApiProperty()
  faltaCobraAvulsa: boolean;

  @ApiProperty({ minimum: 0, maximum: 168 })
  avisoMinimoHoras: number;

  @ApiProperty({ minimum: 5, maximum: 240 })
  inatividadeMinutos: number;

  @ApiProperty({ minimum: 1, maximum: 28, description: 'Dia do mês em que vence a mensalidade.' })
  vencimentoMensalDia: number;
}

export class ContaDto extends ContaResumoDto {
  @ApiProperty({ type: PerfilDto, nullable: true })
  perfil: PerfilDto | null;

  @ApiProperty({ type: ConfiguracoesDto })
  configuracoes: ConfiguracoesDto;
}

// ------------------------------------------------------------ escrita

/** Só os campos enviados são gravados. `null` limpa um campo opcional. */
export class PerfilParcialDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Informe o nome.' })
  @MaxLength(120)
  nome?: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '06/123456' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[0-9]{2}\/[0-9]{1,6}$/, { message: 'CRP no formato região/número, por exemplo 06/123456.' })
  crp?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(40)
  epsiNumero?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Valor em reais, com até dois decimais.' })
  @Min(0)
  @Max(99999.99)
  valorSessaoPadrao?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'https://meet.google.com/abc-defg-hij' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(LINK_SALA, { message: 'Cole o link completo da chamada, começando com https://' })
  @MaxLength(300)
  salaLink?: string | null;
}

export class ConfiguracoesParciaisDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  faltaCobraAvulsa?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 168 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168, { message: 'No máximo 168 horas (uma semana).' })
  avisoMinimoHoras?: number;

  @ApiPropertyOptional({ minimum: 5, maximum: 240 })
  @IsOptional()
  @IsInt()
  @Min(5, { message: 'No mínimo 5 minutos.' })
  @Max(240, { message: 'No máximo 240 minutos.' })
  inatividadeMinutos?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 28 })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Dia de vencimento entre 1 e 28.' })
  @Max(28, { message: 'Dia de vencimento entre 1 e 28.' })
  vencimentoMensalDia?: number;
}
