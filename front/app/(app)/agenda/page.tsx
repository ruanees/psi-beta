'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/components/EstadoApp';
import { Icone } from '@/components/Icone';
import { LinhaSessao } from '@/components/LinhaSessao';
import { MiniCalendario } from '@/components/MiniCalendario';
import { SessaoJanela, type ModoSessao } from '@/components/SessaoJanela';
import { api, type Dto } from '@/lib/api.ts';
import {
  diaPorExtenso,
  hoje as hojeSP,
  inicioDaSemana,
  meiaNoite,
  nomeDoDia,
  numeroDoDia,
  partes,
  rotuloDaSemana,
  somarDias,
} from '@/lib/datas.ts';
import { STATUS_SESSAO } from '@/lib/status.ts';

// Agenda da semana (referência: docs/referencias/02-agenda-semana.jpg).
// Desktop: grade por hora, sessão em bloco colorido pelo status.
// Celular: faixa de dias e a lista do dia. Quem esconde é o CSS, não
// window.innerWidth — senão a primeira pintura do servidor não bate com a do navegador.

type Sessao = Dto<'SessaoAgendaDto'>;

const ALTURA_HORA = 56;

export default function Agenda() {
  const { conta } = useApp();
  const [dia, setDia] = useState<string | null>(null);
  const [sessoes, setSessoes] = useState<Sessao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [janela, setJanela] = useState<ModoSessao | null>(null);
  const [agora, setAgora] = useState<{ dia: string; minutos: number } | null>(null);

  useEffect(() => {
    setDia(hojeSP());
    const marcar = () => setAgora(partes(new Date()));
    marcar();
    const t = window.setInterval(marcar, 60_000);
    return () => window.clearInterval(t);
  }, []);

  const domingo = dia ? inicioDaSemana(dia) : null;
  const dias = useMemo(() => (domingo ? Array.from({ length: 7 }, (_, i) => somarDias(domingo, i)) : []), [domingo]);

  const carregar = useCallback(async () => {
    if (!domingo) return;
    try {
      setErro(null);
      setSessoes(
        await api('get', '/contas/{conta}/agenda', {
          params: { conta: conta.id },
          consulta: { de: meiaNoite(domingo), ate: meiaNoite(somarDias(domingo, 7)) },
        }),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar a agenda.');
    }
  }, [conta.id, domingo]);

  useEffect(() => {
    setSessoes(null);
    void carregar();
  }, [carregar]);

  const porDia = useMemo(() => {
    const m = new Map<string, Sessao[]>();
    for (const s of sessoes ?? []) {
      const d = partes(s.inicio).dia;
      m.set(d, [...(m.get(d) ?? []), s]);
    }
    return m;
  }, [sessoes]);

  // Faixa de horas: 7h às 21h, alargada se houver sessão fora dela.
  const [horaIni, horaFim] = useMemo(() => {
    let ini = 7;
    let fim = 21;
    for (const s of sessoes ?? []) {
      ini = Math.min(ini, Math.floor(partes(s.inicio).minutos / 60));
      const f = partes(s.fim);
      fim = Math.max(fim, Math.ceil((f.minutos || 24 * 60) / 60));
    }
    return [ini, Math.min(fim, 24)];
  }, [sessoes]);

  if (!dia || !domingo) return <div className="mudo">Carregando…</div>;

  const doDia = porDia.get(dia) ?? [];
  const marcados = new Set(porDia.keys());
  const abrirNova = (d: string, hora?: string) => setJanela({ tipo: 'nova', dia: d, hora });

  return (
    <div className="pilha">
      <div className="agenda-barra">
        <button className="btn" data-v="sec" onClick={() => setDia(hojeSP())}>
          Hoje
        </button>
        <div className="linha" style={{ gap: 4 }}>
          <button className="btn-icone" aria-label="Semana anterior" onClick={() => setDia(somarDias(dia, -7))}>
            <Icone nome="esquerda" />
          </button>
          <button className="btn-icone" aria-label="Próxima semana" onClick={() => setDia(somarDias(dia, 7))}>
            <Icone nome="direita" />
          </button>
        </div>
        <h1 className="agenda-titulo">{rotuloDaSemana(domingo)}</h1>
        <button className="btn agenda-nova" onClick={() => abrirNova(dia)}>
          <Icone nome="mais" tamanho={18} /> Nova sessão
        </button>
      </div>

      {erro && (
        <div className="aviso" data-t="erro" role="alert">
          {erro}
        </div>
      )}

      <div className="agenda-layout">
        <aside className="agenda-lado">
          <section className="cartao">
            <MiniCalendario selecionado={dia} aoEscolher={setDia} marcados={marcados} />
          </section>
          <section className="cartao legenda">
            <h3>Situação</h3>
            {(Object.keys(STATUS_SESSAO) as Dto<'StatusSessao'>[]).map((s) => (
              <span key={s} className="selo" data-c={STATUS_SESSAO[s].cor}>
                {STATUS_SESSAO[s].rotulo}
              </span>
            ))}
          </section>
        </aside>

        {/* Semana em grade: desktop e tablet */}
        <section className="cartao agenda" aria-busy={sessoes === null}>
          <div className="agenda-cabeca">
            <span />
            {dias.map((d) => (
              <button
                key={d}
                type="button"
                className="agenda-dia"
                aria-current={d === agora?.dia ? 'date' : undefined}
                data-escolhido={d === dia ? '' : undefined}
                onClick={() => setDia(d)}
              >
                <span>{nomeDoDia(d)}</span>
                <strong>{numeroDoDia(d)}</strong>
              </button>
            ))}
          </div>
          <div className="agenda-corpo" style={{ gridTemplateRows: `${(horaFim - horaIni) * ALTURA_HORA}px` }}>
            <div className="agenda-horas">
              {Array.from({ length: horaFim - horaIni }, (_, i) => (
                <span key={i} style={{ top: i * ALTURA_HORA }}>
                  {String(horaIni + i).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {dias.map((d) => (
              <div
                key={d}
                className="agenda-coluna"
                data-hoje={d === agora?.dia ? '' : undefined}
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return;
                  const y = e.nativeEvent.offsetY;
                  const min = horaIni * 60 + Math.floor((y / ALTURA_HORA) * 2) * 30;
                  abrirNova(d, `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
                }}
              >
                {(porDia.get(d) ?? []).map((s) => {
                  const ini = partes(s.inicio);
                  const fim = partes(s.fim);
                  const top = ((ini.minutos - horaIni * 60) / 60) * ALTURA_HORA;
                  const altura = Math.max(((fim.minutos - ini.minutos || 50) / 60) * ALTURA_HORA - 3, 22);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className="evento"
                      data-c={STATUS_SESSAO[s.status].cor}
                      data-curto={altura < 34 ? '' : undefined}
                      style={{ top, height: altura }}
                      title={`${s.pacienteNome}, ${ini.hora} – ${fim.hora}, ${STATUS_SESSAO[s.status].rotulo}`}
                      onClick={() => setJanela({ tipo: 'ver', sessao: s })}
                    >
                      <strong>{s.pacienteNome}</strong>
                      <span>
                        {ini.hora} – {fim.hora}
                        {s.modalidade === 'online' && <Icone nome="video" tamanho={13} />}
                        {s.recorrenciaId && <Icone nome="repetir" tamanho={13} />}
                      </span>
                    </button>
                  );
                })}
                {d === agora?.dia && agora.minutos >= horaIni * 60 && agora.minutos <= horaFim * 60 && (
                  <span className="agenda-agora" style={{ top: ((agora.minutos - horaIni * 60) / 60) * ALTURA_HORA }} />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Lista do dia: celular */}
        <section className="agenda-celular">
          <div className="faixa-dias" role="group" aria-label="Dias da semana">
            {dias.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={d === dia}
                data-hoje={d === agora?.dia ? '' : undefined}
                data-marcado={porDia.has(d) ? '' : undefined}
                onClick={() => setDia(d)}
              >
                <span>{nomeDoDia(d)}</span>
                <strong>{numeroDoDia(d)}</strong>
              </button>
            ))}
          </div>
          <h2>{diaPorExtenso(dia)}</h2>
          {sessoes === null ? (
            <p className="mudo">Carregando…</p>
          ) : doDia.length === 0 ? (
            <div className="vazio">
              <strong>Nenhuma sessão neste dia.</strong>
              <button className="btn" data-v="suave" onClick={() => abrirNova(dia)}>
                Agendar sessão
              </button>
            </div>
          ) : (
            <ul className="lista-sessoes">
              {doDia.map((s) => (
                <li key={s.id}>
                  <LinhaSessao sessao={s} aoAbrir={() => setJanela({ tipo: 'ver', sessao: s })} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {janela && <SessaoJanela modo={janela} aoFechar={() => setJanela(null)} aoMudar={() => void carregar()} />}
    </div>
  );
}
