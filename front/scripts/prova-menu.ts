// Prova do menu, rodada na CI: item pronto tem página; item que tem página
// está marcado como pronto; id e rota não se repetem. Sobre a mesma tabela
// que a tela usa — não uma cópia dela.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MENU, MENU_CONTA } from '../lib/menu.ts';

const raiz = join(import.meta.dirname, '..', 'app', '(app)');
const erros: string[] = [];
const todos = [...MENU, ...MENU_CONTA];

for (const item of todos) {
  const pagina = join(raiz, item.rota, 'page.tsx');
  const existe = existsSync(pagina);
  if (item.pronta && !existe) erros.push(`${item.id}: marcado pronto, mas falta app/(app)${item.rota}/page.tsx`);
  if (!item.pronta && existe) erros.push(`${item.id}: a página existe, mas o menu ainda diz "em breve"`);
}

for (const campo of ['id', 'rota'] as const) {
  const vistos = new Set<string>();
  for (const item of todos) {
    if (vistos.has(item[campo])) erros.push(`${campo} repetido no menu: ${item[campo]}`);
    vistos.add(item[campo]);
  }
}

if (MENU.length > 5) erros.push('a barra de baixo do celular comporta no máximo 5 itens');

if (erros.length) {
  console.error(`prova:menu falhou\n- ${erros.join('\n- ')}`);
  process.exit(1);
}
console.log(`prova:menu ok — ${todos.length} itens, ${todos.filter((i) => i.pronta).length} prontos`);
