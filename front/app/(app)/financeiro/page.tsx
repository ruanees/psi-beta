'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/EstadoApp';
import { Icone } from '@/components/Icone';
import { ListaCobrancas } from '@/components/ListaCobrancas';
import { Recibos } from '@/components/Recibos';
import { api, type Dto } from '@/lib/api.ts';
import { hoje } from '@/lib/datas.ts';
import { limitesDoMes, nomeDoMes } from '@/lib/financeiro.ts';
import { moeda } from '@/lib/formato.ts';
import { semAcento } from '@/lib/texto.ts';

// Financeiro: o que há para receber, o que venceu e o que entrou no mês.
// As cobranças nascem sozinhas (sessão realizada ou falta, pacote vendido,
// mensalidade do mês); aqui se marca o pagamento.

type Filtro = 'pendente' | 'vencida' | 'paga' | 'todas';

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'pendente', rotulo: 'A receber' },
  { id: 'vencida', rotulo: 'Vencidas' },
  { id: 'paga', rotulo: 'Pagas' },
  { id: 'todas', rotulo: 'Todas' },
];

export default function Financeiro() {
  const { conta } = useApp();
  const [painel, setPainel] = useState<Dto<'PainelFinanceiroDto'> | null>(null);
  const [cobrancas, setCobrancas] = useState<Dto<'CobrancaDto'>[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('pendente');
  const [mes, setMes] = useState('');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [vista, setVista] = useState<'cobrancas' | 'recibos'>('cobrancas');

  const carregar = useCallback(async () => {
    try {
      const params = { conta: conta.id };
      const consulta = {
        ...(filtro !== 'todas' && { situacao: filtro }),
        ...(mes && limitesDoMes(mes)),
      };
      const [p, l] = await Promise.all([
        api('get', '/contas/{conta}/financeiro/painel', { params }),
        api('get', '/contas/{conta}/cobrancas', { params, consulta }),
      ]);
      setPainel(p);
      setCobrancas(l);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar o financeiro.');
    }
  }, [conta.id, filtro, mes]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // O nome filtra aqui, na tela: nome de paciente não vai em URL.
  const termo = semAcento(nome.trim());
  const visiveis = (cobrancas ?? []).filter((c) => !termo || semAcento(c.pacienteNome).includes(termo));
  const total = visiveis.reduce((s, c) => s + c.valor, 0);

  return (
    <div className="pilha">
      <div className="cabecalho">
        <h1>Financeiro</h1>
      </div>

      {erro && (
        <div className="aviso" data-t="erro" role="alert">
          {erro}
        </div>
      )}

      <div className="grade" data-n="3">
        <section className="cartao">
          <div className="metrica">
            <span className="metrica-valor num">{painel ? moeda(painel.aReceber) : '–'}</span>
            <span className="metrica-rotulo">A receber</span>
            <span className="metrica-nota">Pendentes, inclusive as vencidas</span>
          </div>
        </section>
        <section className="cartao">
          <div className="metrica">
            <span className="metrica-valor num">{painel ? moeda(painel.valorVencido) : '–'}</span>
            <span className="metrica-rotulo">Vencido</span>
            <span className="metrica-nota">
              {painel ? (painel.vencidas === 1 ? '1 cobrança' : `${painel.vencidas} cobranças`) : ''}
            </span>
          </div>
        </section>
        <section className="cartao">
          <div className="metrica">
            <span className="metrica-valor num">{painel ? moeda(painel.recebidoMes) : '–'}</span>
            <span className="metrica-rotulo">Recebido no mês</span>
            <span className="metrica-nota">{nomeDoMes(hoje().slice(0, 7))}</span>
          </div>
        </section>
      </div>

      {painel && painel.pacotesAcabando.length > 0 && (
        <div className="aviso" data-t="atencao">
          <Icone nome="alerta" tamanho={18} />
          <span>
            Pacote acabando:{' '}
            {painel.pacotesAcabando.map((p, i) => (
              <span key={p.pacienteId}>
                {i > 0 && ', '}
                <Link className="lk" href={`/pacientes/${p.pacienteId}`}>
                  {p.pacienteNome}
                </Link>{' '}
                ({p.restantes === 0 ? 'nenhuma sessão' : '1 sessão'})
              </span>
            ))}
            .
          </span>
        </div>
      )}

      <nav className="abas" aria-label="Seções do financeiro">
        <button type="button" aria-current={vista === 'cobrancas' ? 'page' : undefined} onClick={() => setVista('cobrancas')}>
          Cobranças
        </button>
        <button type="button" aria-current={vista === 'recibos' ? 'page' : undefined} onClick={() => setVista('recibos')}>
          Recibos{painel && painel.semRecibo > 0 ? ` (${painel.semRecibo} a emitir)` : ''}
        </button>
      </nav>

      {vista === 'recibos' && <Recibos />}

      {vista === 'cobrancas' && (
        <section className="cartao">
          <div className="filtros">
            <div className="segmento" role="group" aria-label="Situação">
              {FILTROS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
                  {f.rotulo}
                </button>
              ))}
            </div>
            <div className="linha">
              <label className="campo campo-inline">
                <span className="oculto">Mês do vencimento</span>
                <input className="ent" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
              </label>
              {mes && (
                <button className="btn" data-v="leve" onClick={() => setMes('')}>
                  Todos os meses
                </button>
              )}
              <label className="campo campo-inline">
                <span className="oculto">Paciente</span>
                <input className="ent" placeholder="Paciente" value={nome} onChange={(e) => setNome(e.target.value)} />
              </label>
            </div>
          </div>
          {cobrancas === null && !erro ? (
            <p className="mudo">Carregando…</p>
          ) : (
            <>
              <p className="mudo pequeno">
                {visiveis.length === 1 ? '1 cobrança' : `${visiveis.length} cobranças`} · total {moeda(total)}
                {mes ? ` · vencimento em ${nomeDoMes(mes)}` : ''}
              </p>
              <ListaCobrancas cobrancas={visiveis} aoMudar={() => void carregar()} />
            </>
          )}
        </section>
      )}
    </div>
  );
}
