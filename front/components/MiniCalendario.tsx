'use client';

import { useEffect, useState } from 'react';
import { hoje as hojeSP, inicioDaSemana, somarDias } from '@/lib/datas.ts';
import { Icone } from './Icone';

// Mini calendário do mês, semana começando no domingo, hoje marcado.
// Com `aoEscolher`, cada dia vira botão (Agenda); sem, é só leitura (Início).
// Dias são strings AAAA-MM-DD no fuso do consultório (lib/datas.ts).

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MES = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

interface Props {
  selecionado?: string;
  aoEscolher?: (dia: string) => void;
  /** Dias com sessão, para o ponto embaixo do número. */
  marcados?: Set<string>;
}

export function MiniCalendario({ selecionado, aoEscolher, marcados }: Props) {
  // Começa vazio no servidor e preenche no navegador: a data do build não é a de hoje.
  const [hoje, setHoje] = useState<string | null>(null);
  const [mes, setMes] = useState<string | null>(null); // primeiro dia do mês mostrado
  useEffect(() => {
    const h = hojeSP();
    setHoje(h);
    setMes(`${(selecionado ?? h).slice(0, 7)}-01`);
  }, [selecionado]);

  if (!hoje || !mes) return <div className="minical" style={{ minHeight: 280 }} />;

  const inicio = inicioDaSemana(mes);
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(inicio, i));
  const titulo = MES.format(new Date(`${mes}T12:00:00Z`));
  const mudar = (delta: number) => {
    const d = new Date(`${mes}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + delta, 1);
    setMes(d.toISOString().slice(0, 10));
  };

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
          const props = {
            'data-fora': d.slice(0, 7) !== mes.slice(0, 7) ? '' : undefined,
            'data-marcado': marcados?.has(d) ? '' : undefined,
            'data-escolhido': aoEscolher && d === selecionado ? '' : undefined,
            'aria-current': d === hoje ? ('date' as const) : undefined,
          };
          return aoEscolher ? (
            <button key={d} type="button" {...props} onClick={() => aoEscolher(d)} aria-label={d}>
              {Number(d.slice(8))}
            </button>
          ) : (
            <span key={d} {...props}>
              {Number(d.slice(8))}
            </span>
          );
        })}
      </div>
    </div>
  );
}
