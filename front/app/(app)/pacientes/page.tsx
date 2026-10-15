'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useApp } from '@/components/EstadoApp';
import { Icone } from '@/components/Icone';
import { iniciais } from '@/components/Moldura';
import { api, type Dto } from '@/lib/api.ts';
import { diaPorExtenso, idade, partes } from '@/lib/datas.ts';
import { SITUACAO_PACIENTE } from '@/lib/status.ts';

type Filtro = Dto<'SituacaoPaciente'> | 'todos';
const FILTROS: [Filtro, string][] = [
  ['ativo', 'Ativos'],
  ['alta', 'Alta'],
  ['arquivado', 'Arquivados'],
  ['todos', 'Todos'],
];

export default function Pacientes() {
  const { conta } = useApp();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('ativo');
  const [lista, setLista] = useState<Dto<'PacienteResumoDto'>[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Busca enquanto digita, com uma pausa para não chamar o servidor a cada tecla.
  useEffect(() => {
    let vivo = true;
    const t = window.setTimeout(() => {
      api('post', '/contas/{conta}/pacientes/buscar', {
        params: { conta: conta.id },
        corpo: { busca: busca.trim() || undefined, situacao: filtro === 'todos' ? undefined : filtro },
      })
        .then((r) => vivo && (setLista(r), setErro(null)))
        .catch((e: Error) => vivo && setErro(e.message));
    }, 250);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [conta.id, busca, filtro]);

  return (
    <div className="pilha">
      <div className="barra-lista">
        <label className="busca">
          <Icone nome="busca" tamanho={18} />
          <span className="oculto">Buscar paciente</span>
          <input
            className="ent"
            type="search"
            placeholder="Buscar por nome do paciente ou do responsável"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            autoFocus
          />
        </label>
        <div className="segmento" role="group" aria-label="Situação">
          {FILTROS.map(([f, rotulo]) => (
            <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
              {rotulo}
            </button>
          ))}
        </div>
        <Link className="btn" href="/pacientes/novo">
          <Icone nome="mais" tamanho={18} /> Novo paciente
        </Link>
      </div>

      {erro && (
        <div className="aviso" data-t="erro" role="alert">
          {erro}
        </div>
      )}

      <section className="cartao" aria-busy={lista === null}>
        {lista === null ? (
          <p className="mudo">Carregando…</p>
        ) : lista.length === 0 ? (
          <div className="vazio">
            {busca ? (
              <strong>Nenhum paciente encontrado para “{busca}”.</strong>
            ) : (
              <>
                <strong>Nenhum paciente {filtro === 'todos' ? 'cadastrado' : FILTROS.find(([f]) => f === filtro)?.[1].toLowerCase()}.</strong>
                {filtro === 'ativo' && (
                  <Link className="btn" data-v="suave" href="/pacientes/novo">
                    Cadastrar o primeiro paciente
                  </Link>
                )}
              </>
            )}
          </div>
        ) : (
          <ul className="lista lista-pacientes">
            {lista.map((p) => {
              const anos = idade(p.nascimento);
              const st = SITUACAO_PACIENTE[p.situacao];
              return (
                <li key={p.id}>
                  <Link href={`/pacientes/${p.id}`} className="paciente-linha">
                    <span className="avatar">{iniciais(p.nome)}</span>
                    <span className="paciente-linha-texto">
                      <strong>{p.nome}</strong>
                      <small className="mudo">
                        {[anos !== null ? `${anos} anos` : null, p.responsavel ? `resp. ${p.responsavel}` : null, p.telefone]
                          .filter(Boolean)
                          .join(' · ') || 'Sem contato cadastrado'}
                      </small>
                    </span>
                    <span className="paciente-linha-proxima">
                      {p.proximaSessao ? (
                        <>
                          <small className="mudo">Próxima sessão</small>
                          <span>
                            {diaPorExtenso(partes(p.proximaSessao).dia).split(',')[0]}, {partes(p.proximaSessao).hora}
                          </span>
                        </>
                      ) : (
                        p.situacao === 'ativo' && <small className="mudo">Sem sessão marcada</small>
                      )}
                    </span>
                    {p.situacao !== 'ativo' && (
                      <span className="selo" data-c={st.cor}>
                        {st.rotulo}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
