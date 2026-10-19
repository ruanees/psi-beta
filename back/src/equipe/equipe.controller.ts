import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UUID } from '../comum/pipes';
import { Jwt } from '../comum/publico';
import { PacienteDoPsicologoDto, PsicologoDto, TransferenciaDto, TransferidosDto, TransferirDto } from './equipe.dto';
import { EquipeService } from './equipe.service';

// Só o titular: quem decide é o banco (so_titular), não um guard aqui.

@ApiTags('equipe')
@ApiBearerAuth()
@Controller('contas/:conta')
export class EquipeController {
  constructor(private readonly equipe: EquipeService) {}

  /** Os psicólogos do consultório, ativos ou que saíram, com quantos pacientes cada um tem. */
  @Get('psicologos')
  @ApiOkResponse({ type: PsicologoDto, isArray: true })
  psicologos(@Jwt() jwt: string, @Param('conta', UUID) conta: string): Promise<PsicologoDto[]> {
    return this.equipe.psicologos(jwt, conta);
  }

  @Get('psicologos/:membro/pacientes')
  @ApiOkResponse({ type: PacienteDoPsicologoDto, isArray: true })
  pacientesDe(
    @Jwt() jwt: string,
    @Param('conta', UUID) conta: string,
    @Param('membro', UUID) membro: string,
  ): Promise<PacienteDoPsicologoDto[]> {
    return this.equipe.pacientesDe(jwt, conta, membro);
  }

  @Get('transferencias')
  @ApiOkResponse({ type: TransferenciaDto, isArray: true })
  transferencias(@Jwt() jwt: string, @Param('conta', UUID) conta: string): Promise<TransferenciaDto[]> {
    return this.equipe.transferencias(jwt, conta);
  }

  /** O paciente, as sessões futuras e a repetição vão para quem recebe; o passado fica com quem atendeu. */
  @Post('transferencias')
  @HttpCode(200)
  @ApiOkResponse({ type: TransferidosDto })
  async transferir(@Jwt() jwt: string, @Param('conta', UUID) conta: string, @Body() dto: TransferirDto): Promise<TransferidosDto> {
    return { transferidos: await this.equipe.transferir(jwt, conta, dto) };
  }
}
