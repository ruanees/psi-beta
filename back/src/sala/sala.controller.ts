import { Body, Controller, Get, Header, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ErroBanco } from '../comum/erros';
import { UUID } from '../comum/pipes';
import { Jwt, Publico } from '../comum/publico';
import { LinkSalaDto, SalaPublicaDto, SalaSessaoDto, TokenSalaDto } from './sala.dto';
import { SalaService } from './sala.service';

@ApiTags('sala')
@Controller()
export class SalaController {
  constructor(private readonly sala: SalaService) {}

  @ApiBearerAuth()
  @Get('contas/:conta/sessoes/:sessao/sala')
  @ApiOkResponse({ type: SalaSessaoDto })
  daSessao(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Param('sessao', UUID) sessao: string) {
    return this.sala.daSessao(jwt, conta, sessao);
  }

  @ApiBearerAuth()
  @Put('contas/:conta/sessoes/:sessao/sala')
  @HttpCode(204)
  @ApiNoContentResponse()
  gravarLink(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('sessao', UUID) sessao: string,
    @Body() dto: LinkSalaDto,
  ) {
    return this.sala.gravarLink(jwt, conta, sessao, dto.link ?? null);
  }

  @ApiBearerAuth()
  @Post('contas/:conta/pacientes/:paciente/sala/renovar')
  @HttpCode(200)
  @ApiOkResponse({ type: TokenSalaDto, description: 'O link anterior do paciente para de funcionar.' })
  renovar(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Param('paciente', UUID) paciente: string) {
    return this.sala.renovar(jwt, conta, paciente);
  }

  /** A página do paciente, sem login. O token só vai ao banco; o log guarda o padrão da rota. */
  @Publico()
  @Get('sala/:token')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: SalaPublicaDto })
  publica(@Param('token') token: string) {
    if (!/^[0-9a-f]{64}$/.test(token)) throw new ErroBanco('P0001', 'sala_nao_encontrada');
    return this.sala.publica(token);
  }
}
