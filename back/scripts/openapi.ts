import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { criarApp } from '../src/criar-app';
import { documentoOpenApi } from '../src/openapi';

// Grava back/openapi.json. Ele é versionado: o front gera os tipos a partir
// deste arquivo, e a CI confere que ele bate com o código (git diff --exit-code).
// O documento não depende de banco — sobe a aplicação sem configuração nenhuma.
async function gerar() {
  const app = await criarApp();
  const destino = join(__dirname, '..', '..', 'openapi.json');
  writeFileSync(destino, `${JSON.stringify(documentoOpenApi(), null, 2)}\n`);
  await app.close();
  console.log(`openapi.json gravado em ${destino}`);
}

void gerar();
