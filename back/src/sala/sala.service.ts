import { Injectable } from '@nestjs/common';
import { ErroBanco, traduzirBanco } from '../comum/erros';
import { GoogleService } from '../google/google.service';
import { SupabaseService } from '../supabase/supabase.service';
import type { SalaPublicaDto, SalaSessaoDto } from './sala.dto';

interface SalaBanco {
  link: string | null;
  link_sessao: string | null;
  link_meet: string | null;
  link_perfil: string | null;
  token: string;
  epsi_ok: boolean;
  paciente_id: string;
  modalidade: 'presencial' | 'online';
  google: 'desconectada' | 'conectada' | 'reconectar';
}

@Injectable()
export class SalaService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly google: GoogleService,
  ) {}

  private ler(jwt: string, conta: string, sessao: string): Promise<SalaBanco> {
    return this.supabase.rpc<SalaBanco>(jwt, 'sala_sessao', { c: conta, s: sessao });
  }

  private paraDto(r: SalaBanco, avisoMeet: string | null = null): SalaSessaoDto {
    return {
      link: r.link,
      linkSessao: r.link_sessao,
      linkMeet: r.link_meet,
      linkPerfil: r.link_perfil,
      token: r.token,
      epsiOk: r.epsi_ok,
      google: this.google.disponivel() ? r.google : 'indisponivel',
      avisoMeet,
    };
  }

  /** Sessão online, Google conectado e paciente ainda sem sala do Meet: é hora de criar. */
  private precisaMeet(r: SalaBanco): boolean {
    return r.modalidade === 'online' && !r.link_meet && r.google === 'conectada' && this.google.disponivel();
  }

  /** Lê a sala e, se faltar, cria a sala do Meet do paciente. Falhar o Google nunca impede abrir a sessão. */
  async daSessao(jwt: string, conta: string, sessao: string): Promise<SalaSessaoDto> {
    const r = await this.ler(jwt, conta, sessao);
    if (!this.precisaMeet(r)) return this.paraDto(r);
    try {
      await this.google.criarMeet(jwt, conta, r.paciente_id);
      return this.paraDto(await this.ler(jwt, conta, sessao));
    } catch (e) {
      if (!(e instanceof ErroBanco)) throw e;
      return this.paraDto(await this.ler(jwt, conta, sessao), traduzirBanco(e).mensagem);
    }
  }

  /** "Gerar link do Meet" na janela: aqui a falha aparece como erro. */
  async gerarMeet(jwt: string, conta: string, sessao: string): Promise<SalaSessaoDto> {
    const r = await this.ler(jwt, conta, sessao);
    if (!this.google.disponivel() || r.google === 'desconectada') throw new ErroBanco('P0001', 'google_indisponivel');
    if (r.google === 'reconectar') throw new ErroBanco('P0001', 'google_reconectar');
    await this.google.criarMeet(jwt, conta, r.paciente_id);
    return this.paraDto(await this.ler(jwt, conta, sessao));
  }

  /** Depois de criar ou tornar online uma sessão: prepara o Meet sem atrasar nem travar a agenda por falha. */
  async prepararMeet(jwt: string, conta: string, sessao: string): Promise<void> {
    try {
      const r = await this.ler(jwt, conta, sessao);
      if (this.precisaMeet(r)) await this.google.criarMeet(jwt, conta, r.paciente_id);
    } catch {
      // A janela da sessão tenta de novo e mostra o aviso.
    }
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
