import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AgendaController } from './agenda/agenda.controller';
import { AgendaService } from './agenda/agenda.service';
import { AutenticacaoGuard } from './comum/autenticacao.guard';
import { ContasController } from './contas/contas.controller';
import { ContasService } from './contas/contas.service';
import { FinanceiroController } from './financeiro/financeiro.controller';
import { FinanceiroService } from './financeiro/financeiro.service';
import { GoogleController } from './google/google.controller';
import { GoogleService } from './google/google.service';
import { PacientesController } from './pacientes/pacientes.controller';
import { PacientesService } from './pacientes/pacientes.service';
import { ProntuarioController } from './prontuario/prontuario.controller';
import { ProntuarioService } from './prontuario/prontuario.service';
import { SalaController } from './sala/sala.controller';
import { SalaService } from './sala/sala.service';
import { SaudeController } from './saude/saude.controller';
import { SessaoController } from './sessao/sessao.controller';
import { GoTrueService } from './supabase/gotrue.service';
import { SupabaseService } from './supabase/supabase.service';

@Module({
  controllers: [SaudeController, SessaoController, ContasController, PacientesController, AgendaController, ProntuarioController, FinanceiroController, SalaController, GoogleController],
  providers: [
    SupabaseService,
    GoTrueService,
    ContasService,
    PacientesService,
    AgendaService,
    ProntuarioService,
    FinanceiroService,
    SalaService,
    GoogleService,
    { provide: APP_GUARD, useClass: AutenticacaoGuard },
  ],
})
export class AppModule {}
