import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { SCRIPT_TEMA } from '@/lib/tema.ts';
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
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1a2120' },
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
