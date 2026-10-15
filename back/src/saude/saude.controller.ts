import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { NOMES_CONFIG, lerConfig, versaoPublicada, type NomeConfig, type Origem } from '../comum/config';
import { Publico } from '../comum/publico';
import { documentoOpenApi } from '../openapi';

class SaudeDto {
  @ApiProperty({ description: 'URL e chave anon do Supabase presentes.' })
  supabase: boolean;

  @ApiProperty({
    description: 'De onde veio cada configuração — nunca o valor.',
    example: { SUPABASE_URL: 'process', SUPABASE_JWT_SECRET: 'faltando' },
  })
  config: Record<NomeConfig, Origem>;

  @ApiProperty({ description: 'Data e hora em que esta versão do Worker foi publicada (`local` fora do Worker).' })
  versao: string;
}

@ApiTags('infra')
@Controller()
export class SaudeController {
  @Publico()
  @Get('saude')
  @ApiOkResponse({ type: SaudeDto })
  saude(): SaudeDto {
    const config = Object.fromEntries(NOMES_CONFIG.map((n) => [n, lerConfig(n).origem])) as Record<NomeConfig, Origem>;
    return {
      supabase: config.SUPABASE_URL !== 'faltando' && config.SUPABASE_ANON_KEY !== 'faltando',
      config,
      versao: versaoPublicada(),
    };
  }

  /** Pública e sem guard: o build do front gera os tipos sem credencial nenhuma. */
  @Publico()
  @Get('openapi.json')
  openapi(): object {
    return documentoOpenApi();
  }
}
