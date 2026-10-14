import { Injectable } from '@nestjs/common';
import { exigirConfig } from '../comum/config';
import { ErroAuth, ErroTransporte } from '../comum/erros';

// Conversa direta com o servidor de autenticação do Supabase (GoTrue) por
// REST. O supabase-js guarda sessão em memória e renova sozinho, o que num
// servidor compartilhado é exatamente o que não se quer.

export interface SessaoGoTrue {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in: number;
  user?: { id: string; email?: string; factors?: FatorGoTrue[] };
}

export interface FatorGoTrue {
  id: string;
  factor_type: string;
  status: 'verified' | 'unverified';
  friendly_name?: string;
}

interface Chamada {
  metodo: 'GET' | 'POST' | 'PUT' | 'DELETE';
  corpo?: unknown;
  jwt?: string;
}

@Injectable()
export class GoTrueService {
  private async chamar<T>(caminho: string, { metodo, corpo, jwt }: Chamada): Promise<T> {
    const base = exigirConfig('SUPABASE_URL').replace(/\/$/, '');
    const anon = exigirConfig('SUPABASE_ANON_KEY');
    let r: Response;
    try {
      r = await fetch(`${base}/auth/v1${caminho}`, {
        method: metodo,
        headers: {
          apikey: anon,
          Authorization: `Bearer ${jwt ?? anon}`,
          'Content-Type': 'application/json',
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
    } catch (e) {
      throw new ErroTransporte(e);
    }
    const texto = await r.text();
    let dados: unknown = null;
    if (texto) {
      try {
        dados = JSON.parse(texto);
      } catch {
        // Resposta que não é JSON veio de proxy ou página de erro, não do GoTrue.
        throw new ErroTransporte(new Error(`resposta não-JSON (${r.status})`));
      }
    }
    if (!r.ok) {
      const d = (dados ?? {}) as { error_code?: string; code?: string | number; error?: string };
      const codigo = d.error_code ?? (typeof d.code === 'string' ? d.code : undefined) ?? d.error;
      throw new ErroAuth(r.status, codigo);
    }
    return dados as T;
  }

  entrar(email: string, senha: string) {
    return this.chamar<SessaoGoTrue>('/token?grant_type=password', { metodo: 'POST', corpo: { email, password: senha } });
  }

  renovar(refreshToken: string) {
    return this.chamar<SessaoGoTrue>('/token?grant_type=refresh_token', {
      metodo: 'POST',
      corpo: { refresh_token: refreshToken },
    });
  }

  recuperar(email: string, retorno: string) {
    return this.chamar<unknown>(`/recover?redirect_to=${encodeURIComponent(retorno)}`, {
      metodo: 'POST',
      corpo: { email },
    });
  }

  trocarSenha(jwt: string, senha: string) {
    return this.chamar<unknown>('/user', { metodo: 'PUT', corpo: { password: senha }, jwt });
  }

  sair(jwt: string) {
    return this.chamar<unknown>('/logout?scope=local', { metodo: 'POST', jwt });
  }

  usuario(jwt: string) {
    return this.chamar<{ id: string; email?: string; factors?: FatorGoTrue[] }>('/user', { metodo: 'GET', jwt });
  }

  cadastrarFator(jwt: string, nome: string) {
    return this.chamar<{ id: string; totp: { qr_code: string; secret: string; uri: string } }>('/factors', {
      metodo: 'POST',
      corpo: { factor_type: 'totp', friendly_name: nome },
      jwt,
    });
  }

  removerFator(jwt: string, fatorId: string) {
    return this.chamar<unknown>(`/factors/${encodeURIComponent(fatorId)}`, { metodo: 'DELETE', jwt });
  }

  async verificarFator(jwt: string, fatorId: string, codigo: string): Promise<SessaoGoTrue> {
    const id = encodeURIComponent(fatorId);
    const desafio = await this.chamar<{ id: string }>(`/factors/${id}/challenge`, { metodo: 'POST', jwt });
    return this.chamar<SessaoGoTrue>(`/factors/${id}/verify`, {
      metodo: 'POST',
      corpo: { challenge_id: desafio.id, code: codigo },
      jwt,
    });
  }
}
