'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { api, type Dto } from '@/lib/api.ts';
import { reaisParaCampo, valorEmReais } from '@/lib/campos.ts';
import { CamposDoPlano } from './CamposDoPlano';

// Plano do paciente (avulsa, pacote ou mensal). Diferente do resto da aba Dados,
// não grava no blur: tipo, sessões e valor mudam juntos, com um botão.

type Plano = Dto<'Plano'>;

interface Props {
  conta: string;
  paciente: string;
  plano: Dto<'PlanoDto'>;
  /** Valor da sessão avulsa guardado, mesmo com o paciente em outro plano. */
  valorSessao: number | null;
  valorPadrao: number | null | undefined;
  aoGravar: () => Promise<void>;
}

export function PlanoPaciente({ conta, paciente, plano, valorSessao, valorPadrao, aoGravar }: Props) {
  const [tipo, setTipo] = useState<Plano>(plano.tipo);
  const [sessoes, setSessoes] = useState(plano.sessoes?.toString() ?? '');
  const [valor, setValor] = useState(reaisParaCampo(plano.valor));
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [gravado, setGravado] = useState(false);

  const voltar = () => {
    setTipo(plano.tipo);
    setSessoes(plano.sessoes?.toString() ?? '');
    setValor(reaisParaCampo(plano.valor));
  };
  useEffect(voltar, [plano.tipo, plano.sessoes, plano.valor]);

  // Ao trocar o tipo, o valor do outro plano não serve: começa do que estava gravado para este.
  // Voltar para avulsa traz o valor da sessão que o paciente já tinha.
  const escolher = (t: Plano) => {
    setTipo(t);
    setErro(null);
    setGravado(false);
    setSessoes(t === plano.tipo ? (plano.sessoes?.toString() ?? '') : '');
    setValor(t === plano.tipo ? reaisParaCampo(plano.valor) : t === 'avulsa' ? reaisParaCampo(valorSessao) : '');
  };

  const nSessoes = sessoes.trim() ? Number(sessoes) : null;
  const nValor = valorEmReais(valor) ?? null;
  const mudou =
    tipo !== plano.tipo ||
    (tipo !== 'avulsa' && nSessoes !== plano.sessoes) ||
    nValor !== plano.valor;

  async function gravar(e: FormEvent) {
    e.preventDefault();
    setGravando(true);
    setErro(null);
    try {
      await api('put', '/contas/{conta}/pacientes/{paciente}/plano', {
        params: { conta, paciente },
        corpo: { tipo, sessoes: tipo === 'avulsa' ? null : nSessoes, valor: nValor },
      });
      await aoGravar();
      setGravado(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gravar o plano.');
    } finally {
      setGravando(false);
    }
  }

  return (
    <section className="cartao">
      <div className="cartao-topo">
        <h2>Plano</h2>
        {gravado && !mudou && <span className="mudo pequeno">Plano gravado</span>}
      </div>
      <form className="pilha" data-g="p" onSubmit={(e) => void gravar(e)}>
        <CamposDoPlano
          tipo={tipo}
          sessoes={sessoes}
          valor={valor}
          valorPadrao={valorPadrao}
          aoEscolher={escolher}
          aoMudarSessoes={setSessoes}
          aoMudarValor={setValor}
        />

        {erro && (
          <div className="aviso" data-t="erro" role="alert">
            {erro}
          </div>
        )}
        {mudou && (
          <div className="linha">
            <button className="btn" type="submit" disabled={gravando}>
              {gravando ? 'Gravando…' : 'Gravar plano'}
            </button>
            <button className="btn" data-v="sec" type="button" onClick={voltar}>
              Desfazer
            </button>
          </div>
        )}
        {tipo === 'pacote' && (
          <p className="mudo pequeno">Sessões usadas e restantes do pacote aparecem quando o Financeiro chegar (fase 3).</p>
        )}
      </form>
    </section>
  );
}
