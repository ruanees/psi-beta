import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { exigirConfig } from '../comum/config';
import { ErroAuth } from '../comum/erros';
import { Jwt, Publico } from '../comum/publico';
import { GoTrueService, type SessaoGoTrue } from '../supabase/gotrue.service';
import {
  CodigoDto,
  EntrarDto,
  FatorDto,
  NovaSenhaDto,
  NovoFatorDto,
  RecuperarDto,
  RenovarDto,
  SegundoFatorDto,
  SessaoDto,
} from './sessao.dto';

// O front nunca fala com o Supabase. Sem estas rotas o formulário de login
// nasceria morto — a mesma consequência que o DIME descobriu na Fase 0.

@ApiTags('sessao')
@Controller('sessao')
export class SessaoController {
  constructor(private readonly gotrue: GoTrueService) {}

  @Publico()
  @Post('entrar')
  @HttpCode(200)
  @ApiOkResponse({ type: SessaoDto })
  async entrar(@Body() dto: EntrarDto): Promise<SessaoDto> {
    const s = await this.gotrue.entrar(dto.email.trim().toLowerCase(), dto.senha);
    const fator = s.user?.factors?.find((f) => f.factor_type === 'totp' && f.status === 'verified');
    return paraSessao(s, fator?.id);
  }

  @ApiBearerAuth()
  @Post('segundo-fator')
  @HttpCode(200)
  @ApiOkResponse({ type: SessaoDto })
  async segundoFator(@Jwt() jwt: string, @Body() dto: SegundoFatorDto): Promise<SessaoDto> {
    return paraSessao(await this.gotrue.verificarFator(jwt, dto.fatorId, dto.codigo));
  }

  @Publico()
  @Post('renovar')
  @HttpCode(200)
  @ApiOkResponse({ type: SessaoDto })
  async renovar(@Body() dto: RenovarDto): Promise<SessaoDto> {
    return paraSessao(await this.gotrue.renovar(dto.renovacao));
  }

  /** Responde 204 exista ou não o e-mail: a rota não serve para descobrir quem tem conta. */
  @Publico()
  @Post('recuperar')
  @HttpCode(204)
  @ApiNoContentResponse()
  async recuperar(@Body() dto: RecuperarDto): Promise<void> {
    // O endereço de retorno vem da configuração, nunca de quem pediu.
    const retorno = `${exigirConfig('FRONT_URL').replace(/\/$/, '')}/?etapa=nova-senha`;
    try {
      await this.gotrue.recuperar(dto.email.trim().toLowerCase(), retorno);
    } catch (e) {
      if (e instanceof ErroAuth && e.status < 429) return;
      throw e;
    }
  }

  @ApiBearerAuth()
  @Post('senha')
  @HttpCode(204)
  @ApiNoContentResponse()
  async senha(@Jwt() jwt: string, @Body() dto: NovaSenhaDto): Promise<void> {
    const claims = lerClaims(jwt);
    const u = await this.gotrue.usuario(jwt);
    // Quem ativou o segundo fator confirma o código antes, também depois do link de
    // recuperação: só o e-mail não basta para tomar a conta.
    const temFator = (u.factors ?? []).some((f) => f.factor_type === 'totp' && f.status === 'verified');
    if (temFator && claims.aal !== 'aal2') throw new ErroAuth(403, 'insufficient_aal');
    // Sem acabar de chegar pelo link de recuperação, a senha atual é obrigatória:
    // uma sessão esquecida aberta não troca a senha de ninguém.
    if (!veioDaRecuperacao(claims)) {
      if (!dto.senhaAtual) throw new ErroAuth(400, 'senha_atual_obrigatoria');
      await this.conferirSenhaAtual(u.email ?? '', dto.senhaAtual);
    }
    await this.gotrue.trocarSenha(jwt, dto.senha);
  }

  /** Confere sem mexer na sessão de quem pediu: a sessão aberta só para conferir é encerrada na hora. */
  private async conferirSenhaAtual(email: string, senhaAtual: string): Promise<void> {
    let conferida: SessaoGoTrue;
    try {
      conferida = await this.gotrue.entrar(email, senhaAtual);
    } catch (e) {
      if (e instanceof ErroAuth && e.status >= 400 && e.status < 429) throw new ErroAuth(422, 'senha_atual_incorreta');
      throw e;
    }
    await this.gotrue.sair(conferida.access_token).catch(() => undefined);
  }

  @ApiBearerAuth()
  @Post('sair')
  @HttpCode(204)
  @ApiNoContentResponse()
  async sair(@Jwt() jwt: string): Promise<void> {
    try {
      await this.gotrue.sair(jwt);
    } catch (e) {
      // Sessão que já não existe está, para quem quer sair, saída.
      if (!(e instanceof ErroAuth)) throw e;
    }
  }

  @ApiBearerAuth()
  @Get('fatores')
  @ApiOkResponse({ type: FatorDto, isArray: true })
  async fatores(@Jwt() jwt: string): Promise<FatorDto[]> {
    const u = await this.gotrue.usuario(jwt);
    return (u.factors ?? [])
      .filter((f) => f.factor_type === 'totp')
      .map((f) => ({ id: f.id, situacao: f.status === 'verified' ? 'verificado' : 'pendente', nome: f.friendly_name }));
  }

  @ApiBearerAuth()
  @Post('fatores')
  @ApiOkResponse({ type: NovoFatorDto })
  async cadastrarFator(@Jwt() jwt: string): Promise<NovoFatorDto> {
    // Cadastro que ficou pela metade bloquearia um novo com o mesmo nome.
    const u = await this.gotrue.usuario(jwt);
    for (const f of u.factors ?? []) {
      if (f.factor_type === 'totp' && f.status === 'unverified') await this.gotrue.removerFator(jwt, f.id);
    }
    const f = await this.gotrue.cadastrarFator(jwt, `PSI ${new Date().toISOString().slice(0, 10)}`);
    // O GoTrue devolve o SVG cru; a tela recebe pronto para um <img src>.
    const qr = f.totp.qr_code.startsWith('data:')
      ? f.totp.qr_code
      : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(f.totp.qr_code)}`;
    return { id: f.id, qr, segredo: f.totp.secret };
  }

  @ApiBearerAuth()
  @Post('fatores/:fator/confirmar')
  @HttpCode(200)
  @ApiOkResponse({ type: SessaoDto })
  async confirmarFator(@Jwt() jwt: string, @Param('fator') fator: string, @Body() dto: CodigoDto): Promise<SessaoDto> {
    return paraSessao(await this.gotrue.verificarFator(jwt, fator, dto.codigo));
  }

  @ApiBearerAuth()
  @Delete('fatores/:fator')
  @HttpCode(204)
  @ApiNoContentResponse()
  async removerFator(@Jwt() jwt: string, @Param('fator') fator: string): Promise<void> {
    await this.gotrue.removerFator(jwt, fator);
  }
}

function paraSessao(s: SessaoGoTrue, fatorPendente?: string): SessaoDto {
  const expiraEm = s.expires_at ?? Math.floor(Date.now() / 1000) + s.expires_in;
  const aal = lerAal(s.access_token);
  const precisaFator = Boolean(fatorPendente) && aal !== 'aal2';
  return {
    etapa: precisaFator ? 'segundo_fator' : 'pronta',
    acesso: s.access_token,
    renovacao: s.refresh_token,
    expiraEm,
    ...(precisaFator ? { fatorId: fatorPendente } : {}),
  };
}

interface Claims {
  aal?: string;
  amr?: { method?: string; timestamp?: number }[];
}

/** Lê o corpo do token sem validar: a validação de verdade é a do guard (ou o token acabou de vir do GoTrue). */
function lerClaims(token: string): Claims {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as Claims;
  } catch {
    return {};
  }
}

function lerAal(token: string): string | undefined {
  return lerClaims(token).aal;
}

/** O link de recuperação vale como prova de quem é por 15 minutos, não pela vida inteira da sessão. */
const JANELA_RECUPERACAO_S = 15 * 60;

export function veioDaRecuperacao(claims: Claims, agora = Math.floor(Date.now() / 1000)): boolean {
  return (claims.amr ?? []).some(
    (a) =>
      (a.method === 'recovery' || a.method === 'otp') &&
      typeof a.timestamp === 'number' &&
      agora - a.timestamp <= JANELA_RECUPERACAO_S,
  );
}
