// Datas da agenda, sempre no fuso do consultório (America/Sao_Paulo).
// O Brasil não tem horário de verão desde 2019: o deslocamento é -03:00 fixo,
// e é ele que vai no ISO de uma sessão nova. Se um dia voltar, é aqui que muda.

export const FUSO = 'America/Sao_Paulo';
export const DESLOCAMENTO = '-03:00';

const PARTES = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Instante → dia (AAAA-MM-DD) e minutos desde a meia-noite, no fuso do consultório. */
export function partes(iso: string | Date): { dia: string; minutos: number; hora: string } {
  const p = Object.fromEntries(PARTES.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const h = Number(p.hour);
  const m = Number(p.minute);
  return { dia: `${p.year}-${p.month}-${p.day}`, minutos: h * 60 + m, hora: `${p.hour}:${p.minute}` };
}

export function hoje(): string {
  return partes(new Date()).dia;
}

/** Dia de calendário + n dias. Trabalha em UTC ao meio-dia para não cruzar a virada. */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo. */
export function diaDaSemana(dia: string): number {
  return new Date(`${dia}T12:00:00Z`).getUTCDay();
}

/** Domingo da semana do dia. */
export function inicioDaSemana(dia: string): string {
  return somarDias(dia, -diaDaSemana(dia));
}

/** Dia + hora local → ISO com o deslocamento do consultório. */
export function instante(dia: string, hora: string): string {
  return `${dia}T${hora}:00${DESLOCAMENTO}`;
}

/** Meia-noite local do dia, como ISO. */
export function meiaNoite(dia: string): string {
  return instante(dia, '00:00');
}

const NOME_DIA = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });
const NOME_DIA_LONGO = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const MES_ANO = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function nomeDoDia(dia: string): string {
  return NOME_DIA.format(new Date(`${dia}T12:00:00Z`)).replace('.', '');
}

export function diaPorExtenso(dia: string): string {
  const t = NOME_DIA_LONGO.format(new Date(`${dia}T12:00:00Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function numeroDoDia(dia: string): number {
  return Number(dia.slice(8, 10));
}

/** "13 – 19 de outubro de 2026" ou "27 de outubro – 2 de novembro de 2026". */
export function rotuloDaSemana(domingo: string): string {
  const sabado = somarDias(domingo, 6);
  const mesAno = MES_ANO.format(new Date(`${sabado}T12:00:00Z`));
  const [mesFim] = mesAno.split(' de ');
  const mesIni = MES_ANO.format(new Date(`${domingo}T12:00:00Z`)).split(' de ')[0];
  const ano = sabado.slice(0, 4);
  return mesIni === mesFim
    ? `${numeroDoDia(domingo)} – ${numeroDoDia(sabado)} de ${mesFim} de ${ano}`
    : `${numeroDoDia(domingo)} de ${mesIni} – ${numeroDoDia(sabado)} de ${mesFim} de ${ano}`;
}

/** Idade em anos completos na data de hoje do consultório. */
export function idade(nascimento: string | null | undefined): number | null {
  if (!nascimento) return null;
  const h = hoje();
  let anos = Number(h.slice(0, 4)) - Number(nascimento.slice(0, 4));
  if (h.slice(5) < nascimento.slice(5)) anos -= 1;
  return anos;
}

export const DIAS_DA_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** De quantas em quantas semanas a sessão volta. */
export type Intervalo = 1 | 2;

/** A repetição em poucas palavras, para uma linha de sessão: "toda semana" ou "a cada 15 dias". */
export function frequencia(intervalo: number | null | undefined): string {
  return intervalo === 2 ? 'a cada 15 dias' : 'toda semana';
}

/** A repetição com o dia: "Toda terça", "Todo sábado", "Terça, a cada 15 dias". */
export function repeticaoPorExtenso(diaSemana: number, intervalo: number | null | undefined): string {
  const dia = DIAS_DA_SEMANA[diaSemana] ?? 'semana';
  if (intervalo === 2) return `${dia[0].toUpperCase()}${dia.slice(1)}, a cada 15 dias`;
  return `${diaSemana === 0 || diaSemana === 6 ? 'Todo' : 'Toda'} ${dia}`;
}
