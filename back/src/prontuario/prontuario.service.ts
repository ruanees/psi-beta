import { Injectable } from '@nestjs/common';
import type { SessaoAgendaDto } from '../agenda/agenda.dto';
import { pacienteDoBanco, type PacienteBanco } from '../pacientes/pacientes.service';
import { SupabaseService } from '../supabase/supabase.service';
import { anamneseDoBanco, anamneseParaBanco } from './anamnese';
import type { AnamneseDto, AnamneseParcialDto } from './anamnese.dto';
import type {
  AcessoDto,
  FichaClinicaDto,
  ItemHistoricoDto,
  ObservacaoDto,
  PendenciaDto,
} from './prontuario.dto';

// Prontuário: observação de cada sessão, histórico, pendências e a ficha para
// impressão. Quem pode ler o quê é o banco que decide (pode_clinico); aqui só
// se troca o formato.

interface ObservacaoBanco {
  pode_clinico: boolean;
  registravel?: boolean;
  editavel?: boolean;
  editavel_ate?: string;
  texto?: string | null;
  versao?: number | null;
  alterada_em?: string | null;
  versoes?: { versao: number; texto: string; gravada_em: string }[];
  adendos?: { id: string; texto: string; criado_em: string }[];
}

interface SessaoBanco {
  id: string;
  inicio: string;
  fim: string;
  modalidade: SessaoAgendaDto['modalidade'];
  status: SessaoAgendaDto['status'];
  recorrencia_id?: string | null;
  intervalo_semanas?: number | null;
}

type HistoricoBanco = SessaoBanco & {
  observacao: string | null;
  alterada_em: string | null;
  versao: number | null;
  adendos: number;
  editavel_ate: string;
};

type PendenciaBanco = SessaoBanco & { paciente_id: string; paciente_nome: string; editavel_ate: string };

type FichaBanco = PacienteBanco & {
  anamnese: Record<string, unknown> | null;
  emitida_em: string;
  profissional: { nome: string; crp: string | null } | null;
  sessoes: (SessaoBanco & {
    observacao: string | null;
    alterada_em: string | null;
    adendos: { texto: string; criado_em: string }[];
  })[];
};

@Injectable()
export class ProntuarioService {
  constructor(private readonly supabase: SupabaseService) {}

  async observacao(jwt: string, conta: string, sessao: string): Promise<ObservacaoDto> {
    const b = await this.supabase.rpc<ObservacaoBanco>(jwt, 'observacao_ler', { c: conta, s: sessao });
    return {
      podeClinico: b.pode_clinico,
      registravel: b.registravel ?? false,
      editavel: b.editavel ?? false,
      editavelAte: b.editavel_ate ?? null,
      texto: b.texto ?? null,
      versao: b.versao ?? null,
      alteradaEm: b.alterada_em ?? null,
      versoes: (b.versoes ?? []).map((v) => ({ versao: v.versao, texto: v.texto, gravadaEm: v.gravada_em })),
      adendos: (b.adendos ?? []).map((a) => ({ id: a.id, texto: a.texto, criadoEm: a.criado_em })),
    };
  }

  gravarObservacao(jwt: string, conta: string, sessao: string, texto: string): Promise<void> {
    return this.supabase.rpc<void>(jwt, 'observacao_gravar', { c: conta, s: sessao, texto });
  }

  async adendo(jwt: string, conta: string, sessao: string, texto: string): Promise<{ id: string }> {
    const id = await this.supabase.rpc<string>(jwt, 'adendo_criar', { c: conta, s: sessao, texto });
    return { id };
  }

  async historico(jwt: string, conta: string, paciente: string): Promise<ItemHistoricoDto[]> {
    const linhas = await this.supabase.rpc<HistoricoBanco[]>(jwt, 'historico_paciente', { c: conta, p: paciente });
    return linhas.map((l) => ({
      id: l.id,
      inicio: l.inicio,
      fim: l.fim,
      modalidade: l.modalidade,
      status: l.status,
      recorrenciaId: l.recorrencia_id ?? null,
      intervaloSemanas: l.intervalo_semanas ?? null,
      observacao: l.observacao,
      alteradaEm: l.alterada_em,
      versao: l.versao,
      adendos: l.adendos,
      editavelAte: l.editavel_ate,
    }));
  }

  async pendencias(jwt: string, conta: string): Promise<PendenciaDto[]> {
    const linhas = await this.supabase.rpc<PendenciaBanco[]>(jwt, 'pendencias_observacao', { c: conta });
    return linhas.map((l) => ({
      id: l.id,
      pacienteId: l.paciente_id,
      pacienteNome: l.paciente_nome,
      inicio: l.inicio,
      fim: l.fim,
      modalidade: l.modalidade,
      status: l.status,
      recorrenciaId: l.recorrencia_id ?? null,
      intervaloSemanas: l.intervalo_semanas ?? null,
      editavelAte: l.editavel_ate,
    }));
  }

  async ficha(jwt: string, conta: string, paciente: string): Promise<FichaClinicaDto> {
    const b = await this.supabase.rpc<FichaBanco>(jwt, 'ficha_clinica', { c: conta, p: paciente });
    return {
      paciente: pacienteDoBanco(b),
      profissional: b.profissional,
      emitidaEm: b.emitida_em,
      anamnese: b.anamnese ? anamneseDoBanco(b.anamnese) : null,
      sessoes: b.sessoes.map((s) => ({
        id: s.id,
        inicio: s.inicio,
        fim: s.fim,
        modalidade: s.modalidade,
        status: s.status,
        observacao: s.observacao,
        alteradaEm: s.alterada_em,
        adendos: s.adendos.map((a) => ({ texto: a.texto, criadoEm: a.criado_em })),
      })),
    };
  }

  async anamnese(jwt: string, conta: string, paciente: string): Promise<AnamneseDto> {
    const r = await this.supabase.rpc<Record<string, unknown> & { pode_clinico: boolean }>(jwt, 'anamnese_ler', {
      c: conta,
      p: paciente,
    });
    return anamneseDoBanco(r.pode_clinico ? r : null, r.pode_clinico);
  }

  gravarAnamnese(jwt: string, conta: string, paciente: string, dto: AnamneseParcialDto): Promise<void> {
    return this.supabase.rpc<void>(jwt, 'anamnese_gravar', { c: conta, p: paciente, d: anamneseParaBanco(dto) });
  }

  acessos(jwt: string, conta: string, paciente: string): Promise<AcessoDto[]> {
    return this.supabase.rpc<AcessoDto[]>(jwt, 'paciente_acessos', { c: conta, p: paciente });
  }
}
