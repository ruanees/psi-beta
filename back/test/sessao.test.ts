import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { traduzir } from '../src/comum/erro.filter';
import { ErroAuth } from '../src/comum/erros';
import { SessaoController, veioDaRecuperacao } from '../src/sessao/sessao.controller';
import type { GoTrueService } from '../src/supabase/gotrue.service';

const agora = Math.floor(Date.now() / 1000);

function token(claims: object): string {
  return `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;
}

/** GoTrue de mentira: registra o que foi chamado e confere a senha 'certa-123456'. */
function gotrueFalso(fatores: { factor_type: string; status: string }[] = []) {
  const chamadas: string[] = [];
  const falso = {
    usuario: async () => ({ id: 'u1', email: 'ana@exemplo.com', factors: fatores }),
    entrar: async (_email: string, senha: string) => {
      chamadas.push('entrar');
      if (senha !== 'certa-123456') throw new ErroAuth(400, 'invalid_credentials');
      return { access_token: 'conferida', refresh_token: 'r', expires_in: 3600 };
    },
    sair: async (jwt: string) => {
      chamadas.push(`sair:${jwt}`);
    },
    trocarSenha: async () => {
      chamadas.push('trocarSenha');
    },
  };
  return { ctrl: new SessaoController(falso as unknown as GoTrueService), chamadas };
}

describe('troca de senha', () => {
  it('link de recuperação recente dispensa a senha atual', () => {
    assert.equal(veioDaRecuperacao({ amr: [{ method: 'recovery', timestamp: agora - 60 }] }, agora), true);
  });

  it('link de recuperação antigo não dispensa', () => {
    assert.equal(veioDaRecuperacao({ amr: [{ method: 'recovery', timestamp: agora - 3600 }] }, agora), false);
  });

  it('login por senha não dispensa', () => {
    assert.equal(veioDaRecuperacao({ amr: [{ method: 'password', timestamp: agora }] }, agora), false);
  });

  it('sessão aberta sem a senha atual não troca a senha', async () => {
    const { ctrl, chamadas } = gotrueFalso();
    const jwt = token({ aal: 'aal1', amr: [{ method: 'password', timestamp: agora }] });
    await assert.rejects(ctrl.senha(jwt, { senha: 'nova-1234567' }), (e: unknown) => {
      return e instanceof ErroAuth && traduzir(e).status === 400;
    });
    assert.deepEqual(chamadas, []);
  });

  it('senha atual errada responde 422, sem derrubar a sessão', async () => {
    const { ctrl, chamadas } = gotrueFalso();
    const jwt = token({ aal: 'aal1', amr: [{ method: 'password', timestamp: agora }] });
    await assert.rejects(ctrl.senha(jwt, { senha: 'nova-1234567', senhaAtual: 'errada' }), (e: unknown) => {
      const r = traduzir(e);
      return r.status === 422 && /senha atual/.test(r.mensagem);
    });
    assert.deepEqual(chamadas, ['entrar']);
  });

  it('senha atual certa troca e encerra a sessão aberta só para conferir', async () => {
    const { ctrl, chamadas } = gotrueFalso();
    const jwt = token({ aal: 'aal1', amr: [{ method: 'password', timestamp: agora }] });
    await ctrl.senha(jwt, { senha: 'nova-1234567', senhaAtual: 'certa-123456' });
    assert.deepEqual(chamadas, ['entrar', 'sair:conferida', 'trocarSenha']);
  });

  it('pelo link de recuperação troca sem a senha atual', async () => {
    const { ctrl, chamadas } = gotrueFalso();
    const jwt = token({ aal: 'aal1', amr: [{ method: 'recovery', timestamp: agora }] });
    await ctrl.senha(jwt, { senha: 'nova-1234567' });
    assert.deepEqual(chamadas, ['trocarSenha']);
  });

  it('quem tem segundo fator precisa de aal2, mesmo vindo do link', async () => {
    const { ctrl, chamadas } = gotrueFalso([{ factor_type: 'totp', status: 'verified' }]);
    const jwt = token({ aal: 'aal1', amr: [{ method: 'recovery', timestamp: agora }] });
    await assert.rejects(ctrl.senha(jwt, { senha: 'nova-1234567' }), (e: unknown) => traduzir(e).status === 403);
    assert.deepEqual(chamadas, []);
    await ctrl.senha(token({ aal: 'aal2', amr: [{ method: 'recovery', timestamp: agora }] }), { senha: 'nova-1234567' });
    assert.deepEqual(chamadas, ['trocarSenha']);
  });
});
