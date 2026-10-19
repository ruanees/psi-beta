'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icone';
import { Simbolo } from '@/components/Simbolo';
import { api, ErroApi, type Dto } from '@/lib/api.ts';
import { trocarPara, URL_BACKOFFICE } from '@/lib/contexto.ts';
import { caminhoDeSaida, gravarSessao, lerSessao } from '@/lib/sessao.ts';

// Escolha de contexto, como no DIME: quem opera a plataforma e também atende
// escolhe por onde seguir. Dá para trocar depois, no menu da conta. Quem não
// opera a plataforma nem vê esta tela (lib/contexto.ts, destinoDepoisDeEntrar).

type Carga = { etapa: 'carregando' } | { etapa: 'pronta'; eu: Dto<'EuDto'> } | { etapa: 'erro'; mensagem: string };

export default function Perfil() {
  const router = useRouter();
  const [carga, setCarga] = useState<Carga>({ etapa: 'carregando' });

  useEffect(() => {
    if (!lerSessao()) return void router.replace('/');
    api('get', '/eu').then(
      (eu) => (eu.super ? setCarga({ etapa: 'pronta', eu }) : router.replace('/inicio')),
      (e: unknown) => {
        if (e instanceof ErroApi && (e.status === 401 || e.codigo === 'segundo_fator')) {
          gravarSessao(null);
          return router.replace(caminhoDeSaida('expirou'));
        }
        setCarga({ etapa: 'erro', mensagem: e instanceof Error ? e.message : 'Erro ao carregar.' });
      },
    );
  }, [router]);

  const sair = async () => {
    await api('post', '/sessao/sair').catch(() => undefined);
    gravarSessao(null);
    router.replace('/');
  };

  if (carga.etapa === 'carregando') {
    return (
      <main className="solta mudo" aria-busy="true">
        Carregando…
      </main>
    );
  }
  if (carga.etapa === 'erro') {
    return (
      <main className="solta">
        <div className="cartao">
          <div className="aviso" data-t="erro">
            {carga.mensagem}
          </div>
          <button className="btn" onClick={() => router.replace('/inicio')}>
            Ir para o consultório
          </button>
        </div>
      </main>
    );
  }

  const { eu } = carga;
  const temConsultorio = eu.consultorios > 0;
  return (
    <main className="solta">
      <div className="contextos pilha">
        <div className="contextos-cabeca">
          <span className="marca">
            <Simbolo tamanho={32} />
            senda
          </span>
          <span className="mudo pequeno">Escolha de contexto</span>
          <h1>Por onde você quer entrar?</h1>
          <p className="mudo">
            {eu.email ?? 'Este login'} {temConsultorio ? 'atende num consultório e também opera' : 'opera'} a plataforma.
            Escolha agora; dá para trocar depois, no menu da conta.
          </p>
        </div>
        <div className="grade" data-n="2">
          <section className="cartao">
            <span className="contexto-icone">
              <Icone nome="pacientes" />
            </span>
            <h2>Consultório</h2>
            <p className="mudo">O atendimento: agenda, pacientes, prontuário e financeiro do consultório.</p>
            {temConsultorio ? (
              <button className="btn" data-largo onClick={() => router.replace('/inicio')}>
                Entrar no consultório
              </button>
            ) : (
              <p className="aviso" data-t="atencao">
                Este login não está em nenhum consultório.
              </p>
            )}
          </section>
          <section className="cartao">
            <span className="contexto-icone">
              <Icone nome="escudo" />
            </span>
            <h2>Backoffice</h2>
            <p className="mudo">A plataforma: consultórios, logins e assinaturas. Nada clínico passa por lá.</p>
            <button className="btn" data-v="sec" data-largo onClick={() => trocarPara(URL_BACKOFFICE)}>
              Entrar no backoffice
            </button>
          </section>
        </div>
        <button className="lk" onClick={() => void sair()}>
          Sair
        </button>
      </div>
    </main>
  );
}
