import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UUID } from '../comum/pipes';
import { Jwt } from '../comum/publico';
import { IdDto } from '../pacientes/pacientes.dto';
import {
  AlterarSessaoDto,
  DesmarcarDto,
  DesmarcarRespostaDto,
  ExcluirSessaoDto,
  ExclusaoDto,
  NovaSessaoDto,
  PainelDto,
  PeriodoDto,
  RemovidasDto,
  SessaoAgendaDto,
  SessaoDoPacienteDto,
  StatusSessaoDto,
} from './agenda.dto';
import { AgendaService } from './agenda.service';

@ApiTags('agenda')
@ApiBearerAuth()
@Controller('contas/:conta')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get('agenda')
  @ApiOkResponse({ type: SessaoAgendaDto, isArray: true })
  listar(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Query() periodo: PeriodoDto) {
    return this.agenda.listar(jwt, conta, periodo.de, periodo.ate);
  }

  @Get('painel')
  @ApiOkResponse({ type: PainelDto })
  painel(@Jwt() jwt: string, @Param('conta', UUID) conta: string) {
    return this.agenda.painel(jwt, conta);
  }

  @Get('pacientes/:paciente/sessoes')
  @ApiOkResponse({ type: SessaoDoPacienteDto, isArray: true })
  doPaciente(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Param('paciente', UUID) paciente: string) {
    return this.agenda.doPaciente(jwt, conta, paciente);
  }

  @Post('sessoes')
  @ApiOkResponse({ type: IdDto })
  criar(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Body() dto: NovaSessaoDto) {
    return this.agenda.criar(jwt, conta, dto);
  }

  @Patch('sessoes/:sessao')
  @ApiOkResponse({ type: IdDto, description: 'Com escopo `proximas`, o id da nova primeira sessão.' })
  alterar(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('sessao', UUID) sessao: string,
    @Body() dto: AlterarSessaoDto,
  ) {
    return this.agenda.alterar(jwt, conta, sessao, dto);
  }

  @Post('sessoes/:sessao/status')
  @HttpCode(204)
  @ApiNoContentResponse()
  status(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('sessao', UUID) sessao: string,
    @Body() dto: StatusSessaoDto,
  ) {
    return this.agenda.status(jwt, conta, sessao, dto.status);
  }

  @Post('sessoes/:sessao/desmarcar')
  @HttpCode(200)
  @ApiOkResponse({ type: DesmarcarRespostaDto })
  desmarcar(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('sessao', UUID) sessao: string,
    @Body() dto: DesmarcarDto,
  ) {
    return this.agenda.desmarcar(jwt, conta, sessao, dto);
  }

  @Delete('sessoes/:sessao')
  @ApiOkResponse({
    type: ExclusaoDto,
    description: 'Para sessão marcada por engano: some sem contar como falta. Com relato ou pagamento, o banco recusa.',
  })
  excluir(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('sessao', UUID) sessao: string,
    @Query() dto: ExcluirSessaoDto,
  ) {
    return this.agenda.excluir(jwt, conta, sessao, dto.escopo);
  }

  @Post('sessoes/:sessao/encerrar-repeticao')
  @HttpCode(200)
  @ApiOkResponse({ type: RemovidasDto })
  encerrarRepeticao(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Param('sessao', UUID) sessao: string) {
    return this.agenda.encerrarRepeticao(jwt, conta, sessao);
  }
}
