// Ponto de entrada do Cloudflare Worker. É JavaScript puro de propósito: o
// esbuild do wrangler não emite metadado de decorator, então quem compila o
// Nest é o tsc (npm run build) e o wrangler só empacota o dist/.
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import { iniciarServidor } from './dist/src/worker.js';

const PORTA = 8080;
iniciarServidor(env, PORTA);

export default httpServerHandler({ port: PORTA });
