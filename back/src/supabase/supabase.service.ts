import { Injectable } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { exigirConfig } from '../comum/config';
import { ErroBanco, ErroTransporte } from '../comum/erros';

/**
 * Cliente do Supabase com a chave anon e o JWT de quem chamou. O Nest nunca
 * usa `service_role`: a RLS e as RPCs `security definer` decidem quem vê o quê.
 */
@Injectable()
export class SupabaseService {
  paraUsuario(jwt: string): SupabaseClient {
    return createClient(exigirConfig('SUPABASE_URL'), exigirConfig('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  /** Chama uma RPC e separa erro do banco (tem `code`) de erro de transporte (não tem). */
  async rpc<T>(jwt: string, nome: string, args: Record<string, unknown> = {}): Promise<T> {
    return executar<T>(this.paraUsuario(jwt).rpc(nome, args));
  }
}

interface RespostaPostgrest<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
}

export async function executar<T>(chamada: PromiseLike<RespostaPostgrest<T>>): Promise<T> {
  let r: RespostaPostgrest<T>;
  try {
    r = await chamada;
  } catch (e) {
    throw new ErroTransporte(e);
  }
  if (r.error) {
    if (!r.error.code) throw new ErroTransporte(r.error);
    throw new ErroBanco(r.error.code, r.error.message ?? '');
  }
  return r.data as T;
}
