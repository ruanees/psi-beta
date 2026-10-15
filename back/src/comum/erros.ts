// Erro que veio do banco e erro que não chegou nele são coisas diferentes.
// Erro do PostgREST sempre traz `code`; sem código é transporte, e a resposta
// é 503 — nunca um 4xx que mente ("você não tem acesso") para um DNS errado.

export class ErroTransporte extends Error {
  constructor(readonly causa?: unknown) {
    super('transporte');
  }
}

export class ErroBanco extends Error {
  constructor(
    readonly codigo: string,
    readonly chave: string,
  ) {
    super(`banco:${codigo}`);
  }
}

export class ErroAuth extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string | undefined,
  ) {
    super(`auth:${status}:${codigo ?? ''}`);
  }
}

export interface RespostaErro {
  status: number;
  mensagem: string;
  codigo?: string;
}

// Chaves que as funções do banco levantam com `raise exception 'chave'`.
// A frase mora aqui, num lugar só; o banco nunca escreve texto de tela.
const CHAVES_BANCO: Record<string, [number, string]> = {
  sem_acesso: [403, 'Você não tem acesso a esta conta.'],
  so_titular: [403, 'Só o titular da conta pode mudar isto.'],
  segundo_fator: [403, 'Confirme o código do aplicativo autenticador para continuar.'],
  conta_inexistente: [404, 'Conta não encontrada.'],
  nao_encontrado: [404, 'Registro não encontrado.'],
  so_clinico: [403, 'Só o psicólogo do paciente lê ou altera dados clínicos.'],
  consentimento: [422, 'Confirme o consentimento do paciente para o uso dos dados.'],
  menor_sem_responsavel: [422, 'Paciente menor de idade precisa de ao menos um responsável.'],
  paciente_com_atendimento: [
    409,
    'Paciente com atendimento registrado não pode ser excluído: o prontuário tem guarda mínima de 5 anos. Use Arquivar.',
  ],
  paciente_inativo: [409, 'Paciente com alta ou arquivado. Reative o cadastro antes de agendar.'],
  sessao_encerrada: [409, 'Sessão realizada, com falta ou desmarcada não muda mais.'],
  sessao_futura: [409, 'Presença e falta só podem ser marcadas depois do horário da sessão.'],
  plano_invalido: [400, 'Plano: avulsa, pacote ou mensal.'],
  plano_incompleto: [422, 'Pacote precisa de pelo menos 2 sessões e do valor; mensal, do valor do mês.'],
  transicao_invalida: [409, 'Essa mudança de situação não é permitida.'],
  sem_recorrencia: [409, 'Esta sessão não se repete.'],
  periodo_invalido: [400, 'Período inválido: escolha até 62 dias.'],
};

const CODIGOS_BANCO: Record<string, [number, string]> = {
  '42501': [403, 'Você não tem acesso a este dado.'],
  PGRST116: [404, 'Registro não encontrado.'],
  // Função que o código chama e o banco não tem: faltou rodar uma migration no Supabase.
  PGRST202: [503, 'O banco está desatualizado: falta rodar a migration nova no Supabase.'],
  '23505': [409, 'Já existe um registro com estes dados.'],
  '23P01': [409, 'Já existe uma sessão neste horário.'],
  '23514': [422, 'Algum valor está fora do permitido.'],
  '23502': [422, 'Falta um campo obrigatório.'],
  '22P02': [400, 'Algum valor está em formato inválido.'],
};

export function traduzirBanco(e: ErroBanco): RespostaErro {
  const porChave = CHAVES_BANCO[e.chave];
  if (porChave) return { status: porChave[0], mensagem: porChave[1], codigo: e.chave };
  const porCodigo = CODIGOS_BANCO[e.codigo];
  if (porCodigo) return { status: porCodigo[0], mensagem: porCodigo[1], codigo: e.codigo };
  return { status: 500, mensagem: 'Erro inesperado ao falar com o banco.', codigo: e.codigo };
}

const CODIGOS_AUTH: Record<string, [number, string]> = {
  invalid_credentials: [401, 'E-mail ou senha incorretos.'],
  email_not_confirmed: [403, 'Confirme o e-mail antes de entrar.'],
  user_banned: [403, 'Este acesso está suspenso.'],
  refresh_token_not_found: [401, 'Sessão expirada. Entre de novo.'],
  refresh_token_already_used: [401, 'Sessão expirada. Entre de novo.'],
  session_not_found: [401, 'Sessão expirada. Entre de novo.'],
  session_expired: [401, 'Sessão expirada. Entre de novo.'],
  bad_jwt: [401, 'Sessão expirada. Entre de novo.'],
  weak_password: [422, 'Senha fraca. Use ao menos 10 caracteres, misturando letras e números.'],
  same_password: [422, 'A senha nova precisa ser diferente da atual.'],
  mfa_verification_failed: [401, 'Código incorreto. Confira o aplicativo autenticador.'],
  mfa_challenge_expired: [401, 'O código expirou. Gere um novo e tente de novo.'],
  insufficient_aal: [403, 'Confirme o código do aplicativo autenticador para continuar.'],
  over_request_rate_limit: [429, 'Muitas tentativas. Espere alguns minutos.'],
  over_email_send_rate_limit: [429, 'Muitos e-mails pedidos. Espere alguns minutos.'],
};

export function traduzirAuth(e: ErroAuth): RespostaErro {
  if (e.status >= 500) return { status: 503, mensagem: 'O serviço de login não respondeu. Tente de novo em instantes.' };
  const conhecido = e.codigo ? CODIGOS_AUTH[e.codigo] : undefined;
  if (conhecido) return { status: conhecido[0], mensagem: conhecido[1], codigo: e.codigo };
  if (e.status === 429) return { status: 429, mensagem: CODIGOS_AUTH.over_request_rate_limit[1] };
  return { status: 400, mensagem: 'Não foi possível concluir. Tente de novo.', codigo: e.codigo };
}

export const MENSAGEM_TRANSPORTE = 'Sem conexão com o banco agora. Tente de novo em instantes.';
