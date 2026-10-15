'use client';

import { useEffect, useState } from 'react';
import { Icone } from './Icone';

// Mini calendário do mês, semana começando no domingo, hoje marcado.
// Na Fase 1 ele passa a marcar os dias com sessão e a abrir a agenda do dia.

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
// Sem timeZone: as datas daqui já são dias de calendário locais, e formatá-las
// em outro fuso empurra o dia 1 para o mês anterior.
const MES = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

/** Hoje no fuso do consultório, como data local de calendário. */
function hojeSaoPaulo(): Date {
  const [a, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).split('-');
  return new Date(Number(a), Number(m) - 1, Number(d));
}

export function MiniCalendario() {
  // Começa vazio no servidor e preenche no navegador: a data do build não é a de hoje.
  const [hoje, setHoje] = useState<Date | null>(null);
  const [mes, setMes] = useState<Date | null>(null);
  useEffect(() => {
    const h = hojeSaoPaulo();
    setHoje(h);
    setMes(new Date(h.getFullYear(), h.getMonth(), 1));
  }, []);

  if (!hoje || !mes) return <div className="minical" style={{ minHeight: 280 }} />;

  const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1 - mes.getDay());
  const dias = Array.from({ length: 42 }, (_, i) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
  const titulo = MES.format(mes);
  const mudar = (delta: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + delta, 1));

  return (
    <div className="minical">
      <div className="minical-topo">
        <strong>{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</strong>
        <div className="linha" style={{ gap: 4 }}>
          <button className="btn-icone" aria-label="Mês anterior" onClick={() => mudar(-1)}>
            <Icone nome="esquerda" tamanho={18} />
          </button>
          <button className="btn-icone" aria-label="Próximo mês" onClick={() => mudar(1)}>
            <Icone nome="direita" tamanho={18} />
          </button>
        </div>
      </div>
      <div className="minical-grade">
        {DIAS.map((d) => (
          <abbr key={d} title={d}>
            {d}
          </abbr>
        ))}
        {dias.map((d) => {
          const eHoje = d.getTime() === hoje.getTime();
          return (
            <span
              key={d.getTime()}
              data-fora={d.getMonth() !== mes.getMonth() ? '' : undefined}
              aria-current={eHoje ? 'date' : undefined}
            >
              {d.getDate()}
            </span>
          );
        })}
      </div>
    </div>
  );
}
