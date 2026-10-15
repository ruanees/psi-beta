import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UUID } from '../comum/pipes';
import { Jwt } from '../comum/publico';
import {
  BuscaPacientesDto,
  IdDto,
  NovoPacienteDto,
  NovoResponsavelDto,
  PacienteDto,
  PacienteParcialDto,
  PacienteResumoDto,
  ResponsavelParcialDto,
  SituacaoDto,
} from './pacientes.dto';
import { PacientesService } from './pacientes.service';

@ApiTags('pacientes')
@ApiBearerAuth()
@Controller('contas/:conta/pacientes')
export class PacientesController {
  constructor(private readonly pacientes: PacientesService) {}

  /** Lista e busca. POST porque a busca leva nome de paciente, que não vai em URL. */
  @Post('buscar')
  @HttpCode(200)
  @ApiOkResponse({ type: PacienteResumoDto, isArray: true })
  buscar(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Body() dto: BuscaPacientesDto) {
    return this.pacientes.listar(jwt, conta, dto);
  }

  @Post()
  @ApiOkResponse({ type: IdDto })
  criar(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Body() dto: NovoPacienteDto) {
    return this.pacientes.criar(jwt, conta, dto);
  }

  @Get(':paciente')
  @ApiOkResponse({ type: PacienteDto })
  ler(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Param('paciente', UUID) paciente: string) {
    return this.pacientes.ler(jwt, conta, paciente);
  }

  @Patch(':paciente')
  @HttpCode(204)
  @ApiNoContentResponse()
  gravar(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('paciente', UUID) paciente: string,
    @Body() dto: PacienteParcialDto,
  ) {
    return this.pacientes.gravar(jwt, conta, paciente, dto);
  }

  @Post(':paciente/situacao')
  @HttpCode(204)
  @ApiNoContentResponse()
  situacao(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('paciente', UUID) paciente: string,
    @Body() dto: SituacaoDto,
  ) {
    return this.pacientes.situacao(jwt, conta, paciente, dto.situacao);
  }

  @Post(':paciente/responsaveis')
  @ApiOkResponse({ type: IdDto })
  novoResponsavel(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('paciente', UUID) paciente: string,
    @Body() dto: NovoResponsavelDto,
  ) {
    return this.pacientes.salvarResponsavel(jwt, conta, paciente, null, dto);
  }

  @Patch(':paciente/responsaveis/:responsavel')
  @HttpCode(204)
  @ApiNoContentResponse()
  async gravarResponsavel(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('paciente', UUID) paciente: string,
    @Param('responsavel', UUID) responsavel: string,
    @Body() dto: ResponsavelParcialDto,
  ): Promise<void> {
    await this.pacientes.salvarResponsavel(jwt, conta, paciente, responsavel, dto);
  }

  @Delete(':paciente/responsaveis/:responsavel')
  @HttpCode(204)
  @ApiNoContentResponse()
  removerResponsavel(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('paciente', UUID) paciente: string,
    @Param('responsavel', UUID) responsavel: string,
  ) {
    return this.pacientes.removerResponsavel(jwt, conta, paciente, responsavel);
  }
}
