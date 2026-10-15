'use client';

import { useState, type FormEvent } from 'react';
import { api, type Dto } from '@/lib/api.ts';
import { reaisParaCampo, valorEmReais } from '@/lib/campos.ts';
import { hoje } from '@/lib/datas.ts';
import { descricaoCobranca } from '@/lib/financeiro.ts';
import { moeda } from '@/lib/formato.ts';
import { FORMA_PAGAMENTO } from '@/lib/status.ts';
import { useApp } from './EstadoApp';
import { Janela } from './Janela';

// Uma janela para cada ação sobre a cobrança: marcar paga (forma em lista
// fechada), desfazer pagamento ou cancelar (com motivo) e corrigir o valor.

export type AcaoCobranca = 'pagar' | 'desfazer' | 'cancelar' | 'valor';

type Cobranca = Pick<
  Dto<'CobrancaDto'>,
  'id' | 'pacienteNome' | 'valor' | 'origem' | 'sessaoInicio' | 'pacoteQuantidade' | 'referencia'
>;

const TITULO: Record<AcaoCobranca, string> = {
  pagar: 'Marcar como paga',
  desfazer: 'Desfazer pagamento',
  cancelar: 'Cancelar cobrança',
  valor: 'Corrigir valor',
};

interface Props {
  cobranca: Cobranca;
  acao: AcaoCobranca;
  aoFechar: () => void;
  aoMudar: () => void;
}

export function CobrancaJanela({ cobranca, acao, aoFechar, aoMudar }: Props) {
  const { conta } = useApp();
  const params = { conta: conta.id, cobranca: cobranca.id };
  const [forma, setForma] = useState<Dto<'FormaPagamento'> | null>(null);
  const [data, setData] = useState(hoje());
  const [motivo, setMotivo] = useState('');
  const [valor, setValor] = useState(reaisParaCampo(cobranca.valor));
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      if (acao === 'pagar') {
        if (!forma) throw new Error('Escolha a forma de pagamento.');
        await api('post', '/contas/{conta}/cobrancas/{cobranca}/pagar', { params, corpo: { forma, pagaEm: data } });
      } else if (acao === 'desfazer') {
        await api('post', '/contas/{conta}/cobrancas/{cobranca}/desfazer', { params, corpo: { motivo } });
      } else if (acao === 'cancelar') {
        await api('post', '/contas/{conta}/cobrancas/{cobranca}/cancelar', { params, corpo: { motivo } });
      } else {
        const v = valorEmReais(valor);
        if (v === undefined || Number.isNaN(v)) throw new Error('Informe o valor em reais.');
        await api('patch', '/contas/{conta}/cobrancas/{cobranca}', { params, corpo: { valor: v } });
      }
      aoMudar();
      aoFechar();
    } catch (er) {
      setErro(er instanceof Error ? er.message : 'Não foi possível concluir.');
      setOcupado(false);
    }
  }

  return (
    <Janela
      titulo={TITULO[acao]}
      subtitulo={`${cobranca.pacienteNome} · ${descricaoCobranca(cobranca)} · ${moeda(cobranca.valor)}`}
      icone="financeiro"
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" className="btn" data-v="sec" onClick={aoFechar}>
            Voltar
          </button>
          <button type="submit" form="cobranca-form" className="btn" data-v={acao === 'cancelar' ? 'perigo' : undefined} disabled={ocupado}>
            {ocupado ? 'Gravando…' : TITULO[acao]}
          </button>
        </>
      }
    >
      <form id="cobranca-form" className="pilha" data-g="p" onSubmit={(e) => void confirmar(e)}>
        {erro && (
          <div className="aviso" data-t="erro" role="alert">
            {erro}
          </div>
        )}
        {acao === 'pagar' && (
          <>
            <div className="campo">
              <span>Forma de pagamento</span>
              <div className="segmento" role="group" aria-label="Forma de pagamento">
                {(Object.keys(FORMA_PAGAMENTO) as Dto<'FormaPagamento'>[]).map((f) => (
                  <button key={f} type="button" aria-pressed={forma === f} onClick={() => setForma(f)}>
                    {FORMA_PAGAMENTO[f]}
                  </button>
                ))}
              </div>
            </div>
            <label className="campo">
              <span>Pago em</span>
              <input className="ent" type="date" max={hoje()} value={data} required onChange={(e) => setData(e.target.value)} />
            </label>
          </>
        )}
        {(acao === 'desfazer' || acao === 'cancelar') && (
          <>
            <p className="mudo">
              {acao === 'desfazer'
                ? 'A cobrança volta a ficar pendente. O motivo fica registrado.'
                : 'A cobrança deixa de ser devida, mas não é apagada: fica como cancelada, com o motivo.'}
            </p>
            <label className="campo">
              <span>Motivo</span>
              <input
                className="ent"
                value={motivo}
                required
                maxLength={300}
                placeholder={acao === 'desfazer' ? 'Ex.: lançado no paciente errado' : 'Ex.: cortesia, sessão reposta'}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </label>
          </>
        )}
        {acao === 'valor' && (
          <label className="campo">
            <span>Valor (R$)</span>
            <input className="ent" inputMode="decimal" value={valor} required onChange={(e) => setValor(e.target.value)} />
          </label>
        )}
      </form>
    </Janela>
  );
}
