import 'reflect-metadata';
import { BadRequestException, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { origensPermitidas } from './comum/config';
import { ErroFilter } from './comum/erro.filter';
import { LogInterceptor } from './comum/log.interceptor';
import { gerarDocumento } from './openapi';

/** Monta a aplicação igual para Node (local, testes) e para o Worker. */
export async function criarApp(adapter: ExpressAdapter = new ExpressAdapter()): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, adapter, { logger: ['error', 'warn'] });

  app.enableCors({
    origin: (origem: string | undefined, responder: (erro: Error | null, permitir?: boolean) => void) =>
      responder(null, !origem || origensPermitidas().includes(origem)),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  });

  // Dado de saúde nunca fica em cache de intermediário nem de navegador.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (erros) => {
        const campos = erros.map((e) => e.property);
        const estranhos = erros.filter((e) => e.constraints?.whitelistValidation).map((e) => e.property);
        if (estranhos.length) {
          return new BadRequestException({
            mensagem: `Campo não aceito: ${estranhos.join(', ')}.`,
            codigo: 'validacao',
            campos,
          });
        }
        // As mensagens em português são as escritas nos DTOs; as do class-validator vêm em inglês.
        const primeira = erros.flatMap((e) => Object.values(e.constraints ?? {}))[0];
        const legivel = primeira && /^[A-ZÀ-Ú]/.test(primeira) ? primeira : `Confira: ${campos.join(', ')}.`;
        return new BadRequestException({ mensagem: legivel, codigo: 'validacao', campos });
      },
    }),
  );
  app.useGlobalFilters(new ErroFilter());
  app.useGlobalInterceptors(new LogInterceptor());
  app.getHttpAdapter().getInstance().disable?.('x-powered-by');

  gerarDocumento(app);
  await app.init();
  return app;
}
