'use client';

import { useState } from 'react';
import { api, type Dto } from '@/lib/api.ts';
import { fdh } from '@/lib/formato.ts';
import { useApp } from './EstadoApp';

// Quem acessou a ficha e quando, a partir da auditoria (que só cresce).
// Abre sob pedido: é consulta de controle, não algo para carregar sempre.

const ACAO: Record<Dto<'AcaoAuditoria'>, string> = {
  ler: 'Leu',
  criar: 'Criou',
  editar: 'Alterou',
  arquivar: 'Arquivou',
  exportar: 'Exportou',
  excluir: 'Excluiu',
};

const O_QUE: Record<string, string> = {
  pacientes: 'a ficha',
  observacoes: 'observação',
  adendos: 'adendo',
  sessoes: 'sessão',
  recorrencias: 'repetição',
  responsaveis: 'responsável',
};

export function AcessosPaciente({ paciente }: { paciente: string }) {
  const { conta } = useApp();
  const [acessos, setAcessos] = useState<Dto<'AcessoDto'>[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function abrir() {
    setCarregando(true);
    try {
      setAcessos(await api('get', '/contas/{conta}/pacientes/{paciente}/acessos', { params: { conta: conta.id, paciente } }));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler os acessos.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <section className="cartao">
      <div className="cartao-topo">
        <h2>Quem acessou a ficha</h2>
        {acessos === null && (
          <button type="button" className="btn" data-v="sec" disabled={carregando} onClick={() => void abrir()}>
            {carregando ? 'Carregando…' : 'Ver acessos'}
          </button>
        )}
      </div>
      {erro && <p className="mudo">{erro}</p>}
      {acessos !== null &&
        (acessos.length === 0 ? (
          <p className="mudo">Nenhum acesso registrado.</p>
        ) : (
          <ul className="lista">
            {acessos.map((a, i) => (
              <li key={i}>
                <span>
                  <strong>{a.quem}</strong> <span className="mudo">{ACAO[a.acao].toLowerCase()} {O_QUE[a.tabela] ?? a.tabela}</span>
                </span>
                <small className="mudo num">{fdh(a.em)}</small>
              </li>
            ))}
          </ul>
        ))}
      <p className="mudo pequeno">Os últimos 100 registros da auditoria deste paciente. Ninguém apaga nem altera.</p>
    </section>
  );
}
