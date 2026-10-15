import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { SCRIPT_TEMA } from '@/lib/tema.ts';
// Fontes empacotadas no build: nada de Google Fonts em tempo de execução (CSP font-src 'self').
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource-variable/dm-sans/wght.css';
import '@/styles/tokens.css';
import '@/styles/components.css';

export const metadata: Metadata = {
  title: 'PSI',
  description: 'Gestão de consultório de psicologia',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f4fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1124' },
  ],
};

export default function RaizLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        {/* Antes da primeira pintura: sem isto, o tema escuro pisca claro a cada carga. */}
        <Script id="tema" strategy="beforeInteractive">
          {SCRIPT_TEMA}
        </Script>
        {children}
      </body>
    </html>
  );
}
