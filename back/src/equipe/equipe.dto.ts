import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// Transferir pacientes entre psicólogos do consultório. Só o titular; a
// regra é do banco (pacientes_transferir), aqui só a forma do pedido.

// Id que vai ao banco: o formato basta, quem diz se existe é ele.
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PsicologoDto {
  @ApiProperty({ description: 'O vínculo do psicólogo com o consultório.' })
  membroId: string;

  @ApiProperty({ description: 'Nome do perfil profissional, ou o e-mail.' })
  nome: string;

  @ApiProperty({ description: 'Entra no consultório como psicólogo: só quem está ativo recebe paciente.' })
  ativo: boolean;

  @ApiProperty({ description: 'Quantos pacientes são dele, em qualquer situação.' })
  pacientes: number;
}

export class PacienteDoPsicologoDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  nome: string;

  @ApiProperty({ enum: ['ativo', 'alta', 'arquivado'] })
  situacao: 'ativo' | 'alta' | 'arquivado';

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  proximaSessao: string | null;
}

export class TransferenciaDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  pacienteId: string;

  @ApiProperty()
  paciente: string;

  @ApiProperty({ description: 'Quem entregou.' })
  de: string;

  @ApiProperty({ description: 'Quem recebeu.' })
  para: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  motivo: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'E-mail de quem transferiu.' })
  quem: string | null;

  @ApiProperty({ format: 'date-time' })
  em: string;
}

export class TransferirDto {
  @ApiProperty({ description: 'O psicólogo que entrega (membroId).' })
  @Matches(FORMATO_UUID, { message: 'Escolha de quem são os pacientes.' })
  de: string;

  @ApiProperty({ description: 'O psicólogo que recebe (membroId), ativo no consultório.' })
  @Matches(FORMATO_UUID, { message: 'Escolha para quem vão os pacientes.' })
  para: string;

  @ApiPropertyOptional({ type: String, isArray: true, description: 'Sem a lista, vão todos os pacientes de quem entrega.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @Matches(FORMATO_UUID, { each: true, message: 'Paciente inválido.' })
  pacientes?: string[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Motivo: até 500 caracteres.' })
  motivo?: string;
}

export class TransferidosDto {
  @ApiProperty({ description: 'Quantos pacientes foram transferidos.' })
  transferidos: number;
}
