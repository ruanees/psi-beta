'use client';

import { useEffect, useState } from 'react';
import { BarrasMensais } from '@/components/BarrasMensais';
import { useApp } from '@/components/EstadoApp';
import { api, type Dto } from '@/lib/api.ts';
import { hoje } from '@/lib/datas.ts';
import { csv, nomeDoMes } from '@/lib/financeiro.ts';
import { moeda } from '@/lib/formato.ts';

// Relatórios: o mês escolhido em números e os 12 meses até ele em gráfico e
// tabela. Exporta a tabela em CSV (abre no Excel) e imprime sem a moldura.

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const curto = (iso: string) => {
  const [a, m] = iso.split('-').map(Number);
  return `${MESES_CURTOS[m - 1]}/${String(a).slice(2)}`;
};
const pct = (n: number) => `${Math.round(n * 100)}%`;
const taxa = (faltas: number, realizadas: number) => (faltas + realizadas === 0 ? 0 : faltas / (faltas + realizadas));
const reaisCurto = (n: number) => (n >= 1000 ? `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : moeda(n));

export default function Relatorios() {
  const { conta } = useApp();
  const [mes, setMes] = useState(() => hoje().slice(0, 7));
  const [r, setR] = useState<Dto<'RelatorioMensalDto'> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(mes)) return;
    api('get', '/contas/{conta}/relatorios/mensal', { params: { conta: conta.id }, consulta: { mes } })
      .then((x) => {
        setR(x);
        setErro(null);
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Erro ao montar o relatório.'));
  }, [conta.id, mes]);

  function exportar() {
    if (!r) return;
    const linhas: (string | number)[][] = [
      ['Mês', 'Sessões realizadas', 'Faltas', 'Taxa de falta', 'Recebido (R$)'],
      ...r.porMes.map((m) => [nomeDoMes(m.mes.slice(0, 7)), String(m.realizadas), String(m.faltas), pct(taxa(m.faltas, m.realizadas)), m.recebido]),
    ];
    const url = URL.createObjectURL(new Blob([csv(linhas)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `psi-relatorio-${mes}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const cartoes = r
    ? [
        { valor: String(r.realizadas), rotulo: 'Sessões realizadas', nota: `${r.online} online` },
        { valor: pct(taxa(r.faltas, r.realizadas)), rotulo: 'Taxa de falta', nota: `${r.faltas} faltas · ${r.desmarcadas} desmarcadas` },
        { valor: String(r.pacientesAtendidos), rotulo: 'Pacientes atendidos', nota: `${r.pacientesNovos} novos no mês` },
        { valor: moeda(r.recebido), rotulo: 'Recebido', nota: 'Pela data do pagamento' },
        { valor: moeda(r.aReceber), rotulo: 'A receber', nota: 'Pendentes com vencimento no mês' },
      ]
    : [];

  return (
    <div className="pilha impressao">
      <div className="cabecalho">
        <h1>Relatórios</h1>
        <div className="linha nao-imprimir">
          <label className="campo campo-inline">
            <span className="oculto">Mês</span>
            <input className="ent" type="month" value={mes} max={hoje().slice(0, 7)} onChange={(e) => setMes(e.target.value)} />
          </label>
          <button className="btn" data-v="sec" disabled={!r} onClick={exportar}>
            Exportar planilha
          </button>
          <button className="btn" data-v="sec" disabled={!r} onClick={() => window.print()}>
            Imprimir
          </button>
        </div>
      </div>
      <p className="mudo">{/^\d{4}-\d{2}$/.test(mes) ? nomeDoMes(mes) : ''}</p>

      {erro && (
        <div className="aviso" data-t="erro" role="alert">
          {erro}
        </div>
      )}
      {!r && !erro && <p className="mudo">Montando o relatório…</p>}

      {r && (
        <>
          <div className="grade" data-n="5">
            {cartoes.map((c) => (
              <section key={c.rotulo} className="cartao">
                <div className="metrica">
                  <span className="metrica-valor num">{c.valor}</span>
                  <span className="metrica-rotulo">{c.rotulo}</span>
                  <span className="metrica-nota">{c.nota}</span>
                </div>
              </section>
            ))}
          </div>

          <div className="grade" data-n="2">
            <section className="cartao">
              <BarrasMensais
                titulo="Recebido por mês"
                series={[{ nome: 'Recebido', cor: 'var(--graf-1)' }]}
                meses={r.porMes.map((m) => ({ rotulo: curto(m.mes), detalhe: nomeDoMes(m.mes.slice(0, 7)), valores: [m.recebido] }))}
                formatar={reaisCurto}
              />
            </section>
            <section className="cartao">
              <BarrasMensais
                titulo="Sessões por mês"
                series={[
                  { nome: 'Realizadas', cor: 'var(--graf-1)' },
                  { nome: 'Faltas', cor: 'var(--graf-falta)' },
                ]}
                meses={r.porMes.map((m) => ({
                  rotulo: curto(m.mes),
                  detalhe: nomeDoMes(m.mes.slice(0, 7)),
                  valores: [m.realizadas, m.faltas],
                }))}
                formatar={(n) => String(Math.round(n))}
                inteiros
              />
            </section>
          </div>

          <section className="cartao">
            <h2>Mês a mês</h2>
            <div className="tabela-rola">
              <table className="tabela">
                <thead>
                  <tr>
                    <th scope="col">Mês</th>
                    <th scope="col">Realizadas</th>
                    <th scope="col">Faltas</th>
                    <th scope="col">Taxa de falta</th>
                    <th scope="col">Recebido</th>
                  </tr>
                </thead>
                <tbody>
                  {[...r.porMes].reverse().map((m) => (
                    <tr key={m.mes} aria-current={m.mes === r.mes ? 'true' : undefined}>
                      <th scope="row">{nomeDoMes(m.mes.slice(0, 7))}</th>
                      <td className="num">{m.realizadas}</td>
                      <td className="num">{m.faltas}</td>
                      <td className="num">{pct(taxa(m.faltas, m.realizadas))}</td>
                      <td className="num">{moeda(m.recebido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
