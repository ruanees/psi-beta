import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Jwt } from '../comum/publico';
import { SupabaseService } from '../supabase/supabase.service';

export class EuDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  email: string | null;

  @ApiProperty({ description: 'Opera a plataforma (super_admins): pode ir para o backoffice.' })
  super: boolean;

  @ApiProperty({ description: 'Quantos consultórios este login alcança. Zero: não há operação para entrar.' })
  consultorios: number;
}

// Quem é o login, para a escolha de contexto depois de entrar: operação
// (este app) ou backoffice. Quem responde é o banco (plataforma_eu).
@ApiTags('eu')
@ApiBearerAuth()
@Controller('eu')
export class EuController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  @ApiOkResponse({ type: EuDto })
  async eu(@Jwt() jwt: string): Promise<EuDto> {
    const r = await this.supabase.rpc<{ id: string; email: string | null; super: boolean; consultorios: number }>(
      jwt,
      'plataforma_eu',
    );
    return { id: r.id, email: r.email ?? null, super: r.super === true, consultorios: Number(r.consultorios ?? 0) };
  }
}
