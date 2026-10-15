'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, definirAoExpirar, ErroApi, type Dto } from '@/lib/api.ts';
import { fdh } from '@/lib/formato.ts';
import { itemAtivo, MENU, MENU_CONTA, type ItemMenu } from '@/lib/menu.ts';
import { caminhoDeSaida, gravarSessao, lerSessao, type MotivoSaida } from '@/lib/sessao.ts';
import { aplicarTema, lerTema, temaEfetivo } from '@/lib/tema.ts';
import { useInatividade } from '@/lib/use-inatividade.ts';
import { ContextoApp, type EstadoApp } from './EstadoApp';
import { Icone } from './Icone';
import { SeloGravacao } from './SeloGravacao';

// A moldura do app: sidebar azul-marinho (desktop), sidebar só de ícones
// (tablet) e barra de baixo (celular) — as três saindo de lib/menu.ts.
// Referência: docs/referencias/01-dashboard.jpg.

type Carga =
  | { etapa: 'carregando' }
  | { etapa: 'pronta'; conta: Dto<'ContaDto'> }
  | { etapa: 'sem-conta' }
  | { etapa: 'erro'; mensagem: string };

export function Marca({ comTexto = true }: { comTexto?: boolean }) {
  return (
    <Link href="/inicio" className="marca" aria-label="PSI, início">
      <span className="marca-sinal" aria-hidden="true">
        Ψ
      </span>
      {comTexto && <span className="marca-texto">PSI</span>}
    </Link>
  );
}

export function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

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

  if (carga.etapa === 'carregando') {
    return (
      <main className="solta mudo" aria-busy="true">
        Carregando…
      </main>
    );
  }
  if (carga.etapa === 'sem-conta') {
    return (
      <main className="solta">
        <div className="cartao">
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
      <main className="solta">
        <div className="cartao">
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

  const titulo = [...MENU, ...MENU_CONTA].find((i) => itemAtivo(i.rota, caminho))?.rotulo ?? '';
  const configuracoes = MENU_CONTA[0];

  return (
    <ContextoApp.Provider value={estado}>
      <div className="app">
        <aside className="lateral">
          <Marca />
          <nav aria-label="Principal">
            <ul>
              {MENU.map((item) => (
                <li key={item.id}>
                  <ItemDoMenu item={item} caminho={caminho} />
                </li>
              ))}
            </ul>
            <ul className="lateral-rodape">
              <li>
                <ItemDoMenu item={configuracoes} caminho={caminho} />
              </li>
            </ul>
          </nav>
        </aside>

        <div className="principal">
          <header className="topo">
            <div className="topo-dentro">
              <Marca />
              <span className="topo-titulo">{titulo}</span>
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
        </div>

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
      <span className="lateral-item" aria-disabled="true" title={`${item.rotulo} — em breve`}>
        <Icone nome={item.icone} />
        <span className="rotulo">{item.rotulo}</span>
        <span className="em-breve">em breve</span>
      </span>
    );
  }
  return (
    <Link
      href={item.rota}
      className="lateral-item"
      title={item.rotulo}
      aria-current={itemAtivo(item.rota, caminho) ? 'page' : undefined}
    >
      <Icone nome={item.icone} />
      <span className="rotulo">{item.rotulo}</span>
    </Link>
  );
}

function MenuConta({ conta, caminho, aoSair }: { conta: Dto<'ContaDto'>; caminho: string; aoSair: () => void }) {
  const [aberta, setAberta] = useState(false);
  const nome = conta.perfil?.nome ?? conta.nome;

  useEffect(() => setAberta(false), [caminho]);
  useEffect(() => {
    if (!aberta) return;
    const fechar = (e: KeyboardEvent) => e.key === 'Escape' && setAberta(false);
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, [aberta]);

  const alternarTema = () => aplicarTema(temaEfetivo(lerTema()) === 'escuro' ? 'claro' : 'escuro');

  return (
    <>
      <button className="conta-botao" aria-label="Conta" aria-expanded={aberta} onClick={() => setAberta(!aberta)}>
        <span className="avatar">{iniciais(nome) || '?'}</span>
      </button>
      {aberta && (
        <div className="folha" role="menu">
          <div className="folha-cabeca">
            <span className="avatar">{iniciais(nome) || '?'}</span>
            <div style={{ minWidth: 0 }}>
              <strong>{nome}</strong>
              <div className="mudo pequeno">{conta.nome}</div>
            </div>
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
          <div className="folha-rodape">Versão {fdh(process.env.NEXT_PUBLIC_PSI_VERSAO ?? '')}</div>
        </div>
      )}
    </>
  );
}
