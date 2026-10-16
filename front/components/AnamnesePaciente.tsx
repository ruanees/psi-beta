'use client';

import { useCallback, useEffect, useState } from 'react';
import { ANAMNESE_VAZIA, anamneseParaEnviar, resumoLaudo, resumoMedicacao, type Anamnese } from '@/lib/anamnese.ts';
import { api, type Dto } from '@/lib/api.ts';
import { fdh } from '@/lib/formato.ts';
import { CamposAnamnese } from './CamposAnamnese';
import { useApp } from './EstadoApp';

// Aba Anamnese da ficha. Dado clínico: só o psicólogo do paciente lê e grava,
// e o banco registra cada leitura. Gravar guarda a versão anterior.

function semMeta(a: Dto<'AnamneseDto'>): Anamnese {
  const { podeClinico: _p, versao: _v, alteradaEm: _a, ...resto } = a;
  return resto;
}

function useAnamnese(paciente: string) {
  const { conta } = useApp();
  const [a, setA] = useState<Dto<'AnamneseDto'> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(() => {
    api('get', '/contas/{conta}/pacientes/{paciente}/anamnese', { params: { conta: conta.id, paciente } })
      .then((r) => {
        setA(r);
        setErro(null);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível abrir a anamnese.'));
  }, [conta.id, paciente]);
  useEffect(carregar, [carregar]);
  return { a, erro, carregar };
}

export function AnamnesePaciente({ paciente }: { paciente: string }) {
  const { conta } = useApp();
  const { a, erro, carregar } = useAnamnese(paciente);
  const [form, setForm] = useState<Anamnese>(ANAMNESE_VAZIA);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ t: 'ok' | 'erro'; texto: string } | null>(null);

  useEffect(() => {
    if (a?.podeClinico) setForm(semMeta(a));
  }, [a]);

  if (erro) return <div className="aviso" data-t="erro">{erro}</div>;
  if (!a) return <p className="mudo">Abrindo a anamnese…</p>;
  if (!a.podeClinico) {
    return (
      <section className="cartao">
        <h2>Anamnese</h2>
        <p className="mudo">A anamnese é dado clínico: só aparece para o psicólogo do paciente.</p>
      </section>
    );
  }

  const mudou = JSON.stringify(anamneseParaEnviar(form)) !== JSON.stringify(anamneseParaEnviar(semMeta(a)));
  const gravar = async () => {
    setAviso(null);
    setOcupado(true);
    try {
      await api('put', '/contas/{conta}/pacientes/{paciente}/anamnese', {
        params: { conta: conta.id, paciente },
        corpo: anamneseParaEnviar(form),
      });
      setAviso({ t: 'ok', texto: 'Anamnese gravada. A versão anterior fica guardada no prontuário.' });
      carregar();
    } catch (e) {
      setAviso({ t: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível gravar.' });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="cartao pilha">
      <div className="cartao-topo">
        <h2>Anamnese</h2>
        <span className="etiqueta">Dado clínico · só você vê</span>
      </div>
      <p className="mudo pequeno">
        {a.versao
          ? `Atualizada em ${fdh(a.alteradaEm!)} · versão ${a.versao}. Cada gravação guarda a anterior.`
          : 'Ainda não preenchida. Preencha o que já souber; dá para completar ao longo das sessões.'}
      </p>
      {aviso && (
        <div className="aviso" data-t={aviso.t} role={aviso.t === 'erro' ? 'alert' : 'status'}>
          {aviso.texto}
        </div>
      )}
      <CamposAnamnese valor={form} aoMudar={setForm} completa />
      <div className="linha">
        <button type="button" className="btn" disabled={ocupado || !mudou} onClick={gravar}>
          {ocupado ? 'Gravando…' : 'Gravar anamnese'}
        </button>
        {mudou && (
          <>
            <button type="button" className="btn" data-v="leve" disabled={ocupado} onClick={() => setForm(semMeta(a))}>
              Descartar alterações
            </button>
            <small className="mudo">Há alterações não gravadas.</small>
          </>
        )}
      </div>
    </section>
  );
}

/** No Resumo: laudo e medicação de relance, com atalho para a aba. */
export function SaudeResumo({ paciente, abrir }: { paciente: string; abrir: () => void }) {
  const { a } = useAnamnese(paciente);
  if (!a?.podeClinico) return null;
  const laudo = resumoLaudo(a);
  const meds = resumoMedicacao(a);
  return (
    <section className="cartao" style={{ gridColumn: '1 / -1' }}>
      <div className="cartao-topo">
        <h2>Saúde</h2>
        <button type="button" className="btn" data-v="leve" onClick={abrir}>
          {a.versao ? 'Abrir anamnese' : 'Preencher anamnese'}
        </button>
      </div>
      {!laudo && !meds ? (
        <p className="mudo">Laudo e medicação ainda não registrados.</p>
      ) : (
        <dl className="saude-resumo">
          <div>
            <dt>Laudo</dt>
            <dd>{laudo ?? 'Não registrado.'}</dd>
          </div>
          <div>
            <dt>Medicação</dt>
            <dd>
              {!meds ? (
                'Não registrada.'
              ) : meds.length === 1 ? (
                meds[0]
              ) : (
                <ul>
                  {meds.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
