import { Injectable } from '@nestjs/common';
import { exigirConfig, lerConfig } from '../comum/config';
import { ErroBanco } from '../comum/erros';
import { SupabaseService } from '../supabase/supabase.service';
import { assinar, b64urlDeTexto, cifrar, conferirAssinatura, decifrar, sha256, textoDeB64url } from './cifra';
import type { GoogleStatusDto } from './google.dto';

// Conta Google do psicólogo e salas do Meet. O fluxo OAuth volta para uma
// página do FRONT (/google/retorno), que repassa código e `state` ao back com
// o JWT de quem está logado: o back nunca grava nada sem saber quem é.
// O `state` é assinado e amarrado ao usuário e à conta; o PKCE sai da mesma
// assinatura, então o back não guarda estado entre ida e volta.

const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOGAR = 'https://oauth2.googleapis.com/revoke';
const ESPACOS = 'https://meet.googleapis.com/v2/spaces';
const ESCOPO_MEET = 'https://www.googleapis.com/auth/meetings.space.created';
// Só o necessário: criar sala e saber qual conta foi conectada. Nada de gravação ou transcrição.
export const ESCOPOS = ['openid', 'email', ESCOPO_MEET];
const VALIDADE_ESTADO_MS = 10 * 60 * 1000;

/** Erro com chave da tabela de mensagens (comum/erros.ts). */
const falha = (chave: string) => new ErroBanco('P0001', chave);

interface Estado {
  u: string;
  c: string;
  n: string;
  e: number;
}

@Injectable()
export class GoogleService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Liga quando os três segredos existem; até lá a tela nem oferece a conexão. */
  disponivel(): boolean {
    return (['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CHAVE'] as const).every((n) => !!lerConfig(n).valor);
  }

  private exigirDisponivel(): void {
    if (!this.disponivel()) throw falha('google_indisponivel');
  }

  private retorno(): string {
    return `${exigirConfig('FRONT_URL').replace(/\/$/, '')}/google/retorno`;
  }

  private async verificador(nonce: string): Promise<string> {
    return assinar(`pkce.${nonce}`, exigirConfig('GOOGLE_CHAVE'));
  }

  async urlConectar(usuario: string, conta: string, agora = Date.now()): Promise<string> {
    this.exigirDisponivel();
    const chave = exigirConfig('GOOGLE_CHAVE');
    const nonce = crypto.randomUUID();
    const corpo = b64urlDeTexto(JSON.stringify({ u: usuario, c: conta, n: nonce, e: agora + VALIDADE_ESTADO_MS } satisfies Estado));
    const estado = `${corpo}.${await assinar(`estado.${corpo}`, chave)}`;
    const q = new URLSearchParams({
      client_id: exigirConfig('GOOGLE_CLIENT_ID'),
      redirect_uri: this.retorno(),
      response_type: 'code',
      scope: ESCOPOS.join(' '),
      access_type: 'offline',
      // Sem isto o Google só manda refresh token na primeira autorização.
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: estado,
      code_challenge: await sha256(await this.verificador(nonce)),
      code_challenge_method: 'S256',
    });
    return `${AUTORIZAR}?${q}`;
  }

  /** Confere o `state` e devolve o nonce; recusa o de outro usuário, outra conta ou vencido. */
  async conferirEstado(estado: string, usuario: string, conta: string, agora = Date.now()): Promise<string> {
    const [corpo, assinatura] = estado.split('.');
    if (!corpo || !assinatura || !(await conferirAssinatura(`estado.${corpo}`, assinatura, exigirConfig('GOOGLE_CHAVE')))) {
      throw falha('google_estado_invalido');
    }
    let e: Estado;
    try {
      e = JSON.parse(textoDeB64url(corpo)) as Estado;
    } catch {
      throw falha('google_estado_invalido');
    }
    if (e.u !== usuario || e.c !== conta || typeof e.e !== 'number' || e.e < agora) throw falha('google_estado_invalido');
    return e.n;
  }

  async concluir(jwt: string, usuario: string, conta: string, codigo: string, estado: string): Promise<void> {
    this.exigirDisponivel();
    const nonce = await this.conferirEstado(estado, usuario, conta);
    const r = await this.pedirToken({
      grant_type: 'authorization_code',
      code: codigo,
      redirect_uri: this.retorno(),
      code_verifier: await this.verificador(nonce),
    });
    if (!r.ok) throw falha('google_recusou');
    const t = r.corpo as { refresh_token?: string; id_token?: string; scope?: string };
    if (!t.scope?.split(' ').includes(ESCOPO_MEET)) throw falha('google_sem_permissao');
    if (!t.refresh_token) throw falha('google_recusou');
    const email = emailDoIdToken(t.id_token) ?? 'conta Google';
    await this.supabase.rpc<void>(jwt, 'google_gravar', {
      c: conta,
      email,
      token: await cifrar(t.refresh_token, exigirConfig('GOOGLE_CHAVE')),
    });
  }

  async status(jwt: string, conta: string): Promise<GoogleStatusDto> {
    const s = await this.supabase.rpc<{ conectada: boolean; email?: string; conectada_em?: string; falhou?: boolean }>(
      jwt,
      'google_status',
      { c: conta },
    );
    return {
      disponivel: this.disponivel(),
      conectada: s.conectada,
      email: s.email ?? null,
      conectadaEm: s.conectada_em ?? null,
      falhou: s.falhou ?? false,
    };
  }

  /** Apaga a conexão e revoga o token no Google. A revogação é cortesia: falhar não impede desconectar. */
  async desconectar(jwt: string, conta: string): Promise<void> {
    const cifrado = await this.supabase.rpc<string | null>(jwt, 'google_remover', { c: conta });
    if (!cifrado || !this.disponivel()) return;
    try {
      const token = await decifrar(cifrado, exigirConfig('GOOGLE_CHAVE'));
      await fetch(REVOGAR, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      });
    } catch {
      // Já desconectado do nosso lado; o psicólogo pode revogar também em myaccount.google.com.
    }
  }

  /**
   * Cria a sala do Meet do paciente com a conta do psicólogo dele e grava.
   * Devolve null sem conexão; levanta `google_reconectar` se o Google recusou o
   * token e `google_falhou` para qualquer outra falha.
   */
  async criarMeet(jwt: string, conta: string, paciente: string): Promise<string | null> {
    if (!this.disponivel()) return null;
    const cifrado = await this.supabase.rpc<string | null>(jwt, 'google_token', { c: conta, p: paciente });
    if (!cifrado) return null;

    let refresh: string;
    try {
      refresh = await decifrar(cifrado, exigirConfig('GOOGLE_CHAVE'));
    } catch {
      // Chave trocada no Worker: o token guardado não abre mais.
      await this.supabase.rpc<void>(jwt, 'google_falhou', { c: conta, p: paciente });
      throw falha('google_reconectar');
    }
    const r = await this.pedirToken({ grant_type: 'refresh_token', refresh_token: refresh });
    if (!r.ok) {
      if ((r.corpo as { error?: string }).error === 'invalid_grant') {
        await this.supabase.rpc<void>(jwt, 'google_falhou', { c: conta, p: paciente });
        throw falha('google_reconectar');
      }
      throw falha('google_falhou');
    }
    const acesso = (r.corpo as { access_token?: string }).access_token;
    if (!acesso) throw falha('google_falhou');

    let espaco: { name?: string; meetingUri?: string };
    try {
      const resp = await fetch(ESPACOS, {
        method: 'POST',
        headers: { Authorization: `Bearer ${acesso}`, 'Content-Type': 'application/json' },
        // Sem config: vale o padrão da conta (quem não foi convidado pede para entrar).
        body: '{}',
      });
      if (!resp.ok) throw new Error(`meet ${resp.status}`);
      espaco = (await resp.json()) as typeof espaco;
    } catch {
      throw falha('google_falhou');
    }
    if (!espaco.meetingUri || !espaco.name) throw falha('google_falhou');
    await this.supabase.rpc<void>(jwt, 'sala_meet_gravar', { c: conta, p: paciente, link: espaco.meetingUri, espaco: espaco.name });
    return espaco.meetingUri;
  }

  private async pedirToken(campos: Record<string, string>): Promise<{ ok: boolean; corpo: unknown }> {
    try {
      const r = await fetch(TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          ...campos,
          client_id: exigirConfig('GOOGLE_CLIENT_ID'),
          client_secret: exigirConfig('GOOGLE_CLIENT_SECRET'),
        }),
      });
      return { ok: r.ok, corpo: await r.json().catch(() => ({})) };
    } catch {
      throw falha('google_falhou');
    }
  }
}

/** O e-mail da conta conectada. O id_token veio direto do Google por TLS, então basta ler. */
export function emailDoIdToken(idToken?: string): string | null {
  const meio = idToken?.split('.')[1];
  if (!meio) return null;
  try {
    const p = JSON.parse(textoDeB64url(meio)) as { email?: unknown };
    return typeof p.email === 'string' && p.email.length <= 254 ? p.email : null;
  } catch {
    return null;
  }
}
