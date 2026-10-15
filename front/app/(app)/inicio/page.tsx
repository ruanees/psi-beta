'use client';

import Link from 'next/link';
import { useApp } from '@/components/EstadoApp';
import { fdDe } from '@/lib/formato.ts';
import { MENU } from '@/lib/menu.ts';

// Início da Fase 0: só o que a conta já sabe sobre si. Agenda, pendências de
// sessão e cobrança entram nas fases 1 a 4.

export default function Inicio() {
  const { conta } = useApp();
  const primeiroNome = (conta.perfil?.nome ?? '').split(' ')[0];
  const pendencias = [
    !conta.perfil?.crp && { texto: 'Cadastre seu CRP. Ele sai nos recibos.', acao: 'Abrir configurações' },
    !conta.perfil?.epsiNumero && {
      texto: 'Cadastre o número do e-Psi. É exigido para atender online.',
      acao: 'Abrir configurações',
    },
    conta.perfil?.valorSessaoPadrao == null && {
      texto: 'Defina o valor padrão da sessão. Ele é usado nas cobranças.',
      acao: 'Abrir configurações',
    },
  ].filter(Boolean) as { texto: string; acao: string }[];

  return (
    <div className="pilha">
      <div className="cabecalho">
        <div>
          <h1>{primeiroNome ? `Olá, ${primeiroNome}` : 'Início'}</h1>
          <p className="mudo">{fdDe(new Date())}</p>
        </div>
      </div>

      {pendencias.length > 0 && (
        <section className="cartao">
          <h2>Para completar o cadastro</h2>
          <ul className="pilha" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {pendencias.map((p) => (
              <li key={p.texto} className="linha" data-entre>
                <span>{p.texto}</span>
                <Link className="lk" href="/configuracoes">
                  {p.acao}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="cartao">
        <h2>O que vem nas próximas versões</h2>
        <ul className="pilha" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {MENU.filter((i) => !i.pronta).map((i) => (
            <li key={i.id} className="linha" data-entre>
              <span>{i.rotulo}</span>
              <span className="em-breve">fase {i.fase}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
