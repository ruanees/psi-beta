import { createRemoteJWKSet, decodeProtectedHeader, errors, jwtVerify, type JWTPayload } from 'jose';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigFaltando, exigirConfig, lerConfig } from './config';
import { ErroTransporte } from './erros';
import type { Usuario } from './publico';

// O JWT do Supabase é validado aqui, sem ida ao servidor de autenticação:
// HS256 com o segredo (projetos antigos) ou a chave pública do JWKS (projetos novos).

let jwks: { url: string; conjunto: ReturnType<typeof createRemoteJWKSet> } | undefined;

function conjuntoJwks(emissor: string) {
  const url = `${emissor}/.well-known/jwks.json`;
  if (jwks?.url !== url) jwks = { url, conjunto: createRemoteJWKSet(new URL(url)) };
  return jwks.conjunto;
}

const SESSAO_EXPIRADA = 'Sessão expirada. Entre de novo.';

export async function verificarJwt(token: string): Promise<Usuario> {
  const emissor = `${exigirConfig('SUPABASE_URL').replace(/\/$/, '')}/auth/v1`;
  const opcoes = { issuer: emissor, audience: 'authenticated' };
  let payload: JWTPayload;
  try {
    const { alg } = decodeProtectedHeader(token);
    if (alg === 'HS256') {
      const segredo = lerConfig('SUPABASE_JWT_SECRET').valor;
      if (!segredo) throw new ConfigFaltando('SUPABASE_JWT_SECRET');
      ({ payload } = await jwtVerify(token, new TextEncoder().encode(segredo), {
        ...opcoes,
        algorithms: ['HS256'],
      }));
    } else {
      ({ payload } = await jwtVerify(token, conjuntoJwks(emissor), opcoes));
    }
  } catch (e) {
    if (e instanceof ConfigFaltando) throw e;
    // Não alcançar o JWKS é transporte, não sessão inválida.
    if (e instanceof errors.JWKSTimeout) throw new ErroTransporte(e);
    if (e instanceof errors.JOSEError) throw new UnauthorizedException(SESSAO_EXPIRADA);
    if (e instanceof TypeError && /fetch/i.test(e.message)) throw new ErroTransporte(e);
    throw new UnauthorizedException(SESSAO_EXPIRADA);
  }
  if (typeof payload.sub !== 'string' || !payload.sub) throw new UnauthorizedException(SESSAO_EXPIRADA);
  return {
    id: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    aal: payload.aal === 'aal2' ? 'aal2' : 'aal1',
  };
}

export function extrairBearer(cabecalho: string | undefined): string | undefined {
  const m = /^Bearer\s+(\S+)$/i.exec(cabecalho ?? '');
  return m?.[1];
}
