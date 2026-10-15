import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { extrairBearer, verificarJwt } from './jwt';
import { CHAVE_PUBLICO, type RequisicaoAutenticada } from './publico';

/**
 * Guard global: valida o JWT e o deixa na requisição para ser repassado ao
 * Supabase. Não decide quem vê o quê — isso é da RLS, no banco.
 */
@Injectable()
export class AutenticacaoGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(CHAVE_PUBLICO, [ctx.getHandler(), ctx.getClass()]);
    if (publico) return true;
    const req = ctx.switchToHttp().getRequest<RequisicaoAutenticada>();
    const token = extrairBearer(req.headers.authorization);
    if (!token) throw new UnauthorizedException('Entre para continuar.');
    req.usuario = await verificarJwt(token);
    req.jwt = token;
    return true;
  }
}
