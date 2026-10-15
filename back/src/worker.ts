import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { definirFonteWorker } from './comum/config';
import { criarApp } from './criar-app';

// No Workers, o Nest roda atrás de um http.createServer comum (flag
// enable_nodejs_http_server_modules) que o httpServerHandler de worker.mjs liga
// ao fetch. A aplicação sobe na primeira requisição, não no escopo global.

export function iniciarServidor(env: Record<string, unknown>, porta: number): void {
  definirFonteWorker(env);
  const instancia = express();
  let pronta: Promise<void> | undefined;

  const servidor = createServer((req: IncomingMessage, res: ServerResponse) => {
    pronta ??= criarApp(new ExpressAdapter(instancia)).then(() => undefined);
    pronta.then(
      () => instancia(req, res),
      (e: unknown) => {
        // Falha ao subir não fica presa: a próxima requisição tenta de novo.
        pronta = undefined;
        console.error(e instanceof Error ? e.stack : String(e));
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ mensagem: 'O serviço não conseguiu iniciar. Confira o /saude.' }));
      },
    );
  });
  servidor.listen(porta);
}
