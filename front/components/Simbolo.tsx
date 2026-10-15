import { useId } from 'react';

// O símbolo do Senda: duas folhas que se encontram e desenham um S. O espaço
// entre elas é a senda. Degradê Floresta → Sálvia em cada folha (o único
// degradê da marca); `solido` para fundos escuros (Linho sobre Floresta).
// Desenho traçado sobre a arte do brandbook, nas coordenadas dela.

const FOLHA_ALTA =
  'M498 754C415 750 332 668 334 560C338 450 420 360 530 315C630 275 740 260 800 258C835 258 846 275 845 305' +
  'C843 360 825 415 780 455C735 495 680 512 630 535C565 566 520 610 508 670C503 700 506 725 507 738C507 750 504 754 498 754Z';
const FOLHA_BAIXA =
  'M430 1011C520 1013 675 996 780 944C858 898 918 800 918 690C918 600 868 551 780 549C700 549 655 600 625 660' +
  'C595 720 560 770 505 800C440 835 400 895 395 960C393 995 405 1010 430 1011Z';
const SIMBOLO_VIEWBOX = '241 250 770 770';

export function Simbolo({ tamanho = 32, solido }: { tamanho?: number; solido?: string }) {
  const id = useId().replace(/:/g, '');
  const cor = solido ?? `url(#${id})`;
  return (
    <svg width={tamanho} height={tamanho} viewBox={SIMBOLO_VIEWBOX} aria-hidden="true" focusable="false">
      {!solido && (
        <defs>
          <linearGradient id={id} x1="0.1" y1="0.9" x2="0.95" y2="0.1">
            <stop offset="0" stopColor="#173f36" />
            <stop offset="1" stopColor="#7aa588" />
          </linearGradient>
        </defs>
      )}
      <path d={FOLHA_ALTA} fill={cor} />
      <path d={FOLHA_BAIXA} fill={cor} />
    </svg>
  );
}
