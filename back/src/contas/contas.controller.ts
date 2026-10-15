import { Body, Controller, Get, HttpCode, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UUID } from '../comum/pipes';
import { Jwt } from '../comum/publico';
import { ConfiguracoesParciaisDto, ContaDto, ContaResumoDto, PerfilParcialDto } from './contas.dto';
import { ContasService } from './contas.service';

@ApiTags('contas')
@ApiBearerAuth()
@Controller('contas')
export class ContasController {
  constructor(private readonly contas: ContasService) {}

  @Get()
  @ApiOkResponse({ type: ContaResumoDto, isArray: true })
  listar(@Jwt() jwt: string): Promise<ContaResumoDto[]> {
    return this.contas.listar(jwt);
  }

  @Get(':conta')
  @ApiOkResponse({ type: ContaDto })
  ler(@Jwt() jwt: string, @Param('conta', UUID) conta: string): Promise<ContaDto> {
    return this.contas.ler(jwt, conta);
  }

  @Patch(':conta/perfil')
  @HttpCode(204)
  @ApiNoContentResponse()
  gravarPerfil(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Body() dto: PerfilParcialDto): Promise<void> {
    return this.contas.gravarPerfil(jwt, conta, dto);
  }

  @Patch(':conta/configuracoes')
  @HttpCode(204)
  @ApiNoContentResponse()
  gravarConfiguracoes(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Body() dto: ConfiguracoesParciaisDto,
  ): Promise<void> {
    return this.contas.gravarConfiguracoes(jwt, conta, dto);
  }
}
