'use client';

import Link from 'next/link';
import { useApp } from '@/components/EstadoApp';
import { Icone } from '@/components/Icone';
import { MiniCalendario } from '@/components/MiniCalendario';
import { iniciais } from '@/components/Moldura';
import { Padrao } from '@/components/Padrao';
import { MENU } from '@/lib/menu.ts';

// Início da Fase 0: só o que a conta já sabe sobre si. Sessões do dia,
// métricas e próximos atendimentos entram com a agenda (Fase 1).
// Referência: docs/referencias/01-dashboard.jpg.

export default function Inicio() {
  const { conta } = useApp();
  const nome = conta.perfil?.nome ?? conta.nome;
  const primeiroNome = nome.split(' ')[0];

  const pendencias = [
    !conta.perfil?.crp && { titulo: 'CRP', texto: 'Ele sai nos recibos.' },
    !conta.perfil?.epsiNumero && { titulo: 'Cadastro e-Psi', texto: 'Exigido pelo CFP para atender online.' },
    conta.perfil?.valorSessaoPadrao == null && {
      titulo: 'Valor padrão da sessão',
      texto: 'Usado nas cobranças.',
    },
  ].filter(Boolean) as { titulo: string; texto: string }[];

  const total = 3;
  const feitas = total - pendencias.length;
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
              {pendencias.length === 0 ? (
                'Seu cadastro está completo.'
              ) : (
                <>
                  Faltam <strong>{pendencias.length === 1 ? '1 item' : `${pendencias.length} itens`}</strong> no seu
                  cadastro
                </>
              )}
            </p>
          </div>
          <Padrao className="saudacao-padrao" />
        </section>

        <div className="grade" data-n="3">
          <section className="cartao">
            <div className="metrica">
              <span className="metrica-valor">
                {feitas}/{total}
              </span>
              <span className="metrica-rotulo">Cadastro profissional</span>
              <div className="progresso" aria-hidden="true">
                <span style={{ width: `${(feitas / total) * 100}%` }} />
              </div>
              <span className="metrica-nota">
                {pendencias.length ? (
                  <>
                    <Icone nome="alerta" tamanho={14} /> {pendencias.length} pendente{pendencias.length > 1 ? 's' : ''}
                  </>
                ) : (
                  'Tudo preenchido'
                )}
              </span>
            </div>
          </section>
          <section className="cartao">
            <div className="metrica">
              <span className="metrica-valor">{conta.configuracoes.avisoMinimoHoras} h</span>
              <span className="metrica-rotulo">Aviso mínimo de falta</span>
              <span className="metrica-nota">Desmarcar com menos tempo conta como falta</span>
            </div>
          </section>
          <section className="cartao">
            <div className="metrica">
              <span className="metrica-valor">{conta.configuracoes.inatividadeMinutos} min</span>
              <span className="metrica-rotulo">Saída automática</span>
              <span className="metrica-nota">Sem uso por esse tempo, o PSI fecha a sessão</span>
            </div>
          </section>
        </div>

        {pendencias.length > 0 && (
          <section className="cartao">
            <div className="cartao-topo">
              <h2>Para completar o cadastro</h2>
              <Link className="btn" data-v="suave" href="/configuracoes">
                Abrir configurações
              </Link>
            </div>
            <ul className="lista">
              {pendencias.map((p) => (
                <li key={p.titulo}>
                  <div>
                    <strong>{p.titulo}</strong>
                    <div className="mudo pequeno">{p.texto}</div>
                  </div>
                  <span className="selo" data-c="at">
                    Pendente
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="trilho">
        <section className="cartao">
          <MiniCalendario />
        </section>
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
      </aside>
    </div>
  );
}
