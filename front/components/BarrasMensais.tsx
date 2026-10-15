'use client';

import { useState } from 'react';

// Barras por mês, em SVG próprio. Uma medida por gráfico (nunca dois eixos);
// com duas séries, empilhadas, com legenda. Marcas finas, topo arredondado de
// 4px apoiado na base, 2px de folga entre segmentos, dica ao passar o mouse ou
// ao focar com o teclado. As cores vêm dos tokens, então o tema escuro segue.

export interface Serie {
  nome: string;
  /** Variável CSS validada para gráficos, ex. 'var(--ac)'. */
  cor: string;
}

interface Props {
  titulo: string;
  series: Serie[];
  /** Um item por mês: rótulo curto e um valor por série. */
  meses: { rotulo: string; detalhe: string; valores: number[] }[];
  formatar: (n: number) => string;
  /** Contagem: a escala só marca números inteiros. */
  inteiros?: boolean;
}

const W = 640;
const H = 220;
const M = { topo: 12, dir: 8, base: 26, esq: 56 };

/** Topo "redondo" para a escala: 1, 2, 2,5 ou 5 vezes uma potência de 10. */
export function tetoBonito(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const f of [1, 2, 2.5, 5, 10]) if (max <= f * p) return f * p;
  return 10 * p;
}

function barra(x: number, y: number, w: number, h: number, raio: number): string {
  if (h <= 0) return '';
  const r = Math.min(raio, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function BarrasMensais({ titulo, series, meses, formatar, inteiros = false }: Props) {
  const [foco, setFoco] = useState<number | null>(null);
  const larguraPlot = W - M.esq - M.dir;
  const alturaPlot = H - M.topo - M.base;
  const maior = Math.max(0, ...meses.map((m) => m.valores.reduce((a, b) => a + b, 0)));
  // Quatro faixas iguais; em contagem, cada faixa vale um número inteiro.
  const teto = inteiros ? Math.max(1, Math.ceil(tetoBonito(maior / 4))) * 4 : tetoBonito(maior);
  const passo = larguraPlot / meses.length;
  const larguraBarra = Math.max(6, Math.min(28, passo * 0.55));
  const y = (v: number) => M.topo + alturaPlot - (v / teto) * alturaPlot;
  const linhas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * teto);

  return (
    <figure className="grafico">
      <figcaption className="grafico-topo">
        <strong>{titulo}</strong>
        {series.length > 1 && (
          <span className="legenda">
            {series.map((s) => (
              <span key={s.nome}>
                <i style={{ background: s.cor }} aria-hidden="true" />
                {s.nome}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      <div className="grafico-area">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo}>
          {linhas.map((v) => (
            <g key={v}>
              <line x1={M.esq} x2={W - M.dir} y1={y(v)} y2={y(v)} className="grafico-grade" />
              <text x={M.esq - 8} y={y(v)} className="grafico-eixo" textAnchor="end" dominantBaseline="middle">
                {formatar(v)}
              </text>
            </g>
          ))}
          {meses.map((m, i) => {
            const cx = M.esq + passo * i + passo / 2;
            let acumulado = 0;
            return (
              <g key={m.detalhe}>
                {m.valores.map((v, si) => {
                  const base = acumulado;
                  acumulado += v;
                  if (v <= 0) return null;
                  const topoSegmento = y(base + v);
                  // 2px de folga entre segmentos empilhados
                  const altura = y(base) - topoSegmento - (base > 0 ? 2 : 0);
                  const ultimo = m.valores.slice(si + 1).every((x) => x <= 0);
                  return (
                    <path
                      key={si}
                      d={barra(cx - larguraBarra / 2, topoSegmento, larguraBarra, altura, ultimo ? 4 : 0)}
                      style={{ fill: series[si].cor, opacity: foco === null || foco === i ? 1 : 0.45 }}
                    />
                  );
                })}
                <text x={cx} y={H - 8} className="grafico-eixo" textAnchor="middle">
                  {m.rotulo}
                </text>
                {/* Alvo do mouse e do teclado: a coluna inteira, maior que a barra. */}
                <rect
                  x={cx - passo / 2}
                  y={M.topo}
                  width={passo}
                  height={alturaPlot}
                  className="grafico-alvo"
                  tabIndex={0}
                  aria-label={`${m.detalhe}: ${series.map((s, si) => `${s.nome} ${formatar(m.valores[si])}`).join(', ')}`}
                  onMouseEnter={() => setFoco(i)}
                  onMouseLeave={() => setFoco(null)}
                  onFocus={() => setFoco(i)}
                  onBlur={() => setFoco(null)}
                />
              </g>
            );
          })}
        </svg>
        {foco !== null && (
          <div
            className="grafico-dica"
            role="status"
            style={{
              left: `${((M.esq + passo * foco + passo / 2) / W) * 100}%`,
              top: `${(y(meses[foco].valores.reduce((a, b) => a + b, 0)) / H) * 100}%`,
            }}
          >
            <strong>{meses[foco].detalhe}</strong>
            {series.map((s, si) => (
              <span key={s.nome}>
                <i style={{ background: s.cor }} aria-hidden="true" />
                {s.nome}: {formatar(meses[foco].valores[si])}
              </span>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
