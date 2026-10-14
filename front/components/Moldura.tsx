'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, definirAoExpirar, ErroApi, type Dto } from '@/lib/api.ts';
import { fdh } from '@/lib/formato.ts';
import { itemAtivo, MENU, MENU_CONTA, type ItemMenu } from '@/lib/menu.ts';
import { caminhoDeSaida, gravarSessao, lerSessao, type MotivoSaida } from '@/lib/sessao.ts';
import { aplicarTema, lerTema, temaEfetivo } from '@/lib/tema.ts';
import { ContextoApp, type EstadoApp } from './EstadoApp';
import { Icone } from './Icone';
import { SeloGravacao } from './SeloGravacao';
import { useInatividade } from '@/lib/use-inatividade.ts';

// A moldura do app: barra de cima (desktop), barra de baixo (celular) e a
// folha da conta, as três saindo de lib/menu.ts. Visual provisório — o
// design system entra depois (docs/referencias/).

type Carga =
  | { etapa: 'carregando' }
  | { etapa: 'pronta'; conta: Dto<'ContaDto'> }
  | { etapa: 'sem-conta' }
  | { etapa: 'erro'; mensagem: string };

export function Moldura({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const caminho = usePathname();
  const [carga, setCarga] = useState<Carga>({ etapa: 'carregando' });

  const sair = useCallback(
    async (motivo: MotivoSaida = 'pediu') => {
      if (motivo === 'pediu' && lerSessao()) {
        await api('post', '/sessao/sair').catch(() => undefined);
      }
      gravarSessao(null);
      router.replace(caminhoDeSaida(motivo));
    },
    [router],
  );

  const carregar = useCallback(async () => {
    try {
      const contas = await api('get', '/contas');
      if (contas.length === 0) return setCarga({ etapa: 'sem-conta' });
      const conta = await api('get', '/contas/{conta}', { params: { conta: contas[0].id } });
      setCarga({ etapa: 'pronta', conta });
    } catch (e) {
      if (e instanceof ErroApi && (e.status === 401 || e.codigo === 'segundo_fator')) return void sair('expirou');
      setCarga({ etapa: 'erro', mensagem: e instanceof Error ? e.message : 'Erro ao carregar.' });
    }
  }, [sair]);

  useEffect(() => {
    if (!lerSessao()) {
      router.replace('/');
      return;
    }
    definirAoExpirar(() => router.replace(caminhoDeSaida('expirou')));
    void carregar();
  }, [carregar, router]);

  const minutos = carga.etapa === 'pronta' ? carga.conta.configuracoes.inatividadeMinutos : 30;
  useInatividade(minutos, () => void sair('inatividade'));

  const estado = useMemo<EstadoApp | null>(
    () => (carga.etapa === 'pronta' ? { conta: carga.conta, recarregar: carregar, sair } : null),
    [carga, carregar, sair],
  );

  if (carga.etapa === 'carregando') return <main className="entrada mudo">Carregando…</main>;
  if (carga.etapa === 'sem-conta') {
    return (
      <main className="entrada">
        <div className="entrada-caixa pilha">
          <h1>Acesso sem consultório</h1>
          <p className="mudo">Seu login funciona, mas ainda não está ligado a um consultório. Fale com o suporte.</p>
          <button className="btn" data-v="sec" onClick={() => void sair()}>
            Sair
          </button>
        </div>
      </main>
    );
  }
  if (carga.etapa === 'erro' || !estado) {
    return (
      <main className="entrada">
        <div className="entrada-caixa pilha">
          <div className="aviso" data-t="erro">
            {carga.etapa === 'erro' ? carga.mensagem : 'Erro ao carregar.'}
          </div>
          <button className="btn" onClick={() => void carregar()}>
            Tentar de novo
          </button>
        </div>
      </main>
    );
  }

  return (
    <ContextoApp.Provider value={estado}>
      <div className="app">
        <header className="topo">
          <div className="topo-dentro">
            <Link href="/inicio" className="marca">
              <span className="marca-sinal">P</span>
              PSI
            </Link>
            <nav aria-label="Principal">
              <ul className="menu">
                {MENU.map((item) => (
                  <li key={item.id}>
                    <ItemDoMenu item={item} caminho={caminho} />
                  </li>
                ))}
              </ul>
            </nav>
            <div className="topo-direita">
              <MenuConta conta={estado.conta} caminho={caminho} aoSair={() => void sair()} />
            </div>
          </div>
        </header>

        <main className="conteudo">{children}</main>

        <footer className="rodape">
          <span>{estado.conta.nome}</span>
          <span>Versão {fdh(process.env.NEXT_PUBLIC_PSI_VERSAO ?? '')}</span>
        </footer>

        <nav className="nav-baixo" aria-label="Principal" style={{ ['--itens' as string]: MENU.length }}>
          {MENU.map((item) => (
            <ItemDoMenu key={item.id} item={item} caminho={caminho} />
          ))}
        </nav>
      </div>
      <SeloGravacao />
    </ContextoApp.Provider>
  );
}

function ItemDoMenu({ item, caminho }: { item: ItemMenu; caminho: string }) {
  if (!item.pronta) {
    return (
      <span className="menu-item" aria-disabled="true" title="Em breve">
        <Icone nome={item.icone} />
        {item.rotulo}
        <span className="em-breve">em breve</span>
      </span>
    );
  }
  return (
    <Link href={item.rota} className="menu-item" aria-current={itemAtivo(item.rota, caminho) ? 'page' : undefined}>
      <Icone nome={item.icone} />
      {item.rotulo}
    </Link>
  );
}

function MenuConta({ conta, caminho, aoSair }: { conta: Dto<'ContaDto'>; caminho: string; aoSair: () => void }) {
  const [aberta, setAberta] = useState(false);
  const nome = conta.perfil?.nome ?? conta.nome;
  const iniciais = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  useEffect(() => setAberta(false), [caminho]);

  const alternarTema = () => aplicarTema(temaEfetivo(lerTema()) === 'escuro' ? 'claro' : 'escuro');

  return (
    <>
      <button className="conta-botao" aria-label="Conta" aria-expanded={aberta} onClick={() => setAberta(!aberta)}>
        {iniciais || '?'}
      </button>
      {aberta && (
        <div className="folha" role="menu">
          <div className="folha-rodape" style={{ borderTop: 0, marginTop: 0 }}>
            <strong>{nome}</strong>
            <div className="mudo pequeno">{conta.nome}</div>
          </div>
          {MENU_CONTA.map((item) => (
            <Link key={item.id} href={item.rota} className="folha-item" role="menuitem">
              <Icone nome={item.icone} />
              {item.rotulo}
            </Link>
          ))}
          <button className="folha-item" role="menuitem" onClick={alternarTema}>
            <Icone nome="tema" />
            Alternar tema
          </button>
          <button className="folha-item" role="menuitem" onClick={aoSair}>
            <Icone nome="sair" />
            Sair
          </button>
          <div className="folha-rodape mudo pequeno">Versão {fdh(process.env.NEXT_PUBLIC_PSI_VERSAO ?? '')}</div>
        </div>
      )}
    </>
  );
}
