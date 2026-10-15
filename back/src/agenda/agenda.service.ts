import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  AlterarSessaoDto,
  DesmarcarDto,
  DesmarcarRespostaDto,
  NovaSessaoDto,
  PainelDto,
  SessaoAgendaDto,
  SessaoDoPacienteDto,
} from './agenda.dto';

interface SessaoBanco {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  inicio: string;
  fim: string;
  modalidade: SessaoAgendaDto['modalidade'];
  status: SessaoAgendaDto['status'];
  recorrencia_id?: string | null;
}

function sessao(b: SessaoBanco): SessaoAgendaDto {
  return {
    id: b.id,
    pacienteId: b.paciente_id,
    pacienteNome: b.paciente_nome,
    inicio: b.inicio,
    fim: b.fim,
    modalidade: b.modalidade,
    status: b.status,
    recorrenciaId: b.recorrencia_id ?? null,
  };
}

@Injectable()
export class AgendaService {
  constructor(private readonly supabase: SupabaseService) {}

  async listar(jwt: string, conta: string, de: string, ate: string): Promise<SessaoAgendaDto[]> {
    const linhas = await this.supabase.rpc<SessaoBanco[]>(jwt, 'agenda_listar', { c: conta, de, ate });
    return linhas.map(sessao);
  }

  async doPaciente(jwt: string, conta: string, paciente: string): Promise<SessaoDoPacienteDto[]> {
    const linhas = await this.supabase.rpc<Omit<SessaoBanco, 'paciente_id' | 'paciente_nome'>[]>(
      jwt,
      'sessoes_do_paciente',
      { c: conta, p: paciente },
    );
    return linhas.map((l) => ({
      id: l.id,
      inicio: l.inicio,
      fim: l.fim,
      modalidade: l.modalidade,
      status: l.status,
      recorrenciaId: l.recorrencia_id ?? null,
    }));
  }

  async painel(jwt: string, conta: string): Promise<PainelDto> {
    const p = await this.supabase.rpc<{
      hoje: SessaoBanco[];
      sessoes_semana: number;
      pacientes_ativos: number;
      sem_proxima: { id: string; nome: string; ultima_sessao: string | null }[];
    }>(jwt, 'painel_inicio', { c: conta });
    return {
      hoje: p.hoje.map(sessao),
      sessoesSemana: p.sessoes_semana,
      pacientesAtivos: p.pacientes_ativos,
      semProxima: p.sem_proxima.map((x) => ({ id: x.id, nome: x.nome, ultimaSessao: x.ultima_sessao })),
    };
  }

  async criar(jwt: string, conta: string, dto: NovaSessaoDto): Promise<{ id: string }> {
    const id = await this.supabase.rpc<string>(jwt, 'sessao_criar', {
      c: conta,
      d: {
        paciente_id: dto.pacienteId,
        inicio: dto.inicio,
        duracao_min: dto.duracaoMin,
        modalidade: dto.modalidade,
        repetir_semanal: dto.repetirSemanal ?? false,
      },
    });
    return { id };
  }

  async alterar(jwt: string, conta: string, sessaoId: string, dto: AlterarSessaoDto): Promise<{ id: string }> {
    const d: Record<string, unknown> = {};
    if (dto.inicio !== undefined) d.inicio = dto.inicio;
    if (dto.duracaoMin !== undefined) d.duracao_min = dto.duracaoMin;
    if (dto.modalidade !== undefined) d.modalidade = dto.modalidade;
    const id = await this.supabase.rpc<string>(jwt, 'sessao_alterar', {
      c: conta,
      s: sessaoId,
      d,
      escopo: dto.escopo ?? 'esta',
    });
    return { id };
  }

  status(jwt: string, conta: string, sessaoId: string, novo: string): Promise<void> {
    return this.supabase.rpc<void>(jwt, 'sessao_status', { c: conta, s: sessaoId, novo });
  }

  async desmarcar(jwt: string, conta: string, sessaoId: string, dto: DesmarcarDto): Promise<DesmarcarRespostaDto> {
    const r = await this.supabase.rpc<{ resultado: 'cancelada' | 'falta'; horas_aviso: number; prazo_horas: number }>(
      jwt,
      'sessao_desmarcar',
      { c: conta, s: sessaoId, aviso_em: dto.avisoEm ?? new Date().toISOString(), simular: dto.simular ?? false },
    );
    return { resultado: r.resultado, horasAviso: Number(r.horas_aviso), prazoHoras: r.prazo_horas };
  }

  async encerrarRepeticao(jwt: string, conta: string, sessaoId: string): Promise<{ removidas: number }> {
    const removidas = await this.supabase.rpc<number>(jwt, 'recorrencia_encerrar', { c: conta, s: sessaoId });
    return { removidas };
  }
}
