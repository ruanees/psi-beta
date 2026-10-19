// Ponto de entrada no Supabase Edge Functions. A lógica inteira está em
// logica.ts, sem Deno, para ser provada no Node (back/test/admin-contas.test.ts).
//
// O Supabase põe no ambiente da função a URL do projeto e as chaves. Projeto
// com as chaves novas (sb_publishable_/sb_secret_) as recebe em JSON; o das
// antigas, uma variável por chave.
import { tratar } from './logica.ts';

function chave(antiga: string, novas: string): string | undefined {
  const direta = Deno.env.get(antiga);
  if (direta) return direta;
  try {
    const mapa = JSON.parse(Deno.env.get(novas) ?? '{}') as Record<string, string>;
    return mapa.default ?? Object.values(mapa)[0];
  } catch {
    return undefined;
  }
}

Deno.serve((req) =>
  tratar(req, {
    url: Deno.env.get('SUPABASE_URL'),
    anon: chave('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS'),
    servico: chave('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS'),
  }),
);
