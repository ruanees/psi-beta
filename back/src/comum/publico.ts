import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const CHAVE_PUBLICO = 'psi:publico';

/** Toda rota nasce fechada. Abrir é explícito, e fica escrito em cima dela. */
export const Publico = () => SetMetadata(CHAVE_PUBLICO, true);

export interface Usuario {
  id: string;
  email?: string;
  aal: 'aal1' | 'aal2';
}

export interface RequisicaoAutenticada extends Request {
  usuario?: Usuario;
  jwt?: string;
}

/** O JWT de quem chamou, para repassar ao Supabase. Só existe em rota fechada. */
export const Jwt = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<RequisicaoAutenticada>();
  if (!req.jwt) throw new Error('Jwt() usado em rota pública');
  return req.jwt;
});

export const UsuarioAtual = createParamDecorator((_: unknown, ctx: ExecutionContext): Usuario => {
  const req = ctx.switchToHttp().getRequest<RequisicaoAutenticada>();
  if (!req.usuario) throw new Error('UsuarioAtual() usado em rota pública');
  return req.usuario;
});
