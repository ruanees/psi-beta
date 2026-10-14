import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigFaltando } from './config';
import {
  ErroAuth,
  ErroBanco,
  ErroTransporte,
  MENSAGEM_TRANSPORTE,
  traduzirAuth,
  traduzirBanco,
  type RespostaErro,
} from './erros';
import { rotaDe } from './log.interceptor';

/** Toda resposta de erro tem a mesma forma: `{ mensagem, codigo? }`, com frase pronta para a tela. */
@Catch()
export class ErroFilter implements ExceptionFilter {
  catch(e: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const r = traduzir(e);
    // Log sem corpo, sem query, sem valor de rota: só método, padrão da rota e código.
    console.error(JSON.stringify({ erro: r.status, metodo: req.method, rota: rotaDe(req), codigo: r.codigo }));
    if (r.status >= 500 && !(e instanceof ErroTransporte) && !(e instanceof ConfigFaltando)) {
      console.error(e instanceof Error ? e.stack : String(e));
    }
    res.status(r.status).json({ mensagem: r.mensagem, ...(r.codigo ? { codigo: r.codigo } : {}) });
  }
}

export function traduzir(e: unknown): RespostaErro {
  if (e instanceof ErroTransporte) return { status: 503, mensagem: MENSAGEM_TRANSPORTE };
  if (e instanceof ConfigFaltando) {
    return { status: 503, mensagem: 'Serviço sem configuração completa. Confira o /saude.', codigo: e.nome };
  }
  if (e instanceof ErroBanco) return traduzirBanco(e);
  if (e instanceof ErroAuth) return traduzirAuth(e);
  if (e instanceof HttpException) {
    const status = e.getStatus();
    const corpo = e.getResponse();
    if (typeof corpo === 'object' && corpo && 'mensagem' in corpo) {
      return { status, ...(corpo as { mensagem: string; codigo?: string }) };
    }
    if (status === 404) return { status, mensagem: 'Caminho não encontrado.' };
    return { status, mensagem: typeof corpo === 'string' ? corpo : e.message };
  }
  return { status: 500, mensagem: 'Erro inesperado.' };
}
