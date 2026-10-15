import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  CobrancaDto,
  ItemFilaReciboDto,
  NovoReciboDto,
  ReciboDto,
  RelatorioMensalDto,
  FiltroRecibosDto,
  FiltroCobrancasDto,
  FormaPagamento,
  NovoPacoteDto,
  PacoteDto,
  PainelFinanceiroDto,
  SessaoFinanceiroDto,
} from './financeiro.dto';

// Financeiro: cobranças, pacotes e mensalidades. O que gera cobrança e o que
// gasta pacote é decidido no banco (trigger da sessão); aqui só se troca o formato.

interface CobrancaBanco {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  origem: CobrancaDto['origem'];
  valor: number;
  vencimento: string;
  situacao: CobrancaDto['situacao'];
  forma: FormaPagamento | null;
  paga_em: string | null;
  motivo: string | null;
  sessao_id: string | null;
  sessao_inicio: string | null;
  pacote_id: string | null;
  pacote_quantidade: number | null;
  referencia: string | null;
}

interface PainelBanco {
  a_receber: number;
  vencidas: number;
  valor_vencido: number;
  recebido_mes: number;
  sem_recibo: number;
  pacotes_acabando: { paciente_id: string; paciente_nome: string; restantes: number }[];
}

interface PacoteBanco {
  id: string;
  quantidade: number;
  valor: number;
  criado_em: string;
  usadas: number;
  restantes: number;
  cobranca: PacoteDto['cobranca'];
}

interface SessaoFinanceiroBanco {
  pacote: { id: string; numero: number; quantidade: number } | null;
  cobranca: {
    id: string;
    valor: number;
    vencimento: string;
    situacao: CobrancaDto['situacao'];
    forma: FormaPagamento | null;
    paga_em: string | null;
  } | null;
}

interface FilaBanco {
  id: string;
  origem: CobrancaDto['origem'];
  valor: number;
  paga_em: string;
  forma: FormaPagamento;
  sessao_inicio: string | null;
  pacote_quantidade: number | null;
  referencia: string | null;
  paciente: { id: string; nome: string; cpf: string | null };
  pagador: { nome: string; cpf: string | null; responsavel: boolean };
}

interface ReciboBanco {
  id: string;
  paciente_id: string;
  numero: string;
  emitido_em: string;
  valor: number;
  pagador_nome: string;
  pagador_cpf: string | null;
  beneficiario_nome: string;
  beneficiario_cpf: string | null;
  cancelado_em: string | null;
  cancelado_motivo: string | null;
  cobrancas: number;
}

interface RelatorioBanco {
  mes: string;
  realizadas: number;
  faltas: number;
  desmarcadas: number;
  online: number;
  pacientes_atendidos: number;
  pacientes_novos: number;
  recebido: number;
  a_receber: number;
  por_mes: { mes: string; realizadas: number; faltas: number; recebido: number }[];
}

/** numeric do Postgres pode chegar como texto pelo PostgREST: a API sempre responde número. */
const n = (v: number | string) => Number(v);

@Injectable()
export class FinanceiroService {
  constructor(private readonly supabase: SupabaseService) {}

  async painel(jwt: string, conta: string): Promise<PainelFinanceiroDto> {
    const b = await this.supabase.rpc<PainelBanco>(jwt, 'painel_financeiro', { c: conta });
    return {
      aReceber: n(b.a_receber),
      vencidas: b.vencidas,
      valorVencido: n(b.valor_vencido),
      recebidoMes: n(b.recebido_mes),
      semRecibo: b.sem_recibo,
      pacotesAcabando: b.pacotes_acabando.map((p) => ({
        pacienteId: p.paciente_id,
        pacienteNome: p.paciente_nome,
        restantes: p.restantes,
      })),
    };
  }

  async cobrancas(jwt: string, conta: string, f: FiltroCobrancasDto): Promise<CobrancaDto[]> {
    const filtro = {
      ...(f.situacao && { situacao: f.situacao }),
      ...(f.de && { de: f.de }),
      ...(f.ate && { ate: f.ate }),
      ...(f.paciente && { paciente_id: f.paciente }),
    };
    const linhas = await this.supabase.rpc<CobrancaBanco[]>(jwt, 'cobrancas_listar', { c: conta, filtro });
    return linhas.map((l) => ({
      id: l.id,
      pacienteId: l.paciente_id,
      pacienteNome: l.paciente_nome,
      origem: l.origem,
      valor: n(l.valor),
      vencimento: l.vencimento,
      situacao: l.situacao,
      forma: l.forma,
      pagaEm: l.paga_em,
      motivo: l.motivo,
      sessaoId: l.sessao_id,
      sessaoInicio: l.sessao_inicio,
      pacoteId: l.pacote_id,
      pacoteQuantidade: l.pacote_quantidade,
      referencia: l.referencia,
    }));
  }

  pagar(jwt: string, conta: string, cobranca: string, forma: FormaPagamento, pagaEm?: string): Promise<void> {
    return this.supabase.rpc<void>(jwt, 'cobranca_pagar', { c: conta, cb: cobranca, forma, paga_em: pagaEm ?? null });
  }

  desfazer(jwt: string, conta: string, cobranca: string, motivo: string): Promise<void> {
    return this.supabase.rpc<void>(jwt, 'cobranca_desfazer', { c: conta, cb: cobranca, motivo });
  }

  cancelar(jwt: string, conta: string, cobranca: string, motivo: string): Promise<void> {
    return this.supabase.rpc<void>(jwt, 'cobranca_cancelar', { c: conta, cb: cobranca, motivo });
  }

  valor(jwt: string, conta: string, cobranca: string, valor: number): Promise<void> {
    return this.supabase.rpc<void>(jwt, 'cobranca_valor', { c: conta, cb: cobranca, valor });
  }

  async pacotes(jwt: string, conta: string, paciente: string): Promise<PacoteDto[]> {
    const linhas = await this.supabase.rpc<PacoteBanco[]>(jwt, 'pacotes_listar', { c: conta, p: paciente });
    return linhas.map((l) => ({
      id: l.id,
      quantidade: l.quantidade,
      valor: n(l.valor),
      criadoEm: l.criado_em,
      usadas: l.usadas,
      restantes: l.restantes,
      cobranca: l.cobranca,
    }));
  }

  async novoPacote(jwt: string, conta: string, paciente: string, dto: NovoPacoteDto): Promise<{ id: string }> {
    const d = {
      ...(dto.quantidade !== undefined && { quantidade: dto.quantidade }),
      ...(dto.valor !== undefined && { valor: dto.valor }),
    };
    const id = await this.supabase.rpc<string>(jwt, 'pacote_criar', { c: conta, p: paciente, d });
    return { id };
  }

  async filaRecibos(jwt: string, conta: string): Promise<ItemFilaReciboDto[]> {
    const linhas = await this.supabase.rpc<FilaBanco[]>(jwt, 'recibos_fila', { c: conta });
    return linhas.map((l) => ({
      id: l.id,
      origem: l.origem,
      valor: n(l.valor),
      pagaEm: l.paga_em,
      forma: l.forma,
      sessaoInicio: l.sessao_inicio,
      pacoteQuantidade: l.pacote_quantidade,
      referencia: l.referencia,
      paciente: l.paciente,
      pagador: l.pagador,
    }));
  }

  async recibos(jwt: string, conta: string, f: FiltroRecibosDto): Promise<ReciboDto[]> {
    const filtro = {
      ...(f.de && { de: f.de }),
      ...(f.ate && { ate: f.ate }),
      ...(f.paciente && { paciente_id: f.paciente }),
    };
    const linhas = await this.supabase.rpc<ReciboBanco[]>(jwt, 'recibos_listar', { c: conta, filtro });
    return linhas.map((l) => ({
      id: l.id,
      pacienteId: l.paciente_id,
      numero: l.numero,
      emitidoEm: l.emitido_em,
      valor: n(l.valor),
      pagadorNome: l.pagador_nome,
      pagadorCpf: l.pagador_cpf,
      beneficiarioNome: l.beneficiario_nome,
      beneficiarioCpf: l.beneficiario_cpf,
      canceladoEm: l.cancelado_em,
      canceladoMotivo: l.cancelado_motivo,
      cobrancas: l.cobrancas,
    }));
  }

  async registrarRecibo(jwt: string, conta: string, dto: NovoReciboDto): Promise<{ id: string }> {
    const d = { cobrancas: dto.cobrancas, numero: dto.numero, emitido_em: dto.emitidoEm };
    const id = await this.supabase.rpc<string>(jwt, 'recibo_registrar', { c: conta, d });
    return { id };
  }

  cancelarRecibo(jwt: string, conta: string, recibo: string, motivo: string): Promise<void> {
    return this.supabase.rpc<void>(jwt, 'recibo_cancelar', { c: conta, r: recibo, motivo });
  }

  async relatorio(jwt: string, conta: string, mes: string): Promise<RelatorioMensalDto> {
    const b = await this.supabase.rpc<RelatorioBanco>(jwt, 'relatorio_mensal', { c: conta, mes: `${mes}-01` });
    return {
      mes: b.mes,
      realizadas: b.realizadas,
      faltas: b.faltas,
      desmarcadas: b.desmarcadas,
      online: b.online,
      pacientesAtendidos: b.pacientes_atendidos,
      pacientesNovos: b.pacientes_novos,
      recebido: n(b.recebido),
      aReceber: n(b.a_receber),
      porMes: b.por_mes.map((m) => ({ mes: m.mes, realizadas: m.realizadas, faltas: m.faltas, recebido: n(m.recebido) })),
    };
  }

  async daSessao(jwt: string, conta: string, sessao: string): Promise<SessaoFinanceiroDto> {
    const b = await this.supabase.rpc<SessaoFinanceiroBanco>(jwt, 'sessao_financeiro', { c: conta, s: sessao });
    return {
      pacote: b.pacote && { id: b.pacote.id, numero: b.pacote.numero, quantidade: b.pacote.quantidade },
      cobranca: b.cobranca && {
        id: b.cobranca.id,
        valor: n(b.cobranca.valor),
        vencimento: b.cobranca.vencimento,
        situacao: b.cobranca.situacao,
        forma: b.cobranca.forma,
        pagaEm: b.cobranca.paga_em,
      },
    };
  }
}
