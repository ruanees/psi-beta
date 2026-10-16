'use client';

import { RESPOSTA, RESPOSTAS, TEMAS, type Anamnese, type Medicacao, type Resposta } from '@/lib/anamnese.ts';
import { Icone } from './Icone';

// Os campos da anamnese, num formulário só para o cadastro e para a aba
// Anamnese da ficha. Laudo e medicação vêm sempre; os temas em texto livre,
// quando `completa`.

const MED_VAZIA: Medicacao = { nome: '', dose: null, frequencia: null, prescritor: null };

function Pergunta({
  rotulo,
  valor,
  aoMudar,
}: {
  rotulo: string;
  valor: Resposta | null;
  aoMudar: (r: Resposta | null) => void;
}) {
  return (
    <div className="campo">
      <span>{rotulo}</span>
      <div className="segmento" role="group" aria-label={rotulo}>
        {RESPOSTAS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={valor === r}
            // Clicar de novo na resposta marcada desmarca: "não respondido" é diferente de "não".
            onClick={() => aoMudar(valor === r ? null : r)}
          >
            {RESPOSTA[r]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CamposAnamnese({
  valor: a,
  aoMudar,
  completa,
}: {
  valor: Anamnese;
  aoMudar: (a: Anamnese) => void;
  completa: boolean;
}) {
  const mudar = (p: Partial<Anamnese>) => aoMudar({ ...a, ...p });
  const mudarMed = (i: number, p: Partial<Medicacao>) =>
    mudar({ medicacoes: a.medicacoes.map((m, j) => (j === i ? { ...m, ...p } : m)) });

  return (
    <div className="pilha anamnese">
      <div className="anamnese-bloco">
        <Pergunta rotulo="Possui laudo ou diagnóstico?" valor={a.laudo} aoMudar={(laudo) => mudar({ laudo })} />
        {a.laudo === 'sim' && (
          <label className="campo">
            <span>Qual laudo, quem emitiu e quando</span>
            <textarea
              className="ent"
              rows={3}
              maxLength={2000}
              value={a.laudoDescricao ?? ''}
              placeholder="Ex.: TDAH (CID F90), neuropediatra Dra. Lima, março de 2024."
              onChange={(e) => mudar({ laudoDescricao: e.target.value })}
            />
          </label>
        )}
      </div>

      <div className="anamnese-bloco">
        <Pergunta
          rotulo="Toma alguma medicação?"
          valor={a.medicacao}
          aoMudar={(medicacao) =>
            mudar({ medicacao, medicacoes: medicacao === 'sim' && a.medicacoes.length === 0 ? [{ ...MED_VAZIA }] : a.medicacoes })
          }
        />
        {a.medicacao === 'sim' && (
          <div className="pilha" data-g="p">
            {a.medicacoes.map((m, i) => (
              <div key={i} className="anamnese-med">
                <label className="campo">
                  <span>Medicamento</span>
                  <input
                    className="ent"
                    value={m.nome}
                    maxLength={120}
                    placeholder="Nome"
                    onChange={(e) => mudarMed(i, { nome: e.target.value })}
                  />
                </label>
                <label className="campo">
                  <span>Dose</span>
                  <input className="ent" value={m.dose ?? ''} maxLength={120} placeholder="10 mg" onChange={(e) => mudarMed(i, { dose: e.target.value })} />
                </label>
                <label className="campo">
                  <span>Quando toma</span>
                  <input
                    className="ent"
                    value={m.frequencia ?? ''}
                    maxLength={120}
                    placeholder="De manhã"
                    onChange={(e) => mudarMed(i, { frequencia: e.target.value })}
                  />
                </label>
                <label className="campo">
                  <span>Quem receitou</span>
                  <input
                    className="ent"
                    value={m.prescritor ?? ''}
                    maxLength={120}
                    placeholder="Psiquiatra, neurologista…"
                    onChange={(e) => mudarMed(i, { prescritor: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="btn-icone"
                  aria-label={`Remover ${m.nome || 'medicamento'}`}
                  onClick={() => mudar({ medicacoes: a.medicacoes.filter((_, j) => j !== i) })}
                >
                  <Icone nome="lixo" tamanho={18} />
                </button>
              </div>
            ))}
            {a.medicacoes.length < 30 && (
              <button type="button" className="btn" data-v="suave" onClick={() => mudar({ medicacoes: [...a.medicacoes, { ...MED_VAZIA }] })}>
                <Icone nome="mais" tamanho={18} /> Adicionar medicamento
              </button>
            )}
          </div>
        )}
      </div>

      {completa &&
        TEMAS.map((t) => (
          <label key={t.campo} className="campo">
            <span>{t.rotulo}</span>
            <textarea
              className="ent"
              rows={3}
              maxLength={4000}
              value={a[t.campo] ?? ''}
              placeholder={t.dica}
              onChange={(e) => mudar({ [t.campo]: e.target.value } as Partial<Anamnese>)}
            />
          </label>
        ))}
    </div>
  );
}
