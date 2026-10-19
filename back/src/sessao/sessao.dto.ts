import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class EntrarDto {
  @ApiProperty({ example: 'psicologa@exemplo.com.br' })
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Informe a senha.' })
  @MaxLength(72)
  senha: string;
}

export class RenovarDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  renovacao: string;
}

export class RecuperarDto {
  @ApiProperty()
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email: string;
}

export class NovaSenhaDto {
  @ApiProperty({ minLength: 10, maxLength: 72 })
  @IsString()
  @MinLength(10, { message: 'A senha precisa ter ao menos 10 caracteres.' })
  @MaxLength(72, { message: 'A senha pode ter no máximo 72 caracteres.' })
  senha: string;

  @ApiPropertyOptional({
    maxLength: 72,
    description: 'Obrigatória, exceto logo depois do link de recuperação de senha.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(72)
  senhaAtual?: string;
}

export class CodigoDto {
  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'O código tem 6 números.' })
  codigo: string;
}

export class SegundoFatorDto extends CodigoDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  fatorId: string;
}

export class SessaoDto {
  @ApiProperty({
    enum: ['pronta', 'segundo_fator'],
    description: '`segundo_fator`: a senha passou, falta o código do autenticador. O acesso ainda não lê dado nenhum.',
  })
  etapa: 'pronta' | 'segundo_fator';

  @ApiProperty()
  acesso: string;

  @ApiProperty()
  renovacao: string;

  @ApiProperty({ description: 'Epoch em segundos.' })
  expiraEm: number;

  @ApiPropertyOptional({ description: 'Presente quando etapa = segundo_fator.' })
  fatorId?: string;
}

export class FatorDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['verificado', 'pendente'] })
  situacao: 'verificado' | 'pendente';

  @ApiPropertyOptional()
  nome?: string;
}

export class NovoFatorDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'QR em SVG (data URI) para o aplicativo autenticador ler.' })
  qr: string;

  @ApiProperty({ description: 'O mesmo segredo do QR, para digitar à mão.' })
  segredo: string;
}
