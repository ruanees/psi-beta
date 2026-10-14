// Tema: preferência por aparelho (localStorage), aplicada antes da primeira
// pintura pelo script em app/layout.tsx. Sem escolha, segue o sistema.

export type Tema = 'claro' | 'escuro' | 'sistema';
export const CHAVE_TEMA = 'psi.tema';

/** Roda no <head>, antes do React. Mantido como string porque vai inline. */
export const SCRIPT_TEMA = `try{var t=localStorage.getItem('${CHAVE_TEMA}');if(t==='claro'||t==='escuro')document.documentElement.dataset.theme=t}catch(e){}`;

export function lerTema(): Tema {
  try {
    const t = localStorage.getItem(CHAVE_TEMA);
    return t === 'claro' || t === 'escuro' ? t : 'sistema';
  } catch {
    return 'sistema';
  }
}

export function aplicarTema(t: Tema): void {
  try {
    if (t === 'sistema') localStorage.removeItem(CHAVE_TEMA);
    else localStorage.setItem(CHAVE_TEMA, t);
  } catch {
    // Sem storage, o tema vale só até recarregar.
  }
  if (t === 'sistema') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

export function temaEfetivo(t: Tema): 'claro' | 'escuro' {
  if (t !== 'sistema') return t;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}
