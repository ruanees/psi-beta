import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class GoogleStatusDto {
  @ApiProperty({ description: 'Falso enquanto os segredos do Google não estão no Worker: a tela não oferece a conexão.' })
  disponivel: boolean;
  @ApiProperty() conectada: boolean;
  @ApiProperty({ type: String, nullable: true, description: 'A conta Google conectada.' }) email: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) conectadaEm: string | null;
  @ApiProperty({ description: 'O Google recusou o token (revogado ou vencido): pede reconexão.' }) falhou: boolean;
}

export class UrlDto {
  @ApiProperty({ description: 'Endereço de autorização do Google, para onde o navegador vai.' }) url: string;
}

export class RetornoGoogleDto {
  @ApiProperty({ description: 'O `code` que o Google pôs na URL de retorno.' })
  @IsString()
  @MinLength(4)
  @MaxLength(2048)
  codigo: string;

  @ApiProperty({ description: 'O `state` que voltou junto, assinado pelo back na ida.' })
  @IsString()
  @MinLength(10)
  @MaxLength(2048)
  estado: string;
}
