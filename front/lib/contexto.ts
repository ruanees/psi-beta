// Escolha de contexto: quem opera a plataforma (super_admins) e atende num
// consultório escolhe, depois de entrar, por onde seguir — a operação (este
// app) ou o backoffice (repositório senda-backoffice).
//
// São dois endereços, então duas sessões: o sessionStorage de um não existe
// no outro. A troca leva a sessão no fragmento do endereço (#entrar=…), que
// não vai ao servidor nem ao log, e o outro lado tira do endereço na hora.
// O que vai é só o token de renovação, que é de uso único: o outro lado o
// troca imediatamente por uma sessão própria, e o token que ficou na
// história do navegador já não serve para nada. Quem saiu apaga a própria
// sessão antes de sair, para nunca haver dois apps com o mesmo token.
//
// Quem recebe pergunta "continuar como fulano?" antes de abrir: sem isso,
// um link montado por outra pessoa entraria na conta dela, e o que se
// cadastrasse em seguida iria parar lá.
import { gravarSessao, lerSessao } from './sessao.ts';

export const CHAVE_TROCA = 'entrar';

/** Endereço do backoffice, colado no build. Sem ele, a opção de backoffice não aparece. */
export const URL_BACKOFFICE = (process.env.NEXT_PUBLIC_BACKOFFICE_URL ?? '').replace(/\/$/, '');

export interface Eu {
  super: boolean;
  consultorios: number;
}

/** Para onde ir depois do login: quem opera a plataforma escolhe; o resto vai direto para o consultório. */
export function destinoDepoisDeEntrar(eu: Eu | null): '/perfil' | '/inicio' {
  return eu?.super && URL_BACKOFFICE ? '/perfil' : '/inicio';
}

export function urlDeTroca(base: string, renovacao: string): string {
  return `${base.replace(/\/$/, '')}/#${CHAVE_TROCA}=${encodeURIComponent(renovacao)}`;
}

/** O token de troca que chegou no fragmento, ou null. */
export function lerTroca(fragmento: string): string | null {
  return new URLSearchParams(fragmento.replace(/^#/, '')).get(CHAVE_TROCA) || null;
}

/** E-mail do token, sem validar: serve só para a pergunta "continuar como". A validação é do back. */
export function emailDoToken(token: string): string | null {
  try {
    const parte = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const corpo = JSON.parse(atob(parte.padEnd(Math.ceil(parte.length / 4) * 4, '='))) as { email?: unknown };
    return typeof corpo.email === 'string' ? corpo.email : null;
  } catch {
    return null;
  }
}

/** Leva a sessão para o outro app, na mesma aba. Esta aqui deixa de existir antes de sair. */
export function trocarPara(base: string): void {
  const s = lerSessao();
  if (!s || !base) return;
  gravarSessao(null);
  window.location.assign(urlDeTroca(base, s.renovacao));
}
