'use client';

import { useEffect, useRef } from 'react';

// Saída automática por inatividade. Confere pela hora da última atividade, não
// por um setTimeout longo: aba em segundo plano tem o relógio estrangulado
// pelo navegador, e o timer dispararia horas depois.

const EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

export function useInatividade(minutos: number, aoExpirar: () => void): void {
  const ultima = useRef(Date.now());
  const callback = useRef(aoExpirar);
  callback.current = aoExpirar;

  useEffect(() => {
    const marcar = () => {
      ultima.current = Date.now();
    };
    const conferir = () => {
      if (Date.now() - ultima.current >= minutos * 60_000) callback.current();
    };
    EVENTOS.forEach((e) => window.addEventListener(e, marcar, { passive: true }));
    document.addEventListener('visibilitychange', conferir);
    const relogio = window.setInterval(conferir, 15_000);
    return () => {
      EVENTOS.forEach((e) => window.removeEventListener(e, marcar));
      document.removeEventListener('visibilitychange', conferir);
      window.clearInterval(relogio);
    };
  }, [minutos]);
}
