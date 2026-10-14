import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { tap, type Observable } from 'rxjs';

/**
 * O log nunca leva corpo, query nem valor de parâmetro: só o método, o
 * padrão da rota (`/contas/:conta`) e o status. Dado de paciente não chega
 * ao log do Worker por nenhum caminho.
 */
@Injectable()
export class LogInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const inicio = Date.now();
    const req = ctx.switchToHttp().getRequest<Request>();
    return next.handle().pipe(
      tap(() => {
        const res = ctx.switchToHttp().getResponse<Response>();
        console.log(JSON.stringify({ metodo: req.method, rota: rotaDe(req), status: res.statusCode, ms: Date.now() - inicio }));
      }),
    );
  }
}

export function rotaDe(req: Request): string {
  const padrao = (req.route as { path?: string } | undefined)?.path;
  return typeof padrao === 'string' ? padrao : '(sem rota)';
}
