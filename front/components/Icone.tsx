import type { Icone as NomeIcone } from '@/lib/menu.ts';

// Ícones em SVG embutido: sem fonte de ícone externa, que quando falha deixa
// botão só de ícone com 8px de largura (lição do DIME).

const TRACOS: Record<NomeIcone | 'sair' | 'tema' | 'escudo', string[]> = {
  inicio: ['M4 11.5 12 5l8 6.5', 'M6 10v9h12v-9', 'M10 19v-5h4v5'],
  agenda: ['M5 6h14v14H5z', 'M5 10h14', 'M9 4v4', 'M15 4v4'],
  pacientes: ['M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5', 'M16 6.5a2.5 2.5 0 0 1 0 5', 'M17 14.5c1.8.4 3 1.8 3.5 4.5'],
  financeiro: ['M4 7h16v11H4z', 'M4 11h16', 'M8 15h3'],
  relatorios: ['M5 19V9', 'M10 19V5', 'M15 19v-7', 'M20 19H4'],
  configuracoes: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M12 3v2', 'M12 19v2', 'M3 12h2', 'M19 12h2', 'M5.6 5.6 7 7', 'M17 17l1.4 1.4', 'M5.6 18.4 7 17', 'M17 7l1.4-1.4'],
  sair: ['M14 5h5v14h-5', 'M10 8l-4 4 4 4', 'M6 12h10'],
  tema: ['M12 4a8 8 0 1 0 8 8 6 6 0 0 1-8-8z'],
  escudo: ['M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z', 'M9 12l2 2 4-4'],
};

export function Icone({ nome, tamanho = 20 }: { nome: keyof typeof TRACOS; tamanho?: number }) {
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
    >
      {TRACOS[nome].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
