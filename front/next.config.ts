import type { NextConfig } from 'next';

// NEXT_PUBLIC_* é variável de BUILD: ela é colada no bundle, e posta só como
// variável de runtime chega tarde demais (lição do DIME). Sem ela o build para.
const API = process.env.NEXT_PUBLIC_API_URL;
if (!API) {
  throw new Error(
    'NEXT_PUBLIC_API_URL é obrigatória no build. Local: copie .env.example para .env.local. ' +
      'Cloudflare: Settings → Build → Variables and secrets (não a seção de runtime).',
  );
}
const origemApi = new URL(API).origin;
const dev = process.env.NODE_ENV !== 'production';

// O front só fala com o back. Sem curinga: cada destino é exato.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${origemApi}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const config: NextConfig = {
  poweredByHeader: false,
  // Selo do rodapé: carimbado no build, nunca escrito à mão.
  env: { NEXT_PUBLIC_PSI_VERSAO: new Date().toISOString() },
  async headers() {
    return [
      {
        source: '/:caminho*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
