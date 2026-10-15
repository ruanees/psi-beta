// Conversões de campo de formulário para o que a API espera.

/** "123.456.789-00" → "12345678900". Vazio vira undefined. */
export function soDigitos(v: string | undefined | null): string | undefined {
  const d = (v ?? '').replace(/\D/g, '');
  return d || undefined;
}

/** "1.234,50" ou "180" → 1234.5 / 180. Vazio vira undefined; texto inválido vira NaN (a API recusa). */
export function valorEmReais(v: string | undefined | null): number | undefined {
  const t = (v ?? '').trim();
  if (!t) return undefined;
  return Number(t.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.'));
}

/** 180 → "180,00" para preencher campo. */
export function reaisParaCampo(n: number | null | undefined): string {
  return n == null ? '' : n.toFixed(2).replace('.', ',');
}

/** "12345678900" → "123.456.789-00". */
export function cpfFormatado(v: string | null | undefined): string {
  const d = (v ?? '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (v ?? '');
}
