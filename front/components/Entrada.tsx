'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ErroApi, type Dto } from '@/lib/api.ts';
import { destinoDepoisDeEntrar, emailDoToken, lerTroca } from '@/lib/contexto.ts';
import { gravarSessao, lerSessao } from '@/lib/sessao.ts';
import { Padrao } from './Padrao';
import { Simbolo } from './Simbolo';

// Login, recuperação e nova senha na mesma tela, como no DIME, mais o passo
// do código do autenticador para quem ativou o segundo fator.

type Etapa =
  | { nome: 'entrar' }
  | { nome: 'codigo'; sessao: Dto<'SessaoDto'> }
  | { nome: 'esqueci' }
  | { nome: 'enviado' }
  | { nome: 'nova-senha'; token: string }
  | { nome: 'trocando' }
  | { nome: 'continuar'; sessao: Dto<'SessaoDto'>; email: string | null };

const AVISOS: Record<string, { t: 'ok' | 'atencao'; texto: string }> = {
  inatividade: { t: 'atencao', texto: 'A sessão foi encerrada por inatividade. Entre de novo.' },
  expirou: { t: 'atencao', texto: 'A sessão expirou. Entre de novo.' },
  'senha-trocada': { t: 'ok', texto: 'Senha trocada. Entre com a nova senha.' },
  'link-expirado': { t: 'atencao', texto: 'O link de recuperação expirou ou já foi usado. Peça outro.' },
  'troca-expirou': { t: 'atencao', texto: 'A passagem do backoffice expirou ou já foi usada. Entre de novo.' },
};

export function Entrada() {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>({ nome: 'entrar' });
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    // Vindo do backoffice com a sessão no fragmento (lib/contexto.ts): sai do endereço na hora e é trocada.
    const troca = lerTroca(window.location.hash);
    if (troca) {
      window.history.replaceState(null, '', '/');
      setEtapa({ nome: 'trocando' });
      api('post', '/sessao/renovar', { publica: true, corpo: { renovacao: troca } }).then(
        (s) => setEtapa({ nome: 'continuar', sessao: s, email: emailDoToken(s.acesso) }),
        () => {
          setAviso('troca-expirou');
          setEtapa({ nome: 'entrar' });
        },
      );
      return;
    }
    const busca = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    // Volta do e-mail de recuperação: o token chega no hash e sai da barra de endereço na hora.
    if (busca.get('etapa') === 'nova-senha') {
      window.history.replaceState(null, '', '/');
      const token = hash.get('access_token');
      if (token && hash.get('type') === 'recovery') return setEtapa({ nome: 'nova-senha', token });
      setAviso('link-expirado');
      return setEtapa({ nome: 'esqueci' });
    }
    const motivo = busca.get('motivo');
    if (motivo && AVISOS[motivo]) {
      setAviso(motivo);
      window.history.replaceState(null, '', '/');
    }
    if (lerSessao()) router.replace('/inicio');
  }, [router]);

  async function executar(f: () => Promise<void>) {
    setErro(null);
    setOcupado(true);
    try {
      await f();
    } catch (e) {
      setErro(e instanceof ErroApi || e instanceof Error ? e.message : 'Algo deu errado.');
    } finally {
      setOcupado(false);
    }
  }

  /** Sem destino: quem opera a plataforma vai escolher o contexto; o resto vai direto para o consultório. */
  async function concluir(s: Dto<'SessaoDto'>, destino?: string) {
    gravarSessao({ acesso: s.acesso, renovacao: s.renovacao, expiraEm: s.expiraEm });
    if (destino) return router.replace(destino);
    // /eu fora do ar não impede ninguém de entrar no consultório.
    const eu = await api('get', '/eu').catch(() => null);
    router.replace(destinoDepoisDeEntrar(eu));
  }

  // "Não sou eu": a sessão que chegou é encerrada, não guardada.
  const recusarTroca = (sessao: Dto<'SessaoDto'>) => {
    void api('post', '/sessao/sair', { jwt: sessao.acesso }).catch(() => undefined);
    setEtapa({ nome: 'entrar' });
  };

  const entrar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void executar(async () => {
      const s = await api('post', '/sessao/entrar', {
        publica: true,
        corpo: { email: String(f.get('email')), senha: String(f.get('senha')) },
      });
      if (s.etapa === 'segundo_fator') setEtapa({ nome: 'codigo', sessao: s });
      else await concluir(s);
    });
  };

  const confirmarCodigo = (e: FormEvent<HTMLFormElement>, sessao: Dto<'SessaoDto'>) => {
    e.preventDefault();
    const codigo = String(new FormData(e.currentTarget).get('codigo')).replace(/\D/g, '');
    void executar(async () => {
      await concluir(
        await api('post', '/sessao/segundo-fator', {
          jwt: sessao.acesso,
          corpo: { fatorId: sessao.fatorId ?? '', codigo },
        }),
      );
    });
  };

  const pedirLink = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email'));
    void executar(async () => {
      await api('post', '/sessao/recuperar', { publica: true, corpo: { email } });
      setAviso(null);
      setEtapa({ nome: 'enviado' });
    });
  };

  const trocarSenha = (e: FormEvent<HTMLFormElement>, token: string) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const senha = String(f.get('senha'));
    if (senha !== String(f.get('repetir'))) return setErro('As duas senhas não são iguais.');
    void executar(async () => {
      await api('post', '/sessao/senha', { jwt: token, corpo: { senha } });
      setAviso('senha-trocada');
      setEtapa({ nome: 'entrar' });
    });
  };

  return (
    <main className="entrada">
      <section className="entrada-arte" aria-hidden="true">
        <span className="marca">
          <Simbolo tamanho={36} solido="#f8f7f2" />
          senda
        </span>
        <div className="entrada-arte-texto">
          <h2>Mais tempo para cuidar.</h2>
          <p>Sessões, pacotes e pagamentos num lugar só, com o sigilo que o atendimento psicológico exige.</p>
        </div>
        <Padrao className="entrada-padrao" lado={64} />
        <span className="pequeno">Acesso restrito a profissionais cadastrados.</span>
      </section>
      <section className="entrada-form">
      <div className="entrada-caixa">
        <span className="marca">
          <Simbolo tamanho={36} />
          senda
        </span>
        <div className="cartao">
          {aviso && AVISOS[aviso] && (
            <div className="aviso" data-t={AVISOS[aviso].t}>
              {AVISOS[aviso].texto}
            </div>
          )}
          {erro && (
            <div className="aviso" data-t="erro" role="alert">
              {erro}
            </div>
          )}

          {etapa.nome === 'trocando' && (
            <p className="mudo" aria-busy="true">
              Abrindo a sessão do backoffice…
            </p>
          )}

          {etapa.nome === 'continuar' && (
            <div className="pilha">
              <h1>Continuar como {etapa.email ?? 'este login'}?</h1>
              <p className="mudo">Você está vindo do backoffice. Confira se o login é o seu antes de abrir o consultório.</p>
              <button className="btn" data-largo onClick={() => void concluir(etapa.sessao, '/inicio')}>
                Continuar
              </button>
              <button type="button" className="lk" onClick={() => recusarTroca(etapa.sessao)}>
                Não sou eu
              </button>
            </div>
          )}

          {etapa.nome === 'entrar' && (
            <form className="pilha" onSubmit={entrar}>
              <h1>Entrar</h1>
              <label className="campo">
                <span>E-mail</span>
                <input className="ent" name="email" type="email" autoComplete="username" required />
              </label>
              <label className="campo">
                <span>Senha</span>
                <input className="ent" name="senha" type="password" autoComplete="current-password" required />
              </label>
              <button className="btn" data-largo disabled={ocupado}>
                {ocupado ? 'Entrando…' : 'Entrar'}
              </button>
              <button type="button" className="lk" onClick={() => (setErro(null), setEtapa({ nome: 'esqueci' }))}>
                Esqueci a senha
              </button>
            </form>
          )}

          {etapa.nome === 'codigo' && (
            <form className="pilha" onSubmit={(e) => confirmarCodigo(e, etapa.sessao)}>
              <h1>Código do autenticador</h1>
              <p className="mudo">Abra o aplicativo autenticador e digite o código de 6 números do Senda.</p>
              <input
                className="ent"
                data-codigo
                name="codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="\d{6}"
                autoFocus
                required
                aria-label="Código de 6 números"
              />
              <button className="btn" data-largo disabled={ocupado}>
                Confirmar código
              </button>
              <button type="button" className="lk" onClick={() => (setErro(null), setEtapa({ nome: 'entrar' }))}>
                Voltar
              </button>
            </form>
          )}

          {etapa.nome === 'esqueci' && (
            <form className="pilha" onSubmit={pedirLink}>
              <h1>Recuperar senha</h1>
              <p className="mudo">Enviamos um link para criar uma senha nova.</p>
              <label className="campo">
                <span>E-mail</span>
                <input className="ent" name="email" type="email" autoComplete="username" required />
              </label>
              <button className="btn" data-largo disabled={ocupado}>
                Enviar link
              </button>
              <button type="button" className="lk" onClick={() => (setErro(null), setEtapa({ nome: 'entrar' }))}>
                Voltar para entrar
              </button>
            </form>
          )}

          {etapa.nome === 'enviado' && (
            <div className="pilha">
              <h1>Confira seu e-mail</h1>
              <p className="mudo">
                Se o e-mail tiver acesso ao Senda, o link chega em alguns minutos. Confira também a caixa de spam.
              </p>
              <button className="btn" data-v="sec" onClick={() => setEtapa({ nome: 'entrar' })}>
                Voltar para entrar
              </button>
            </div>
          )}

          {etapa.nome === 'nova-senha' && (
            <form className="pilha" onSubmit={(e) => trocarSenha(e, etapa.token)}>
              <h1>Nova senha</h1>
              <label className="campo">
                <span>Senha nova</span>
                <input className="ent" name="senha" type="password" autoComplete="new-password" minLength={10} required />
                <small>Ao menos 10 caracteres, com letras e números.</small>
              </label>
              <label className="campo">
                <span>Repita a senha nova</span>
                <input className="ent" name="repetir" type="password" autoComplete="new-password" minLength={10} required />
              </label>
              <button className="btn" data-largo disabled={ocupado}>
                Salvar senha nova
              </button>
            </form>
          )}
        </div>
      </div>
      </section>
    </main>
  );
}
