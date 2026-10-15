'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type Dto } from '@/lib/api.ts';
import { moeda } from '@/lib/formato.ts';
import { useApp } from './EstadoApp';
import { ListaCobrancas } from './ListaCobrancas';

// Aba Financeiro da ficha: todas as cobranças do paciente, com o que falta pagar.

export function FinanceiroPaciente({ paciente, recarga }: { paciente: string; recarga: number }) {
  const { conta } = useApp();
  const [cobrancas, setCobrancas] = useState<Dto<'CobrancaDto'>[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setCobrancas(
        await api('get', '/contas/{conta}/cobrancas', { params: { conta: conta.id }, consulta: { paciente } }),
      );
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar as cobranças.');
    }
  }, [conta.id, paciente]);

  useEffect(() => {
    void carregar();
  }, [carregar, recarga]);

  const aberto = (cobrancas ?? []).filter((c) => c.situacao === 'pendente' || c.situacao === 'vencida');
  const devido = aberto.reduce((s, c) => s + c.valor, 0);

  return (
    <section className="cartao">
      <div className="cartao-topo">
        <h2>Financeiro</h2>
        {cobrancas && (
          <span className="mudo pequeno">
            {aberto.length === 0 ? 'Nada pendente' : `${moeda(devido)} a receber em ${aberto.length === 1 ? '1 cobrança' : `${aberto.length} cobranças`}`}
          </span>
        )}
      </div>
      {erro && (
        <div className="aviso" data-t="erro" role="alert">
          {erro}
        </div>
      )}
      {cobrancas === null && !erro ? (
        <p className="mudo">Carregando…</p>
      ) : (
        <ListaCobrancas cobrancas={cobrancas ?? []} comPaciente={false} aoMudar={() => void carregar()} />
      )}
    </section>
  );
}
