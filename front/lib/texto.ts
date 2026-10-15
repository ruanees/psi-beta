/** Para comparar nomes: minúsculas, sem acento. "José" e "jose" batem. */
export function semAcento(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
