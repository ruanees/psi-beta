import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AutenticacaoGuard } from './comum/autenticacao.guard';
import { ContasController } from './contas/contas.controller';
import { ContasService } from './contas/contas.service';
import { SaudeController } from './saude/saude.controller';
import { SessaoController } from './sessao/sessao.controller';
import { GoTrueService } from './supabase/gotrue.service';
import { SupabaseService } from './supabase/supabase.service';

@Module({
  controllers: [SaudeController, SessaoController, ContasController],
  providers: [SupabaseService, GoTrueService, ContasService, { provide: APP_GUARD, useClass: AutenticacaoGuard }],
})
export class AppModule {}
