import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UUID } from '../comum/pipes';
import { Jwt } from '../comum/publico';
import { IdDto } from '../pacientes/pacientes.dto';
import {
  AcessoDto,
  FichaClinicaDto,
  ItemHistoricoDto,
  ObservacaoDto,
  PendenciaDto,
  TextoObservacaoDto,
} from './prontuario.dto';
import { AnamneseDto, AnamneseParcialDto } from './anamnese.dto';
import { ProntuarioService } from './prontuario.service';

@ApiTags('prontuario')
@ApiBearerAuth()
@Controller('contas/:conta')
export class ProntuarioController {
  constructor(private readonly prontuario: ProntuarioService) {}

  @Get('pacientes/:paciente/anamnese')
  @ApiOkResponse({ type: AnamneseDto, description: 'Leitura auditada. Para quem não é o psicólogo do paciente, só podeClinico: false.' })
  anamnese(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Param('paciente', UUID) paciente: string) {
    return this.prontuario.anamnese(jwt, conta, paciente);
  }

  @Put('pacientes/:paciente/anamnese')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Grava só os campos enviados. A versão anterior fica guardada.' })
  gravarAnamnese(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('paciente', UUID) paciente: string,
    @Body() dto: AnamneseParcialDto,
  ) {
    return this.prontuario.gravarAnamnese(jwt, conta, paciente, dto);
  }

  @Get('sessoes/:sessao/observacao')
  @ApiOkResponse({ type: ObservacaoDto })
  observacao(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Param('sessao', UUID) sessao: string) {
    return this.prontuario.observacao(jwt, conta, sessao);
  }

  @Put('sessoes/:sessao/observacao')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Cria ou corrige. A versão anterior fica guardada.' })
  gravar(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('sessao', UUID) sessao: string,
    @Body() dto: TextoObservacaoDto,
  ) {
    return this.prontuario.gravarObservacao(jwt, conta, sessao, dto.texto);
  }

  @Post('sessoes/:sessao/adendos')
  @ApiOkResponse({ type: IdDto, description: 'Só depois de o relato travar (30 dias da sessão).' })
  adendo(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('sessao', UUID) sessao: string,
    @Body() dto: TextoObservacaoDto,
  ) {
    return this.prontuario.adendo(jwt, conta, sessao, dto.texto);
  }

  @Get('pacientes/:paciente/historico')
  @ApiOkResponse({ type: ItemHistoricoDto, isArray: true })
  historico(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Param('paciente', UUID) paciente: string) {
    return this.prontuario.historico(jwt, conta, paciente);
  }

  @Get('pacientes/:paciente/ficha-clinica')
  @ApiOkResponse({ type: FichaClinicaDto, description: 'A ficha inteira para impressão. Fica na auditoria como exportação.' })
  ficha(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Param('paciente', UUID) paciente: string) {
    return this.prontuario.ficha(jwt, conta, paciente);
  }

  @Get('pacientes/:paciente/acessos')
  @ApiOkResponse({ type: AcessoDto, isArray: true })
  acessos(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Param('paciente', UUID) paciente: string) {
    return this.prontuario.acessos(jwt, conta, paciente);
  }

  @Get('pendencias')
  @ApiOkResponse({ type: PendenciaDto, isArray: true, description: 'Sessões realizadas ainda sem relato.' })
  pendencias(@Jwt() jwt: string, @Param('conta', UUID) conta: string) {
    return this.prontuario.pendencias(jwt, conta);
  }
}
