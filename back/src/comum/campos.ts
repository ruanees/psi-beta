// O nome do campo no contrato da API (camelCase) e o nome no banco (snake_case)
// se cruzam só por estes dois, sempre a partir de um mapa explícito por recurso.

/** Só as chaves presentes atravessam — `undefined` fica de fora, `null` vai. */
export function paraBanco(dto: object, mapa: Record<string, string>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [api, banco] of Object.entries(mapa)) {
    const v = (dto as Record<string, unknown>)[api];
    if (v !== undefined) saida[banco] = v;
  }
  return saida;
}

export function paraApi(linha: Record<string, unknown>, mapa: Record<string, string>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [api, banco] of Object.entries(mapa)) saida[api] = linha[banco] ?? null;
  return saida;
}
