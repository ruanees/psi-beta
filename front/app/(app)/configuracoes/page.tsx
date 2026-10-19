'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CampoGravavel } from '@/components/CampoGravavel';
import { ConexaoGoogle } from '@/components/ConexaoGoogle';
import { useApp } from '@/components/EstadoApp';
import { api, type Dto } from '@/lib/api.ts';
import { gravarSessao } from '@/lib/sessao.ts';

export default function Configuracoes() {
  const { conta, recarregar } = useApp();
  const titular = conta.papeis.includes('titular');

  const gravarPerfil = async (corpo: Dto<'PerfilParcialDto'>) => {
    await api('patch', '/contas/{conta}/perfil', { params: { conta: conta.id }, corpo });
    await recarregar();
  };
  const gravarConfig = async (corpo: Dto<'ConfiguracoesParciaisDto'>) => {
    await api('patch', '/contas/{conta}/configuracoes', { params: { conta: conta.id }, corpo });
    await recarregar();
  };
  const p = conta.perfil;
  const c = conta.configuracoes;

  return (
    <div className="pilha">
      {p && (
        <section className="cartao">
          <h2>Perfil profissional</h2>
          <div className="grade" data-n="2">
            <CampoGravavel rotulo="Nome" valor={p.nome} gravar={(v) => gravarPerfil({ nome: v })} />
            <CampoGravavel
              rotulo="CRP"
              valor={p.crp ?? ''}
              placeholder="06/123456"
              dica="Região/número. Sai nos recibos."
              gravar={(v) => gravarPerfil({ crp: v || null })}
            />
            <CampoGravavel
              rotulo="Cadastro e-Psi"
              valor={p.epsiNumero ?? ''}
              dica="Exigido pelo CFP para atendimento online."
              gravar={(v) => gravarPerfil({ epsiNumero: v || null })}
            />
            <CampoGravavel
              rotulo="Valor padrão da sessão (R$)"
              valor={p.valorSessaoPadrao == null ? '' : String(p.valorSessaoPadrao).replace('.', ',')}
              inputMode="decimal"
              dica="Cada paciente pode ter um valor próprio."
              gravar={(v) => gravarPerfil({ valorSessaoPadrao: v ? Number(v.replace(/\./g, '').replace(',', '.')) : null })}
            />
            <CampoGravavel
              rotulo="Link fixo da sala online"
              valor={p.salaLink ?? ''}
              inputMode="url"
              placeholder="https://meet.google.com/…"
              dica="O link do Meet que você usa sempre. Vale para toda sessão online sem link próprio."
              gravar={(v) => gravarPerfil({ salaLink: v.trim() || null })}
            />
          </div>
        </section>
      )}

      {p && <ConexaoGoogle />}

      {titular && (
        <section className="cartao">
          <h2>Regras do consultório</h2>
          <div className="grade" data-n="2">
            <label className="campo">
              <span>Antecedência mínima do aviso de falta</span>
              <select
                className="ent"
                value={c.avisoMinimoHoras}
                onChange={(e) => void gravarConfig({ avisoMinimoHoras: Number(e.target.value) }).catch(() => undefined)}
              >
                {[...new Set([6, 24, c.avisoMinimoHoras])].sort((a, b) => a - b).map((h) => (
                  <option key={h} value={h}>
                    {h} horas
                  </option>
                ))}
              </select>
              <small>Desmarcar com menos tempo conta como falta: é cobrada e gasta sessão do pacote.</small>
            </label>
            <label className="campo">
              <span>Vencimento da mensalidade</span>
              <select
                className="ent"
                value={c.vencimentoMensalDia}
                onChange={(e) => void gravarConfig({ vencimentoMensalDia: Number(e.target.value) }).catch(() => undefined)}
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    Dia {d}
                  </option>
                ))}
              </select>
              <small>Para pacientes no plano mensal. A cobrança do mês nasce sozinha, com este vencimento.</small>
            </label>
            <CampoGravavel
              rotulo="Sair sozinho após quantos minutos sem uso"
              valor={String(c.inatividadeMinutos)}
              tipo="number"
              dica="Entre 5 e 240. Protege o computador compartilhado."
              gravar={(v) => gravarConfig({ inatividadeMinutos: Number(v) })}
            />
          </div>
          <label className="alternar">
            <input
              type="checkbox"
              checked={c.faltaCobraAvulsa}
              onChange={(e) => void gravarConfig({ faltaCobraAvulsa: e.target.checked }).catch(() => undefined)}
            />
            Cobrar falta de sessão avulsa
          </label>
        </section>
      )}

      <TrocarSenha />
      <SegundoFator />
    </div>
  );
}

function TrocarSenha() {
  const [msg, setMsg] = useState<{ t: 'ok' | 'erro'; texto: string } | null>(null);

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const senha = String(f.get('senha'));
    if (senha !== String(f.get('repetir'))) return setMsg({ t: 'erro', texto: 'As duas senhas não são iguais.' });
    try {
      await api('post', '/sessao/senha', { corpo: { senha, senhaAtual: String(f.get('atual')) } });
      form.reset();
      setMsg({ t: 'ok', texto: 'Senha trocada.' });
    } catch (erro) {
      setMsg({ t: 'erro', texto: erro instanceof Error ? erro.message : 'Não foi possível trocar a senha.' });
    }
  };

  return (
    <section className="cartao">
      <h2>Senha</h2>
      {msg && (
        <div className="aviso" data-t={msg.t}>
          {msg.texto}
        </div>
      )}
      <form className="grade" data-n="2" onSubmit={enviar}>
        <label className="campo">
          <span>Senha atual</span>
          <input className="ent" name="atual" type="password" autoComplete="current-password" required />
        </label>
        <div />
        <label className="campo">
          <span>Senha nova</span>
          <input className="ent" name="senha" type="password" autoComplete="new-password" minLength={10} required />
        </label>
        <label className="campo">
          <span>Repita a senha nova</span>
          <input className="ent" name="repetir" type="password" autoComplete="new-password" minLength={10} required />
        </label>
        <div>
          <button className="btn">Trocar senha</button>
        </div>
      </form>
    </section>
  );
}

function SegundoFator() {
  const [fatores, setFatores] = useState<Dto<'FatorDto'>[] | null>(null);
  const [novo, setNovo] = useState<Dto<'NovoFatorDto'> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setFatores(await api('get', '/sessao/fatores'));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar.');
    }
  }, []);
  useEffect(() => void carregar(), [carregar]);

  const ativo = fatores?.find((f) => f.situacao === 'verificado');

  const iniciar = async () => {
    setErro(null);
    try {
      setNovo(await api('post', '/sessao/fatores'));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível iniciar.');
    }
  };

  const confirmar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!novo) return;
    const codigo = String(new FormData(e.currentTarget).get('codigo')).replace(/\D/g, '');
    try {
      const s = await api('post', '/sessao/fatores/{fator}/confirmar', { params: { fator: novo.id }, corpo: { codigo } });
      // A sessão confirmada é a que lê dado a partir de agora (aal2).
      gravarSessao({ acesso: s.acesso, renovacao: s.renovacao, expiraEm: s.expiraEm });
      setNovo(null);
      await carregar();
    } catch (erro) {
      setErro(erro instanceof Error ? erro.message : 'Código não confirmado.');
    }
  };

  const desativar = async () => {
    if (!ativo || !window.confirm('Desativar o código do autenticador? A conta fica protegida só pela senha.')) return;
    try {
      await api('delete', '/sessao/fatores/{fator}', { params: { fator: ativo.id } });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível desativar.');
    }
  };

  return (
    <section className="cartao">
      <h2>Código do autenticador</h2>
      <p className="mudo">
        Além da senha, pede um código do aplicativo autenticador (Google Authenticator, Microsoft Authenticator) ao
        entrar. Recomendado para quem guarda dado de paciente.
      </p>
      {erro && (
        <div className="aviso" data-t="erro">
          {erro}
        </div>
      )}
      {fatores === null ? (
        <p className="mudo">Carregando…</p>
      ) : ativo ? (
        <div className="linha" data-entre>
          <span className="selo" data-c="ok">
            Ativo
          </span>
          <button className="btn" data-v="perigo" onClick={() => void desativar()}>
            Desativar código
          </button>
        </div>
      ) : novo ? (
        <form className="pilha" onSubmit={confirmar}>
          <p>1. No aplicativo autenticador, leia este QR.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="qr" src={novo.qr} alt="QR para o aplicativo autenticador" />
          <p className="mudo pequeno">Sem câmera? Digite este código no aplicativo:</p>
          <div className="segredo">{novo.segredo}</div>
          <label className="campo">
            <span>2. Digite o código de 6 números que aparece</span>
            <input className="ent" data-codigo name="codigo" inputMode="numeric" maxLength={6} pattern="\d{6}" required />
          </label>
          <div className="linha">
            <button className="btn">Ativar código</button>
            <button type="button" className="btn" data-v="leve" onClick={() => setNovo(null)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button className="btn" data-v="sec" onClick={() => void iniciar()}>
          Ativar código do autenticador
        </button>
      )}
    </section>
  );
}
