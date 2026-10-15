// Sala online: o link que o paciente recebe e o nome do botão da chamada.

/** O link do paciente, no mesmo endereço em que o psicólogo está. */
export function linkDoPaciente(token: string, origem = typeof window === 'undefined' ? '' : window.location.origin): string {
  return `${origem}/sala/${token}`;
}

/** "Entrar no Meet" para link do Meet; qualquer outro serviço, "Entrar na chamada". */
export function nomeDaChamada(link: string): string {
  try {
    return new URL(link).hostname === 'meet.google.com' ? 'Entrar no Meet' : 'Entrar na chamada';
  } catch {
    return 'Entrar na chamada';
  }
}
