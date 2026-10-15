// Cifra do refresh token e assinatura do `state` do OAuth, com a chave do
// segredo GOOGLE_CHAVE (32 bytes em base64). Duas subchaves derivadas por
// HMAC: a mesma chave nunca serve a dois algoritmos.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deB64url(texto: string): Uint8Array<ArrayBuffer> {
  const s = atob(texto.replace(/-/g, '+').replace(/_/g, '/'));
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

async function subchave(chaveB64: string, rotulo: string): Promise<Uint8Array<ArrayBuffer>> {
  const bruta = deB64url(chaveB64.trim().replace(/=+$/, ''));
  if (bruta.length < 32) throw new Error('GOOGLE_CHAVE precisa de 32 bytes em base64');
  const mestra = await crypto.subtle.importKey('raw', bruta, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', mestra, enc.encode(rotulo)));
}

async function chaveAes(chaveB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', await subchave(chaveB64, 'psi-google-cifra'), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function chaveHmac(chaveB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', await subchave(chaveB64, 'psi-google-estado'), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

/** `v1.<iv>.<cifrado>`: AES-256-GCM com IV aleatório de 12 bytes. */
export async function cifrar(texto: string, chaveB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chaveAes(chaveB64), enc.encode(texto));
  return `v1.${b64url(iv)}.${b64url(c)}`;
}

export async function decifrar(cifrado: string, chaveB64: string): Promise<string> {
  const [versao, iv, corpo] = cifrado.split('.');
  if (versao !== 'v1' || !iv || !corpo) throw new Error('token cifrado em formato desconhecido');
  const t = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64url(iv) }, await chaveAes(chaveB64), deB64url(corpo));
  return dec.decode(t);
}

export async function assinar(dados: string, chaveB64: string): Promise<string> {
  return b64url(await crypto.subtle.sign('HMAC', await chaveHmac(chaveB64), enc.encode(dados)));
}

export async function conferirAssinatura(dados: string, assinatura: string, chaveB64: string): Promise<boolean> {
  try {
    return await crypto.subtle.verify('HMAC', await chaveHmac(chaveB64), deB64url(assinatura), enc.encode(dados));
  } catch {
    return false;
  }
}

export async function sha256(texto: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(texto)));
}

export const textoDeB64url = (t: string) => dec.decode(deB64url(t));
export const b64urlDeTexto = (t: string) => b64url(enc.encode(t));
