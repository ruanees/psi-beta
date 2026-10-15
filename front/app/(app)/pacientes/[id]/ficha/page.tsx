'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useApp } from '@/components/EstadoApp';
import { api, type Dto } from '@/lib/api.ts';
import { cpfFormatado } from '@/lib/campos.ts';
import { partes } from '@/lib/datas.ts';
import { fd, fdh } from '@/lib/formato.ts';
import { resumoPlano } from '@/lib/planos.ts';
import { MODALIDADE, STATUS_SESSAO } from '@/lib/status.ts';

// A ficha inteira para imprimir ou salvar em PDF: atende o pedido de acesso do
// paciente (LGPD) e o de outro profissional ou da Justiça. Abrir esta página
// fica na auditoria como exportação — é o banco que registra, não a tela.

export default function FichaParaImpressao() {
  const { id } = useParams<{ id: string }>();
  const { conta } = useApp();
  const [f, setF] = useState<Dto<'FichaClinicaDto'> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api('get', '/contas/{conta}/pacientes/{paciente}/ficha-clinica', { params: { conta: conta.id, paciente: id } })
      .then(setF)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Não foi possível montar a ficha.'));
  }, [conta.id, id]);

  if (erro) {
    return (
      <div className="pilha">
        <Link className="lk pequeno" href={`/pacientes/${id}`}>
          ← Voltar à ficha
        </Link>
        <div className="aviso" data-t="erro">
          {erro}
        </div>
      </div>
    );
  }
  if (!f) return <p className="mudo">Montando a ficha…</p>;

  const p = f.paciente;
  return (
    <div className="pilha impressao">
      <div className="linha nao-imprimir" data-entre>
        <Link className="lk pequeno" href={`/pacientes/${id}`}>
          ← Voltar à ficha
        </Link>
        <button className="btn" onClick={() => window.print()}>
          Imprimir ou salvar PDF
        </button>
      </div>

      <section className="cartao">
        <div className="cartao-topo">
          <h1>Ficha do paciente</h1>
          <small className="mudo">Emitida em {fdh(f.emitidaEm)}</small>
        </div>
        {f.profissional && (
          <p>
            Psicólogo(a): <strong>{f.profissional.nome}</strong>
            {f.profissional.crp ? ` · CRP ${f.profissional.crp}` : ''}
          </p>
        )}
        <dl className="dados-ficha">
          <dt>Nome</dt>
          <dd>{p.nome}</dd>
          <dt>Nascimento</dt>
          <dd>{fd(p.nascimento)}</dd>
          <dt>CPF</dt>
          <dd>{cpfFormatado(p.cpf) || '—'}</dd>
          <dt>Telefone</dt>
          <dd>{p.telefone || '—'}</dd>
          <dt>Responsáveis</dt>
          <dd>
            {p.responsaveis.length === 0
              ? '—'
              : p.responsaveis.map((r) => [r.nome, r.parentesco, r.telefone].filter(Boolean).join(', ')).join('; ')}
          </dd>
          <dt>Plano</dt>
          <dd>{resumoPlano(p.plano, conta.perfil?.valorSessaoPadrao)}</dd>
          <dt>Em atendimento desde</dt>
          <dd>{fd(p.criadoEm)}</dd>
          <dt>Consentimento LGPD</dt>
          <dd>{fd(p.consentimentoEm)}</dd>
        </dl>
        <h2>Queixa principal</h2>
        <p className="observacao-texto">{p.queixaPrincipal || 'Não registrada.'}</p>
      </section>

      <section className="cartao">
        <h2>
          Sessões ({p.contagem.realizadas} realizadas, {p.contagem.faltas} faltas, {p.contagem.canceladas} desmarcadas)
        </h2>
        {f.sessoes.length === 0 ? (
          <p className="mudo">Nenhuma sessão até hoje.</p>
        ) : (
          <ol className="sessoes-ficha">
            {f.sessoes.map((s) => {
              const ini = partes(s.inicio);
              return (
                <li key={s.id}>
                  <strong>
                    {fd(ini.dia)}, {ini.hora}
                  </strong>{' '}
                  <span className="mudo">
                    · {STATUS_SESSAO[s.status].rotulo} · {MODALIDADE[s.modalidade]}
                  </span>
                  {s.observacao && <p className="observacao-texto">{s.observacao}</p>}
                  {s.adendos.map((a, i) => (
                    <p key={i} className="observacao-texto">
                      <em>Adendo de {fd(a.criadoEm)}:</em> {a.texto}
                    </p>
                  ))}
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <p className="mudo pequeno">
        Documento sigiloso. Prontuário psicológico guardado por no mínimo 5 anos (Resolução CFP 001/2009).
      </p>
    </div>
  );
}
