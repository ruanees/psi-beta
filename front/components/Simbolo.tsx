import { useId } from 'react';

// O símbolo do Senda: duas folhas que se encontram e desenham um S. O espaço
// entre elas é a senda. Degradê Floresta → Sálvia (o único degradê da marca);
// `solido` para fundos escuros (Linho sobre Floresta) e tamanhos abaixo de 24px.

const FOLHA = 'M40 60C18 58 12 34 30 22C44 13 64 9 80 9C88 9 90 14 88 22C84 36 66 42 52 47C44 50 41 54 40 60Z';

export function Simbolo({ tamanho = 32, solido }: { tamanho?: number; solido?: string }) {
  const id = useId().replace(/:/g, '');
  const cor = solido ?? `url(#${id})`;
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {!solido && (
        <defs>
          <linearGradient id={id} x1="0.15" y1="0.9" x2="0.95" y2="0.1">
            <stop offset="0" stopColor="#173f36" />
            <stop offset="1" stopColor="#7aa588" />
          </linearGradient>
        </defs>
      )}
      <path d={FOLHA} fill={cor} />
      <path d={FOLHA} fill={cor} transform="rotate(180 50 50) translate(0 -2)" />
    </svg>
  );
}
