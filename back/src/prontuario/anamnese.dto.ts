import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf, ValidateNested } from 'class-validator';

// Anamnese: a ficha de saúde do paciente. Arquivo sem dependência de
// pacientes.dto, para o cadastro do paciente poder usá-la sem ciclo.

export const RESPOSTAS = ['sim', 'nao', 'nao_sabe'] as const;
export type Resposta = (typeof RESPOSTAS)[number];

/** Os campos de texto livre, um por tema, na ordem em que aparecem na tela. */
export const TEXTOS_ANAMNESE = [
  'acompanhamentos',
  'saudeGeral',
  'tratamentosAnteriores',
  'historicoFamiliar',
  'substancias',
  'sonoAlimentacao',
  'rotina',
  'observacoes',
] as const;

export class MedicacaoDto {
  @ApiProperty({ example: 'Metilfenidato' })
  @IsString()
  @MinLength(1, { message: 'Informe o nome do medicamento.' })
  @MaxLength(120)
  nome: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '10 mg' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  dose?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'De manhã' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  frequencia?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Quem receitou.', example: 'Dra. Lima, psiquiatra' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  prescritor?: string | null;
}

const texto = (max: number) => [IsOptional(), ValidateIf((_: unknown, v: unknown) => v !== null), IsString(), MaxLength(max)];
function Texto(max: number, descricao?: string): PropertyDecorator {
  return (alvo, chave) => {
    ApiPropertyOptional({ type: String, nullable: true, description: descricao })(alvo, chave);
    for (const d of texto(max)) d(alvo, chave);
  };
}

/** Só os campos enviados são gravados. `null` limpa. */
export class AnamneseParcialDto {
  @ApiPropertyOptional({ enum: RESPOSTAS, enumName: 'Resposta', nullable: true, description: 'Possui laudo ou diagnóstico?' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(RESPOSTAS, { message: 'Laudo: sim, não ou não sabe.' })
  laudo?: Resposta | null;

  @Texto(2000, 'Qual laudo ou diagnóstico, quem emitiu e quando.') laudoDescricao?: string | null;

  @ApiPropertyOptional({ enum: RESPOSTAS, enumName: 'Resposta', nullable: true, description: 'Toma alguma medicação?' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(RESPOSTAS, { message: 'Medicação: sim, não ou não sabe.' })
  medicacao?: Resposta | null;

  @ApiPropertyOptional({ type: MedicacaoDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30, { message: 'No máximo 30 medicamentos.' })
  @ValidateNested({ each: true })
  @Type(() => MedicacaoDto)
  medicacoes?: MedicacaoDto[];

  @Texto(4000, 'Outros profissionais que acompanham: psiquiatra, neurologista, fono…') acompanhamentos?: string | null;
  @Texto(4000, 'Doenças, internações, cirurgias, alergias.') saudeGeral?: string | null;
  @Texto(4000, 'Psicoterapia ou outros tratamentos anteriores.') tratamentosAnteriores?: string | null;
  @Texto(4000) historicoFamiliar?: string | null;
  @Texto(4000, 'Álcool, tabaco e outras substâncias.') substancias?: string | null;
  @Texto(4000) sonoAlimentacao?: string | null;
  @Texto(4000, 'Escola, trabalho e rotina.') rotina?: string | null;
  @Texto(4000) observacoes?: string | null;
}

export class AnamneseDto {
  @ApiProperty({ description: 'Falso para quem não é o psicólogo do paciente: o resto vem vazio.' }) podeClinico: boolean;
  @ApiProperty({ enum: RESPOSTAS, enumName: 'Resposta', nullable: true }) laudo: Resposta | null;
  @ApiProperty({ type: String, nullable: true }) laudoDescricao: string | null;
  @ApiProperty({ enum: RESPOSTAS, enumName: 'Resposta', nullable: true }) medicacao: Resposta | null;
  @ApiProperty({ type: MedicacaoDto, isArray: true }) medicacoes: MedicacaoDto[];
  @ApiProperty({ type: String, nullable: true }) acompanhamentos: string | null;
  @ApiProperty({ type: String, nullable: true }) saudeGeral: string | null;
  @ApiProperty({ type: String, nullable: true }) tratamentosAnteriores: string | null;
  @ApiProperty({ type: String, nullable: true }) historicoFamiliar: string | null;
  @ApiProperty({ type: String, nullable: true }) substancias: string | null;
  @ApiProperty({ type: String, nullable: true }) sonoAlimentacao: string | null;
  @ApiProperty({ type: String, nullable: true }) rotina: string | null;
  @ApiProperty({ type: String, nullable: true }) observacoes: string | null;
  @ApiProperty({ type: Number, nullable: true, description: 'null enquanto ninguém preencheu.' }) versao: number | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) alteradaEm: string | null;
}
