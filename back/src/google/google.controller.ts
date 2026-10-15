import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UUID } from '../comum/pipes';
import { Jwt, UsuarioAtual, type Usuario } from '../comum/publico';
import { GoogleStatusDto, RetornoGoogleDto, UrlDto } from './google.dto';
import { GoogleService } from './google.service';

@ApiTags('google')
@ApiBearerAuth()
@Controller('contas/:conta/google')
export class GoogleController {
  constructor(private readonly google: GoogleService) {}

  @Get()
  @ApiOkResponse({ type: GoogleStatusDto })
  status(@Jwt() jwt: string, @Param('conta', UUID) conta: string) {
    return this.google.status(jwt, conta);
  }

  @Post('conectar')
  @HttpCode(200)
  @ApiOkResponse({ type: UrlDto })
  async conectar(@Param('conta', UUID) conta: string, @UsuarioAtual() usuario: Usuario): Promise<UrlDto> {
    return { url: await this.google.urlConectar(usuario.id, conta) };
  }

  @Post('retorno')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Troca o código pelo token, que fica guardado cifrado.' })
  retorno(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @UsuarioAtual() usuario: Usuario,
    @Body() dto: RetornoGoogleDto,
  ) {
    return this.google.concluir(jwt, usuario.id, conta, dto.codigo, dto.estado);
  }

  @Delete()
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Apaga a conexão e revoga o acesso no Google.' })
  desconectar(@Jwt() jwt: string, @Param('conta', UUID) conta: string) {
    return this.google.desconectar(jwt, conta);
  }
}
