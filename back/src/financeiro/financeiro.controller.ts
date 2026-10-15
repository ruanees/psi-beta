import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UUID } from '../comum/pipes';
import { Jwt } from '../comum/publico';
import { IdDto } from '../pacientes/pacientes.dto';
import {
  CobrancaDto,
  FiltroCobrancasDto,
  MotivoDto,
  NovoPacoteDto,
  PacoteDto,
  PagarDto,
  PainelFinanceiroDto,
  SessaoFinanceiroDto,
  ValorCobrancaDto,
} from './financeiro.dto';
import { FinanceiroService } from './financeiro.service';

@ApiTags('financeiro')
@ApiBearerAuth()
@Controller('contas/:conta')
export class FinanceiroController {
  constructor(private readonly financeiro: FinanceiroService) {}

  @Get('financeiro/painel')
  @ApiOkResponse({ type: PainelFinanceiroDto })
  painel(@Jwt() jwt: string, @Param('conta', UUID) conta: string) {
    return this.financeiro.painel(jwt, conta);
  }

  @Get('cobrancas')
  @ApiOkResponse({ type: CobrancaDto, isArray: true, description: 'Gera antes a mensalidade do mês de quem é do plano mensal.' })
  cobrancas(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Query() filtro: FiltroCobrancasDto) {
    return this.financeiro.cobrancas(jwt, conta, filtro);
  }

  @Post('cobrancas/:cobranca/pagar')
  @HttpCode(204)
  @ApiNoContentResponse()
  pagar(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('cobranca', UUID) cobranca: string,
    @Body() dto: PagarDto,
  ) {
    return this.financeiro.pagar(jwt, conta, cobranca, dto.forma, dto.pagaEm);
  }

  @Post('cobrancas/:cobranca/desfazer')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Volta uma cobrança paga para pendente, com motivo.' })
  desfazer(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('cobranca', UUID) cobranca: string,
    @Body() dto: MotivoDto,
  ) {
    return this.financeiro.desfazer(jwt, conta, cobranca, dto.motivo);
  }

  @Post('cobrancas/:cobranca/cancelar')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Dispensa uma cobrança pendente, com motivo. Não apaga.' })
  cancelar(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('cobranca', UUID) cobranca: string,
    @Body() dto: MotivoDto,
  ) {
    return this.financeiro.cancelar(jwt, conta, cobranca, dto.motivo);
  }

  @Patch('cobrancas/:cobranca')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Corrige o valor de uma cobrança pendente.' })
  valor(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('cobranca', UUID) cobranca: string,
    @Body() dto: ValorCobrancaDto,
  ) {
    return this.financeiro.valor(jwt, conta, cobranca, dto.valor);
  }

  @Get('pacientes/:paciente/pacotes')
  @ApiOkResponse({ type: PacoteDto, isArray: true })
  pacotes(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Param('paciente', UUID) paciente: string) {
    return this.financeiro.pacotes(jwt, conta, paciente);
  }

  @Post('pacientes/:paciente/pacotes')
  @ApiOkResponse({ type: IdDto, description: 'Vende um pacote; a cobrança do valor inteiro nasce junto.' })
  novoPacote(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('paciente', UUID) paciente: string,
    @Body() dto: NovoPacoteDto,
  ) {
    return this.financeiro.novoPacote(jwt, conta, paciente, dto);
  }

  @Get('sessoes/:sessao/financeiro')
  @ApiOkResponse({ type: SessaoFinanceiroDto })
  daSessao(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Param('sessao', UUID) sessao: string) {
    return this.financeiro.daSessao(jwt, conta, sessao);
  }
}
