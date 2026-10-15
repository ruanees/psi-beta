// Padrão geométrico de quartos de círculo e folhas, como no cartão de
// saudação da referência (docs/referencias/01-dashboard.jpg). Decoração
// pura: cores de --lilas, --menta e --pervinca, nunca de status.

type Forma = 'q1' | 'q2' | 'q3' | 'q4' | 'folha' | 'folha2' | 'disco' | 'vazio';
type Cor = 'lilas' | 'menta' | 'pervinca' | 'ac';

// Uma composição fixa: mudar aqui muda a marca inteira, então muda com calma.
// Senda: só folhas (dois cantos opostos arredondados), em Areia, Sálvia e Musgo.
const MOSAICO: [Forma, Cor][][] = [
  [['folha', 'lilas'], ['folha2', 'menta'], ['vazio', 'lilas'], ['folha', 'ac']],
  [['folha2', 'pervinca'], ['vazio', 'lilas'], ['folha', 'menta'], ['folha2', 'lilas']],
  [['vazio', 'lilas'], ['folha', 'lilas'], ['folha2', 'pervinca'], ['vazio', 'menta']],
];

function caminho(forma: Forma, x: number, y: number, s: number): string | null {
  const r = s;
  switch (forma) {
    case 'q1': // canto em cima à esquerda
      return `M${x} ${y}H${x + s}A${r} ${r} 0 0 1 ${x} ${y + s}Z`;
    case 'q2': // canto em cima à direita
      return `M${x + s} ${y}V${y + s}A${r} ${r} 0 0 1 ${x} ${y}Z`;
    case 'q3': // canto embaixo à direita
      return `M${x + s} ${y + s}H${x}A${r} ${r} 0 0 1 ${x + s} ${y}Z`;
    case 'q4': // canto embaixo à esquerda
      return `M${x} ${y + s}V${y}A${r} ${r} 0 0 1 ${x + s} ${y + s}Z`;
    case 'folha': { // dois cantos opostos arredondados (grafismo do Senda)
      const k = s * 0.92;
      return `M${x + k} ${y}H${x + s}V${y + s - k}A${k} ${k} 0 0 1 ${x + s - k} ${y + s}H${x}V${y + k}A${k} ${k} 0 0 1 ${x + k} ${y}Z`;
    }
    case 'folha2': {
      const k = s * 0.92;
      return `M${x} ${y}H${x + s - k}A${k} ${k} 0 0 1 ${x + s} ${y + k}V${y + s}H${x + k}A${k} ${k} 0 0 1 ${x} ${y + s - k}Z`;
    }
    case 'disco': {
      const c = s / 2;
      return `M${x} ${y + c}A${c} ${c} 0 1 0 ${x + s} ${y + c}A${c} ${c} 0 1 0 ${x} ${y + c}Z`;
    }
    default:
      return null;
  }
}

export function Padrao({ className, lado = 44 }: { className?: string; lado?: number }) {
  const linhas = MOSAICO.length;
  const colunas = MOSAICO[0].length;
  const vao = 2;
  const largura = colunas * (lado + vao) - vao;
  const altura = linhas * (lado + vao) - vao;
  return (
    <svg className={className} viewBox={`0 0 ${largura} ${altura}`} aria-hidden="true" focusable="false">
      {MOSAICO.flatMap((linha, i) =>
        linha.map(([forma, cor], j) => {
          const d = caminho(forma, j * (lado + vao), i * (lado + vao), lado);
          return d ? <path key={`${i}-${j}`} d={d} style={{ fill: `var(--${cor})` }} /> : null;
        }),
      )}
    </svg>
  );
}
