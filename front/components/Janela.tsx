'use client';

import { useEffect, useRef } from 'react';
import { Icone, type NomeDoIcone } from './Icone';

// Janela sobre a tela (referência: docs/referencias/03-resumo-paciente.jpg):
// cabeçalho com ícone em ladrilho, corpo que rola, rodapé com as ações.
// Esc e clique fora fecham; o foco entra na janela ao abrir.

interface Props {
  titulo: string;
  subtitulo?: string;
  icone?: NomeDoIcone;
  aoFechar: () => void;
  rodape?: React.ReactNode;
  children: React.ReactNode;
}

export function Janela({ titulo, subtitulo, icone = 'agenda', aoFechar, rodape, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('keydown', tecla);
      anterior?.focus?.();
    };
  }, [aoFechar]);

  return (
    <div className="janela-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="janela" role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} ref={ref}>
        <div className="janela-cabeca">
          <span className="ladrilho" aria-hidden="true">
            <Icone nome={icone} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2>{titulo}</h2>
            {subtitulo && <div className="mudo pequeno">{subtitulo}</div>}
          </div>
          <button className="btn-icone" aria-label="Fechar" onClick={aoFechar}>
            <Icone nome="fechar" tamanho={18} />
          </button>
        </div>
        <div className="janela-corpo">{children}</div>
        {rodape && <div className="janela-pe">{rodape}</div>}
      </div>
    </div>
  );
}
