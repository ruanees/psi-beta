import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

// Só o documento. Swagger UI não entra: ela vem de swagger-ui-dist, que usa
// __dirname, e no Worker o erro estoura no boot e derruba a aplicação inteira
// (lição do DIME).

let documento: OpenAPIObject | undefined;

export function gerarDocumento(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('PSI')
    .setDescription('BFF do PSI. A regra de acesso é do banco (RLS); esta API repassa o JWT de quem chama.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  documento = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controller, metodo) => `${controller.replace(/Controller$/, '')}_${metodo}`,
  });
  return documento;
}

export function documentoOpenApi(): OpenAPIObject {
  if (!documento) throw new Error('documento OpenAPI ainda não gerado');
  return documento;
}
