'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Dto } from '@/lib/api.ts';
import { descricaoCobranca } from '@/lib/financeiro.ts';
import { fd, moeda } from '@/lib/formato.ts';
import { FORMA_PAGAMENTO, STATUS_COBRANCA } from '@/lib/status.ts';
import { CobrancaJanela, type AcaoCobranca } from './CobrancaJanela';

// Lista de cobranças com a ação de cada uma. Usada no Financeiro e na ficha.

type Cobranca = Dto<'CobrancaDto'>;

interface Props {
  cobrancas: Cobranca[];
  comPaciente?: boolean;
  aoMudar: () => void;
}

export function ListaCobrancas({ cobrancas, comPaciente = true, aoMudar }: Props) {
  const [aberta, setAberta] = useState<{ c: Cobranca; acao: AcaoCobranca } | null>(null);
  if (cobrancas.length === 0) return <div className="vazio">Nenhuma cobrança aqui.</div>;
  return (
    <>
      <ul className="lista cobrancas">
        {cobrancas.map((c) => {
          const st = STATUS_COBRANCA[c.situacao];
          const aberto = c.situacao === 'pendente' || c.situacao === 'vencida';
          return (
            <li key={c.id}>
              <span className="cobranca-texto">
                {comPaciente ? (
                  <Link className="lk" href={`/pacientes/${c.pacienteId}`}>
                    <strong>{c.pacienteNome}</strong>
                  </Link>
                ) : (
                  <strong>{descricaoCobranca(c)}</strong>
                )}
                <small className="mudo">
                  {comPaciente ? `${descricaoCobranca(c)} · ` : ''}
                  {c.situacao === 'paga' && c.forma && c.pagaEm
                    ? `pago em ${fd(c.pagaEm)}, ${FORMA_PAGAMENTO[c.forma]}`
                    : `vence em ${fd(c.vencimento)}`}
                  {c.motivo ? ` · ${c.motivo}` : ''}
                </small>
              </span>
              <span className="cobranca-valor num">{moeda(c.valor)}</span>
              <span className="selo" data-c={st.cor}>
                {st.rotulo}
              </span>
              <span className="cobranca-acoes">
                {aberto && c.valor === 0 && (
                  <button className="btn" data-v="leve" onClick={() => setAberta({ c, acao: 'valor' })}>
                    Definir valor
                  </button>
                )}
                {aberto && (
                  <>
                    <button className="btn" data-v="sec" onClick={() => setAberta({ c, acao: 'pagar' })}>
                      Marcar paga
                    </button>
                    <button className="btn" data-v="leve" title="Cancelar cobrança" onClick={() => setAberta({ c, acao: 'cancelar' })}>
                      Cancelar
                    </button>
                  </>
                )}
                {c.situacao === 'paga' && (
                  <button className="btn" data-v="leve" onClick={() => setAberta({ c, acao: 'desfazer' })}>
                    Desfazer
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {aberta && (
        <CobrancaJanela cobranca={aberta.c} acao={aberta.acao} aoFechar={() => setAberta(null)} aoMudar={aoMudar} />
      )}
    </>
  );
}
