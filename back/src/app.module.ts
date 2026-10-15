import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AgendaController } from './agenda/agenda.controller';
import { AgendaService } from './agenda/agenda.service';
import { AutenticacaoGuard } from './comum/autenticacao.guard';
import { ContasController } from './contas/contas.controller';
import { ContasService } from './contas/contas.service';
import { PacientesController } from './pacientes/pacientes.controller';
import { PacientesService } from './pacientes/pacientes.service';
import { SaudeController } from './saude/saude.controller';
import { SessaoController } from './sessao/sessao.controller';
import { GoTrueService } from './supabase/gotrue.service';
import { SupabaseService } from './supabase/supabase.service';

@Module({
  controllers: [SaudeController, SessaoController, ContasController, PacientesController, AgendaController],
  providers: [
    SupabaseService,
    GoTrueService,
    ContasService,
    PacientesService,
    AgendaService,
    { provide: APP_GUARD, useClass: AutenticacaoGuard },
  ],
})
export class AppModule {}
