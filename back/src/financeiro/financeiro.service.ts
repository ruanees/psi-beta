import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  CobrancaDto,
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
