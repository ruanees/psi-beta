import type { Icone as NomeIcone } from '@/lib/menu.ts';

// Ícones em SVG embutido, traço de 1,8px: sem fonte de ícone externa, que
// quando falha deixa botão só de ícone com 8px de largura (lição do DIME).

const TRACOS: Record<NomeIcone | 'sair' | 'tema' | 'escudo' | 'esquerda' | 'direita' | 'alerta' | 'calendario', string[]> = {
  inicio: ['M4 5h6v6H4z', 'M14 5h6v6h-6z', 'M4 15h6v4H4z', 'M14 15h6v4h-6z'],
  agenda: ['M5 6h14v14H5z', 'M5 10h14', 'M9 4v4', 'M15 4v4', 'M9 14h2', 'M13 14h2', 'M9 17h2'],
  pacientes: [
    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5',
    'M16 6.5a2.5 2.5 0 0 1 0 5',
    'M17 14.5c1.8.4 3 1.8 3.5 4.5',
  ],
  financeiro: ['M12 3v18', 'M16 7.5c-.6-1.4-2-2.2-4-2.2-2.3 0-3.8 1.2-3.8 2.9 0 4 7.8 2.1 7.8 6.2 0 1.8-1.6 3-4 3-2.1 0-3.6-.9-4.2-2.4'],
  relatorios: ['M5 19V10', 'M10 19V5', 'M15 19v-6', 'M20 19H4'],
  configuracoes: [
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.3 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  ],
  sair: ['M14 5h5v14h-5', 'M10 8l-4 4 4 4', 'M6 12h10'],
  tema: ['M12 4a8 8 0 1 0 8 8 6 6 0 0 1-8-8z'],
  escudo: ['M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z', 'M9 12l2 2 4-4'],
  esquerda: ['M14 6l-6 6 6 6'],
  direita: ['M10 6l6 6-6 6'],
  alerta: ['M12 8v5', 'M12 16.5v.5', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'],
  calendario: ['M5 6h14v14H5z', 'M5 10h14', 'M9 4v4', 'M15 4v4'],
};

export type NomeDoIcone = keyof typeof TRACOS;

export function Icone({ nome, tamanho = 20 }: { nome: NomeDoIcone; tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {TRACOS[nome].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
