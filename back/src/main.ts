import { criarApp } from './criar-app';

// Ponto de entrada no Node (npm run dev). No Cloudflare quem entra é worker.mjs.
async function iniciar() {
  const app = await criarApp();
  const porta = Number(process.env.PORT ?? 3001);
  await app.listen(porta);
  console.log(`psi-back em http://localhost:${porta} — /saude, /openapi.json`);
}

void iniciar();
