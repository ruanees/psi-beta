import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { SalaPublicaDto, SalaSessaoDto } from './sala.dto';

@Injectable()
export class SalaService {
  constructor(private readonly supabase: SupabaseService) {}

  async daSessao(jwt: string, conta: string, sessao: string): Promise<SalaSessaoDto> {
    const r = await this.supabase.rpc<{
      link: string | null;
      link_sessao: string | null;
      link_perfil: string | null;
      token: string;
      epsi_ok: boolean;
    }>(jwt, 'sala_sessao', { c: conta, s: sessao });
    return { link: r.link, linkSessao: r.link_sessao, linkPerfil: r.link_perfil, token: r.token, epsiOk: r.epsi_ok };
  }

  gravarLink(jwt: string, conta: string, sessao: string, link: string | null): Promise<void> {
    return this.supabase.rpc<void>(jwt, 'sala_sessao_gravar', { c: conta, s: sessao, link: link?.trim() || null });
  }

  async renovar(jwt: string, conta: string, paciente: string): Promise<{ token: string }> {
    return { token: await this.supabase.rpc<string>(jwt, 'sala_paciente_renovar', { c: conta, p: paciente }) };
  }

  async publica(token: string): Promise<SalaPublicaDto> {
    const r = await this.supabase.rpcPublica<{
      profissional: string | null;
      situacao: SalaPublicaDto['situacao'];
      inicio?: string;
      fim?: string;
      abre_em?: string;
      link?: string | null;
    }>('sala_publica', { t: token });
    return {
      profissional: r.profissional,
      situacao: r.situacao,
      inicio: r.inicio ?? null,
      fim: r.fim ?? null,
      abreEm: r.abre_em ?? null,
      link: r.link ?? null,
    };
  }
}
