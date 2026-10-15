'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type Dto } from '@/lib/api.ts';
import { fd, moeda } from '@/lib/formato.ts';
import { FORMA_PAGAMENTO, STATUS_COBRANCA } from '@/lib/status.ts';
import { CobrancaJanela } from './CobrancaJanela';
import { useApp } from './EstadoApp';

// Na janela da sessão: o que ela consumiu. "Sessão 3 de 10 do pacote", ou a
// cobrança dela com o botão de marcar paga. Mensal não mostra nada.

export function FinanceiroDaSessao({ sessao, paciente }: { sessao: string; paciente: string }) {
  const { conta } = useApp();
  const [f, setF] = useState<Dto<'SessaoFinanceiroDto'> | null>(null);
  const [pagando, setPagando] = useState(false);

  const carregar = useCallback(() => {
    api('get', '/contas/{conta}/sessoes/{sessao}/financeiro', { params: { conta: conta.id, sessao } })
      .then(setF)
      .catch(() => setF(null));
  }, [conta.id, sessao]);

  useEffect(carregar, [carregar]);

  if (!f || (!f.pacote && !f.cobranca)) return null;
  if (f.pacote) {
    return (
      <p className="linha">
        <span className="etiqueta" data-v="ac">
          Sessão {f.pacote.numero} de {f.pacote.quantidade} do pacote
        </span>
      </p>
    );
  }
  const cb = f.cobranca!;
  const st = STATUS_COBRANCA[cb.situacao];
  const aberta = cb.situacao === 'pendente' || cb.situacao === 'vencida';
  return (
    <div className="linha">
      <span className="selo" data-c={st.cor}>
        {st.rotulo}
      </span>
      <span>
        {moeda(cb.valor)}
        <small className="mudo">
          {cb.situacao === 'paga' && cb.forma && cb.pagaEm ? ` · pago em ${fd(cb.pagaEm)}, ${FORMA_PAGAMENTO[cb.forma]}` : ` · vence em ${fd(cb.vencimento)}`}
        </small>
      </span>
      {aberta && (
        <button type="button" className="btn" data-v="sec" onClick={() => setPagando(true)}>
          Marcar paga
        </button>
      )}
      {pagando && (
        <CobrancaJanela
          cobranca={{ id: cb.id, pacienteNome: paciente, valor: cb.valor, origem: 'sessao', sessaoInicio: null, pacoteQuantidade: null, referencia: null }}
          acao="pagar"
          aoFechar={() => setPagando(false)}
          aoMudar={carregar}
        />
      )}
    </div>
  );
}
