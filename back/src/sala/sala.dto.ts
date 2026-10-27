import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, Matches, MaxLength, ValidateIf } from 'class-validator';

/** O mesmo filtro do banco (privado.link_valido): https, sem espaço nem aspas. */
export const LINK_SALA = /^https:\/\/[^\s<>"']{4,}$/;

export const GOOGLE_SALA = ['indisponivel', 'desconectada', 'conectada', 'reconectar'] as const;

export class SalaSessaoDto {
  @ApiProperty({ type: String, nullable: true, description: 'O link que vale: o da sessão ou, sem ele, o fixo do perfil.' })
  link: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Colado nesta sessão.' })
  linkSessao: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Sala do Meet do paciente, criada pela conta Google do psicólogo.' })
  linkMeet: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Fixo do perfil.' })
  linkPerfil: string | null;
  @ApiProperty({ description: 'Token do link do paciente: o front monta /sala/<token>.' })
  token: string;
  @ApiProperty({
    enum: GOOGLE_SALA,
    enumName: 'GoogleSala',
    description: '`indisponivel`: integração desligada; `reconectar`: o Google recusou o token.',
  })
  google: (typeof GOOGLE_SALA)[number];
  @ApiProperty({ type: String, nullable: true, description: 'Por que o Meet não foi gerado agora, quando tentou e falhou.' })
  avisoMeet: string | null;
}

export class LinkSalaDto {
  @ApiProperty({ type: String, nullable: true, description: 'null ou vazio volta a usar o link fixo do perfil.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(LINK_SALA, { message: 'Cole o link completo da chamada, começando com https://' })
  @MaxLength(300)
  link: string | null;
}

export class TokenSalaDto {
  @ApiProperty() token: string;
}

export const SITUACOES_SALA = ['sem_sessao', 'cedo', 'sem_link', 'aberta'] as const;

export class SalaPublicaDto {
  @ApiProperty({ type: String, nullable: true }) profissional: string | null;
  @ApiProperty({
    enum: SITUACOES_SALA,
    enumName: 'SituacaoSala',
    description: '`cedo`: abre 15 min antes; `aberta`: com o link; `sem_link`: na hora, mas sem link colocado.',
  })
  situacao: (typeof SITUACOES_SALA)[number];
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) inicio: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) fim: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) abreEm: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Só dentro da janela.' }) link: string | null;
}
