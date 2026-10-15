'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/EstadoApp';
import { Icone } from '@/components/Icone';
import { LinhaSessao } from '@/components/LinhaSessao';
import { MiniCalendario } from '@/components/MiniCalendario';
import { iniciais } from '@/components/Moldura';
import { Padrao } from '@/components/Padrao';
import { SessaoJanela, type ModoSessao } from '@/components/SessaoJanela';
import { api, type Dto } from '@/lib/api.ts';
import { diaPorExtenso, hoje, partes } from '@/lib/datas.ts';
import { fd, moeda } from '@/lib/formato.ts';
import { MENU } from '@/lib/menu.ts';
import { nomeDaChamada } from '@/lib/sala.ts';

// Início: o dia de hoje, a semana e quem está sem próxima sessão.
// Referência: docs/referencias/01-dashboard.jpg.

export default function Inicio() {
  const { conta } = useApp();
  const [painel, setPainel] = useState<Dto<'PainelDto'> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [janela, setJanela] = useState<ModoSessao | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [semObservacao, setSemObservacao] = useState<Dto<'PendenciaDto'>[]>([]);
  const [financeiro, setFinanceiro] = useState<Dto<'PainelFinanceiroDto'> | null>(null);

  const carregar = useCallback(async () => {
    try {
      const params = { conta: conta.id };
      // Pendência é extra: se falhar, o resto do Início aparece mesmo assim.
      const pend = api('get', '/contas/{conta}/pendencias', { params }).catch(() => []);
      const fin = api('get', '/contas/{conta}/financeiro/painel', { params }).catch(() => null);
      setPainel(await api('get', '/contas/{conta}/painel', { params }));
      setSemObservacao(await pend);
      setFinanceiro(await fin);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar o início.');
    }
  }, [conta.id]);

  useEffect(() => {
    setDia(hoje());
    void carregar();
  }, [carregar]);

  const nome = conta.perfil?.nome ?? conta.nome;
  const primeiroNome = nome.split(' ')[0];
  const pendencias = [
    !conta.perfil?.crp && 'CRP',
    !conta.perfil?.epsiNumero && 'cadastro e-Psi',
    conta.perfil?.valorSessaoPadrao == null && 'valor padrão da sessão',
  ].filter(Boolean) as string[];
  const nHoje = painel?.hoje.length ?? 0;
  const restantes = painel?.hoje.filter((s) => new Date(s.fim).getTime() > Date.now() && s.status !== 'falta').length ?? 0;
  const proximas = MENU.filter((i) => !i.pronta);

  return (
    <div className="com-trilho">
      <div className="pilha">
        <section className="saudacao">
          <span className="avatar" data-t="g" aria-hidden="true">
            {iniciais(nome)}
          </span>
          <div className="saudacao-texto">
            <h1>
              Olá, <strong>{primeiroNome}</strong>
            </h1>
            <p>
              {painel === null ? (
                ' '
              ) : nHoje === 0 ? (
                'Nenhuma sessão marcada para hoje.'
              ) : (
                <>
                  Você tem <strong>{restantes === 1 ? '1 sessão' : `${restantes} sessões`}</strong> pela frente hoje
                </>
              )}
            </p>
          </div>
          <Padrao className="saudacao-padrao" />
        </section>

        {erro && (
          <div className="aviso" data-t="erro" role="alert">
            {erro}
          </div>
        )}

        <div className="grade" data-n="3">
          <section className="cartao">
            <div className="metrica">
              <span className="metrica-valor">{painel ? nHoje : '–'}</span>
              <span className="metrica-rotulo">Sessões hoje</span>
              <span className="metrica-nota">{dia ? diaPorExtenso(dia) : ''}</span>
            </div>
          </section>
          <section className="cartao">
            <div className="metrica">
              <span className="metrica-valor">{painel?.sessoesSemana ?? '–'}</span>
              <span className="metrica-rotulo">Nesta semana</span>
              <span className="metrica-nota">De domingo a sábado, sem as desmarcadas</span>
            </div>
          </section>
          <section className="cartao">
            <div className="metrica">
              <span className="metrica-valor">{painel?.pacientesAtivos ?? '–'}</span>
              <span className="metrica-rotulo">Pacientes ativos</span>
              <span className="metrica-nota">
                {painel && painel.semProxima.length > 0 ? (
                  <>
                    <Icone nome="alerta" tamanho={14} /> {painel.semProxima.length} sem próxima sessão
                  </>
                ) : (
                  'Todos com sessão marcada'
                )}
              </span>
            </div>
          </section>
        </div>

        {painel?.proximaOnline && <ProximaOnline sessao={painel.proximaOnline} abrir={(s) => setJanela({ tipo: 'ver', sessao: s })} />}

        <section className="cartao">
          <div className="cartao-topo">
            <h2>Hoje</h2>
            <div className="linha">
              <Link className="btn" data-v="leve" href="/agenda">
                Abrir agenda
              </Link>
              <button className="btn" data-v="suave" onClick={() => dia && setJanela({ tipo: 'nova', dia })}>
                <Icone nome="mais" tamanho={18} /> Nova sessão
              </button>
            </div>
          </div>
          {painel === null ? (
            <p className="mudo">Carregando…</p>
          ) : nHoje === 0 ? (
            <div className="vazio">Nenhuma sessão hoje.</div>
          ) : (
            <ul className="lista-sessoes">
              {painel.hoje.map((s) => (
                <li key={s.id}>
                  <LinhaSessao sessao={s} aoAbrir={() => setJanela({ tipo: 'ver', sessao: s })} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {financeiro && (financeiro.aReceber > 0 || financeiro.semRecibo > 0 || financeiro.pacotesAcabando.length > 0) && (
          <section className="cartao">
            <div className="cartao-topo">
              <h2>Financeiro</h2>
              <Link className="btn" data-v="leve" href="/financeiro">
                Abrir financeiro
              </Link>
            </div>
            <div className="grade" data-n="3">
              <div className="metrica">
                <span className="metrica-valor num">{moeda(financeiro.aReceber)}</span>
                <span className="metrica-rotulo">A receber</span>
              </div>
              <div className="metrica">
                <span className="metrica-valor num">{financeiro.vencidas}</span>
                <span className="metrica-rotulo">{financeiro.vencidas === 1 ? 'Cobrança vencida' : 'Cobranças vencidas'}</span>
              </div>
              <div className="metrica">
                <span className="metrica-valor num">{moeda(financeiro.recebidoMes)}</span>
                <span className="metrica-rotulo">Recebido no mês</span>
              </div>
            </div>
            {financeiro.semRecibo > 0 && (
              <p className="mudo pequeno">
                <Icone nome="alerta" tamanho={14} />{' '}
                {financeiro.semRecibo === 1 ? '1 pagamento recebido' : `${financeiro.semRecibo} pagamentos recebidos`} sem recibo no
                Receita Saúde.{' '}
                <Link className="lk" href="/financeiro">
                  Ver recibos
                </Link>
              </p>
            )}
            {financeiro.pacotesAcabando.length > 0 && (
              <p className="mudo pequeno">
                <Icone nome="alerta" tamanho={14} /> Pacote acabando:{' '}
                {financeiro.pacotesAcabando.map((p) => `${p.pacienteNome} (${p.restantes === 0 ? 'nenhuma' : '1'})`).join(', ')}
              </p>
            )}
          </section>
        )}

        {semObservacao.length > 0 && (
          <section className="cartao">
            <div className="cartao-topo">
              <h2>Observações pendentes</h2>
              <span className="mudo pequeno">Sessões realizadas ainda sem observação</span>
            </div>
            <ul className="lista-sessoes">
              {semObservacao.map((s) => {
                const dias = Math.ceil((new Date(s.editavelAte).getTime() - Date.now()) / 864e5);
                return (
                  <li key={s.id}>
                    <LinhaSessao sessao={s} aoAbrir={() => setJanela({ tipo: 'ver', sessao: s })} />
                    <small className="mudo">
                      {diaPorExtenso(partes(s.inicio).dia)} ·{' '}
                      {dias > 0 ? `pode ser escrita até ${fd(s.editavelAte)}` : 'travada: entra como adendo'}
                    </small>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {painel && painel.semProxima.length > 0 && (
          <section className="cartao">
            <div className="cartao-topo">
              <h2>Sem próxima sessão</h2>
              <span className="mudo pequeno">Pacientes ativos sem nada marcado</span>
            </div>
            <ul className="lista">
              {painel.semProxima.map((p) => (
                <li key={p.id}>
                  <Link className="paciente-linha" href={`/pacientes/${p.id}`}>
                    <span className="avatar">{iniciais(p.nome)}</span>
                    <span className="paciente-linha-texto">
                      <strong>{p.nome}</strong>
                      <small className="mudo">
                        {p.ultimaSessao ? `Última sessão em ${fd(p.ultimaSessao)}` : 'Ainda sem sessão'}
                      </small>
                    </span>
                  </Link>
                  <button className="btn" data-v="sec" onClick={() => setJanela({ tipo: 'nova', paciente: { id: p.id, nome: p.nome } })}>
                    Agendar
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {pendencias.length > 0 && (
          <div className="aviso" data-t="atencao">
            <Icone nome="alerta" tamanho={18} />
            <span>
              Falta no seu cadastro: {pendencias.join(', ')}.{' '}
              <Link className="lk" href="/configuracoes">
                Completar em Configurações
              </Link>
            </span>
          </div>
        )}
      </div>

      <aside className="trilho">
        <section className="cartao">
          <MiniCalendario marcados={new Set((painel?.hoje ?? []).map((s) => partes(s.inicio).dia))} />
        </section>
        {proximas.length > 0 && (
          <section className="cartao">
            <h2>Próximas versões</h2>
            <ul className="lista">
              {proximas.map((i) => (
                <li key={i.id}>
                  <span className="linha" style={{ gap: 10 }}>
                    <span className="ladrilho" aria-hidden="true">
                      <Icone nome={i.icone} />
                    </span>
                    <strong>{i.rotulo}</strong>
                  </span>
                  <span className="etiqueta">Fase {i.fase}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>

      {janela && <SessaoJanela modo={janela} aoFechar={() => setJanela(null)} aoMudar={() => void carregar()} />}
    </div>
  );
}

function ProximaOnline({ sessao, abrir }: { sessao: Dto<'ProximaOnlineDto'>; abrir: (s: Dto<'ProximaOnlineDto'>) => void }) {
  const ini = partes(sessao.inicio);
  const fim = partes(sessao.fim);
  const ehHoje = ini.dia === hoje();
  return (
    <section className="cartao proxima-online">
      <span className="proxima-online-icone" aria-hidden="true">
        <Icone nome="video" tamanho={22} />
      </span>
      <div className="proxima-online-texto">
        <span className="metrica-rotulo">Próxima sessão online</span>
        <strong>{sessao.pacienteNome}</strong>
        <span className="mudo">
          {ehHoje ? 'Hoje' : diaPorExtenso(ini.dia)}, {ini.hora} – {fim.hora}
        </span>
      </div>
      <div className="linha">
        <button className="btn" data-v="sec" onClick={() => abrir(sessao)}>
          Abrir sessão
        </button>
        {sessao.link ? (
          <a className="btn" href={sessao.link} target="_blank" rel="noopener noreferrer">
            <Icone nome="video" tamanho={16} /> {nomeDaChamada(sessao.link)}
          </a>
        ) : (
          <span className="etiqueta">Sem link da chamada</span>
        )}
      </div>
    </section>
  );
}
