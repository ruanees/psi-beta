# PSI — plataforma de gestão para clínicas e psicólogos

> Plano vivo. Nasce do que a migração do DIME ensinou (`MIGRACAO.md` do DIME), aplica a um domínio novo — consultório e clínica de psicologia — e agora tem o **escopo do beta fechado** a partir do levantamento feito com os psicólogos.

O DIME levou seis fases para sair de um `index.html` de 3000 linhas e chegar a Front/Back/Infra. O PSI não tem app antigo para migrar — ele **começa** onde o DIME terminou. Isso permite pular o caminho de convivência (strangler, `CompatController`, importação repetível) e trazer só o que deu certo, mais o que a área da saúde exige e a área musical não exigia: sigilo, registro documental, retenção e auditoria.

---

## 00 — Como ler este documento

- **Seção 01** é o escopo do beta: os 11 pedidos dos psicólogos, o que cada um vira e em que fase entra.
- **Seção 02** é o que ainda precisa ser perguntado a eles antes de codar a fase correspondente.
- **Seção 03** traduz o DIME para o PSI: o que fica igual, o que muda e por quê.
- **Seção 04** é o domínio: papéis, regulamentação, mapa de status.
- **Seção 05** é a arquitetura e o modelo de dados do beta.
- **Seções 06 a 13** são as fases do beta, em microatividades com caixa de marcar.
- **Seção 14** é o que vem depois do beta.
- **Seção 15** é o que está em aberto.

A regra de escrita é a mesma do DIME: sem emoji, sem exclamação, nenhum botão genérico ("OK", "Enviar") — o botão diz o que faz ("Registrar presença", "Marcar como pago").

---

## 01 — Escopo do beta

Levantado com os psicólogos. Nada fora desta lista entra no beta; o que é pedido de fora vai para a seção 14.

| # | Pedido | O que vira | Fase |
|---|---|---|---|
| 1 | **Cadastro de pacientes** — nome, pais/responsáveis, telefone, queixa principal | Tabela `pacientes` + `responsaveis` (vários por paciente). A queixa principal é dado clínico: só o psicólogo do paciente lê | 1 |
| 2 | **Registro dos atendimentos** — data, horário, presença/falta, observações do dia | `sessoes` com status e `observacoes` com versões guardadas. Juridicamente, a observação é o registro de evolução do prontuário — é tratada com esse rigor | 2 |
| 3 | **Controle financeiro** — pagou ou não, valor, forma de pagamento | `cobrancas` com situação (pendente/pago), valor, forma e data do pagamento | 3 |
| 4 | **Controle de sessões** — individual ou pacote, usadas e restantes | `pacotes` + saldo calculado **num lugar só** (view no banco), nunca contado na tela | 3 |
| 5 | **Histórico do paciente** — atendimentos, observações e pagamentos anteriores | Aba **Histórico** na ficha: linha do tempo que junta sessão, observação e pagamento | 2 e 3 |
| 6 | **Recibos e notas fiscais** — controle da emissão e histórico | `documentos_fiscais` ligados às cobranças: tipo, número, data, situação, arquivo. Recibo interno em PDF gerado pela plataforma; a emissão oficial (Receita Saúde / NFS-e) é feita fora e **registrada** aqui | 4 |
| 7 | **Relatórios** — realizados, faltas, recebidos, pendentes, valores mensais | `ReportBuilderService`: um construtor, três saídas (tela, CSV, impressão) | 4 |
| 8 | **Agenda** — pacientes por dia e horário | Visão dia e semana; repetição semanal opcional | 1 |
| 9 | **Busca de pacientes** — por nome, rápido | Busca no topo, sem acento e com erro de digitação (`unaccent` + `pg_trgm`), também pelo nome do responsável | 1 |
| 10 | **Acesso privado** — login e senha | Supabase Auth via BFF; recuperação de senha; saída automática por inatividade; segundo fator (TOTP) opcional | 0 |
| 11 | **Atendimento online** — gerir consultas online, espaço para atender | Sessão com modalidade online e **sala online** própria: página da sala para o psicólogo e link seguro para o paciente entrar sem login | 5 |

**Para quem é o beta:** psicólogos que atendem sozinhos, cada um na sua conta. O modelo de dados já nasce multiprofissional (o autônomo é "uma clínica de um"), mas a tela de equipe, a recepção e a gestão de clínica com vários profissionais ficam para depois do beta. Isso corta a Fase de equipe inteira sem criar dívida.

**O que o beta não tem, e é decisão:** documentos psicológicos (laudo, relatório etc.), anamnese estruturada, instrumentos (PHQ-9, GAD-7), portal do paciente, lembrete por WhatsApp, cobrança por gateway, emissão fiscal integrada, assinatura SaaS e painel de clínicas. Todos estão na seção 14.

### Duas coisas que o levantamento implica, e não foram ditas

- **CPF do pagador.** O pedido 6 (recibos e notas) depende dele: o recibo do Receita Saúde e a NFS-e exigem CPF de quem paga e de quem foi atendido. Por isso o cadastro ganha CPF **opcional** no paciente e no responsável financeiro, e o recibo avisa quando falta.
- **Data de nascimento.** O pedido 1 cita pais e responsáveis, o que indica atendimento infantil. Com a data de nascimento o sistema sabe que o paciente é menor e exige ao menos um responsável — regra no servidor.

---

## 02 — Perguntas a fechar com os psicólogos

Cada uma bloqueia só a fase indicada. Enquanto não houver resposta, vale o padrão da coluna da direita, configurável por conta.

| Pergunta | Bloqueia | Padrão até a resposta |
|---|---|---|
| Falta **consome** uma sessão do pacote? | Fase 3 | Configurável: "falta conta como sessão usada" ligado |
| Falta de sessão avulsa é cobrada? Com quanto tempo de aviso deixa de ser? | Fase 3 | Configurável: cobra se o aviso vier com menos de 24 h |
| Pacote é pago adiantado inteiro, parcelado, ou conforme usa? | Fase 3 | Uma cobrança por pacote, com parcelas opcionais |
| Pacote tem validade? | Fase 3 | Sem validade |
| A observação pode ser corrigida depois? Até quando? | Fase 2 | Editável sempre, **toda versão guardada** e visível no histórico |
| Cada paciente tem um valor de sessão próprio, ou é um valor único? | Fase 3 | Valor padrão da conta, sobrescrito por paciente |
| Emitem recibo como pessoa física (Receita Saúde) ou nota como empresa (NFS-e)? | Fase 4 | Os dois tipos disponíveis |
| Hoje atendem online por Meet, Zoom, WhatsApp? Querem o vídeo **dentro** da plataforma? | Fase 5 | Link externo primeiro, vídeo embutido em seguida |
| A maioria dos pacientes tem horário fixo semanal? | Fase 1 | Repetição semanal disponível |
| Alguém além do psicólogo (secretária) precisa entrar no beta? | Fase 0 | Não |

---

## 03 — Do DIME para o PSI

### Fica igual (já provado em produção no DIME)

| No DIME | No PSI | Por quê |
|---|---|---|
| Dois repos, `DIME-FRONT` (Next) e `DIME-BACK` (Nest) | `PSI-FRONT` e `PSI-BACK` | Contrato por OpenAPI resolveu o alinhamento sem monorepo nem pacote publicado |
| NestJS como **BFF**, regra de acesso no Postgres (RLS + `security definer`) | Idem | Regra de acesso escrita em dois lados se desencontra calada |
| Front nunca fala com o Supabase, só com o back | Idem, com a mesma exceção: upload vai direto ao Storage por URL assinada | Nenhuma credencial no bundle; o Worker não carrega bytes |
| `@nestjs/swagger` → `/openapi.json` público → `openapi-typescript` no build do front | Idem | DTO muda, tipo desatualizado vira erro de build |
| Cloudflare Workers nos dois (`@opennextjs/cloudflare` no front, `httpServerHandler` no back) | Idem | Grátis, não dorme, já validado |
| Guard global de JWT, rota nasce fechada, `@Publico()` para abrir | Idem — a página do paciente na sala online é a única rota pública de negócio | |
| `/saude` diz se a config existe e **de onde veio**, nunca o valor | Idem, e nunca dado de paciente | Foi o que encerrou três rodadas de adivinhação no DIME |
| CI roda **o mesmo comando** que a publicação (`npm run build`) e gera o bundle a cada push | Idem | CI verde com deploy quebrado já aconteceu |
| Erro sem `code` do PostgREST = transporte = 503 | Idem | Senão a API mente ("você não tem acesso") para um DNS errado |
| Cache de link assinado inclui **quem pediu** | Idem, e com TTL curto | Cache só por caminho entrega o link de uma pessoa para outra |
| `FichaRouter` por tabela, nunca if/else | Idem (paciente, sessão) | Módulo novo caía no lugar errado sem erro |
| Menu como dado (`lib/menu.ts`), três telas saindo dele, prova na CI | Idem | Item que some no celular e ninguém reproduz |
| Item sem tela aparece apagado com selo "em breve" | Idem | 404 parece deploy quebrado |
| Campo grava no blur, campo a campo | Idem | Gravar o objeto inteiro apaga o que a tela não conhece |
| Regra que decide "pronto" mora no servidor (`credPend` → `pendencias`) | Idem (saldo de pacote, sessão sem observação, cobrança vencida) | O front desenha, não decide |
| `fd(iso)` / `fdDe(Date)` como único formatador de data | Idem, mais `moeda()` e `duracao()` | Data escrita à mão é onde a segunda grafia começa |
| Grade em componente é `data-n`, nunca `style` | Idem | O React re-serializa `repeat(4, 1fr)` com espaço |
| `AgendaLinha` com `acoes` separado de `extra` | Idem | À esquerda o que a linha é, à direita o que se faz com ela |
| Um formulário só para criar e editar | Idem (paciente, sessão, pacote) | Dois se desencontram no dia em que um campo muda de lugar |
| Selo do rodapé carimbado no build | Idem | |
| Rota velha sai um passo **depois** da nova, nunca no mesmo | Idem | Aba aberta segue com o JS antigo |
| Mock no formato do dado real; prova que prende nome de campo, conferida quebrando de propósito | Idem | `ok` vs `done`, `funcao` vs `papel` |

### Muda (e o próprio DIME apontou para isso)

1. **Tabelas relacionais desde o dia 1, não um documento `jsonb` por espaço.** O DIME nasceu com `dados_espaco` e já começou a sair dele (as tarefas foram para a tabela `tarefas`). No PSI cada observação precisa de dono, data, versões e uma política de acesso **por linha**. Isso é RLS por linha, que um documento único não dá.
2. **Migrations versionadas, não "passo 30 do README".** `supabase/migrations/` no `PSI-BACK`, aplicadas pela Supabase CLI. Toda função `security definer` e toda política nascem num arquivo com número e entram por PR.
3. **Prova de RLS na CI.** O DIME aprendeu que "o mock responde o que eu mandei ele responder". No PSI a CI sobe um Postgres local (`supabase start`) e roda testes pgTAP que logam como cada conta e conferem o que cada uma enxerga. É a única prova que pega política vazando.
4. **Auditoria de leitura, não só histórico de escrita.** Quem abriu a ficha clínica de quem, e quando.
5. **Staging separado é obrigatório**, não "fora de escopo por ora". Dois projetos Supabase: produção e homologação, a segunda só com dado sintético. Preview de PR **nunca** aponta para a base de produção.
6. **IDs são UUID em tudo.** Sem legado, sem `IdDeItemPipe`: `ParseUUIDPipe` em toda rota.
7. **Sem convivência com app antigo.** A regra de rota velha continua valendo entre deploys do próprio PSI.
8. **Nada sensível em log, URL ou notificação.** Nome de paciente nunca vai em query string, em log do Worker, em título de evento de calendário externo nem no link da sala online.

---

## 04 — O domínio

### Papéis

| Papel | No beta | O que **não** vê |
|---|---|---|
| **Psicólogo** (titular da própria conta) | Sim | Nada de outra conta |
| **Paciente** na sala online | Sim, sem login, só a página da sala | Qualquer dado além de data, hora e nome do psicólogo |
| **Recepção / secretaria** | Depois do beta | Nada clínico: queixa, observações |
| **Financeiro** | Depois do beta | Nada clínico |
| **Super-admin** (você) | Sim, só para criar contas | Nenhum dado clínico — nem por suporte |

### O que a regulamentação pede, e como o beta cumpre

Conferir com advogado antes da Fase 2 — as referências abaixo foram levantadas de memória e precisam de revisão nas fontes.

| Obrigação | Fonte | No beta |
|---|---|---|
| Registro documental de cada atendimento, guarda mínima de 5 anos | Resolução CFP 001/2009 | Observação por sessão, com versões; nenhuma rota apaga paciente com atendimento — o paciente é **arquivado** |
| Sigilo | Código de Ética | Conta isolada por RLS; auditoria de leitura; nada clínico em log, URL ou notificação |
| Atendimento online exige cadastro no e-Psi | Resolução CFP 11/2018 | Perfil guarda o número do e-Psi; a sala online avisa se estiver vazio |
| Dado de saúde é dado pessoal sensível | LGPD, art. 11 | Banco em São Paulo, consentimento registrado no cadastro, exportação dos dados do paciente |
| Recibo do profissional pessoa física | Receita Saúde (Receita Federal) | O beta registra o número e anexa o comprovante; emissão integrada depois |
| Teste psicológico restrito não se digitaliza | SATEPSI | Fora do beta |

### Status de sessão (o mapa de cor vem antes do código)

O DIME aprendeu que dois estados com o mesmo selo confundem (Confirmado e Realizado verdes). Definido de saída:

| Status | Cor | Significado | Consome pacote | Gera cobrança avulsa |
|---|---|---|---|---|
| Agendada | cinza | marcada, sem confirmação | não | não |
| Confirmada | âmbar | fechada, **parada esperando a data** | não | não |
| Realizada | verde | aconteceu | sim | sim |
| Falta | vermelho | paciente não veio, sem aviso no prazo | configurável | configurável |
| Cancelada | cinza tracejado | desmarcada no prazo | não | não |

Status nunca violeta — violeta é escopo e ação, como no kit do DIME. Situação de cobrança tem mapa próprio: **Pendente** âmbar, **Paga** verde, **Vencida** vermelho.

---

## 05 — Arquitetura

```
Next.js (browser)  --REST + JWT-->  NestJS (BFF, DTO)  --supabase-js-->  Supabase
                                                                          ├── Postgres + RLS + RPCs security definer
                                                                          ├── Storage (bucket privado `fiscais`)
                                                                          └── Edge Function `admin-contas`
         \--- upload direto por URL assinada -----------------------------> Storage
Paciente (browser) --/sala/:token (público)--> NestJS --> provedor de vídeo (Fase 5)
```

- **Região**: projeto Supabase em São Paulo (`sa-east-1`).
- **Backup**: PITR ligado na produção desde o primeiro paciente real.
- **CSP**: `connect-src` = domínio do back + URL **exata** do projeto Supabase; na Fase 5, `frame-src` com o domínio exato do provedor de vídeo e `Permissions-Policy` liberando câmera e microfone só na rota da sala.
- **`wrangler.toml`**: `SUPABASE_URL` e `SUPABASE_ANON_KEY` ficam no arquivo (são públicas por design e o deploy sobrescreve config do painel). Segredos de verdade: `SUPABASE_JWT_SECRET` e, na Fase 5, a chave do provedor de vídeo.
- **As três armadilhas do Nest no Workers**, já pagas no DIME: flag `enable_nodejs_http_server_modules`, `alias` para `@nestjs/microservices`/`@nestjs/websockets`, e **nada de Swagger UI**.
- **`NEXT_PUBLIC_*` é variável de build**, e o `buildCommand` do `open-next.config.ts` não pode chamar `npm run build` (recursão).

### Modelo de dados do beta

```
-- Fase 0
contas              id, nome, criada_em                 -- "clínica de um"; vira clínica depois
membros             conta_id, user_id, papel             -- no beta só 'psicologo'
profissionais       membro_id, nome, crp, uf_crp, epsi_numero, valor_sessao_padrao
configuracoes       conta_id, falta_consome_pacote, falta_cobra_avulsa, aviso_minimo_horas,
                    inatividade_minutos
auditoria           id, quem, acao (ler|criar|editar|arquivar|exportar), tabela,
                    registro_id, paciente_id?, em

-- Fase 1  (pedidos 1, 8, 9)
pacientes           id, conta_id, profissional_id, nome, nascimento?, cpf?, telefone,
                    queixa_principal, valor_sessao?, situacao (ativo|alta|arquivado),
                    consentimento_em
responsaveis        id, paciente_id, nome, parentesco, telefone, cpf?, financeiro bool
recorrencias        id, paciente_id, dia_semana, hora, duracao, inicio, fim?
sessoes             id, conta_id, paciente_id, profissional_id, recorrencia_id?,
                    inicio, fim, modalidade (presencial|online), status,
                    tipo (avulsa|pacote), pacote_id?, valor?
                    -- EXCLUDE USING gist: duas sessões do mesmo profissional não se sobrepõem

-- Fase 2  (pedidos 2, 5)
observacoes         id, sessao_id, autor_id, texto, criada_em, alterada_em
observacoes_versoes observacao_id, texto, gravada_em, gravada_por   -- trigger, nunca a tela

-- Fase 3  (pedidos 3, 4)
pacotes             id, paciente_id, quantidade, valor_total, inicio, validade?, situacao
pacote_saldo        VIEW: pacote_id, usadas, restantes        -- a única conta de saldo
cobrancas           id, conta_id, paciente_id, origem (sessao|pacote), sessao_id?, pacote_id?,
                    valor, vencimento, situacao (pendente|paga|cancelada),
                    forma (pix|dinheiro|cartao|transferencia|boleto)?, paga_em?

-- Fase 4  (pedidos 6, 7)
documentos_fiscais  id, conta_id, paciente_id, tipo (recibo_interno|receita_saude|nfse),
                    numero?, emitido_em?, valor, situacao (pendente|emitido|cancelado),
                    arquivo_caminho?, pagador_nome, pagador_cpf?
documento_cobrancas documento_id, cobranca_id            -- um recibo pode cobrir várias

-- Fase 5  (pedido 11)
salas_online        sessao_id, provedor (externo|daily|jaas), link_profissional,
                    token_paciente, abre_em, expira_em
```

### Funções de acesso

| Função | Responde |
|---|---|
| `eh_membro(conta)` | está na conta |
| `pode_clinico(paciente)` | é o profissional do paciente — base de toda leitura de queixa e observação |
| `pode_arquivo(balde, caminho)` | confere o caminho contra `documentos_fiscais` e a conta |
| `registrar_leitura(paciente, tabela, id)` | grava em `auditoria`; chamada **dentro** das RPCs de leitura clínica, não pelo Nest |
| `sala_por_token(token)` | devolve só data, hora, nome do profissional e o link do paciente, e só dentro da janela `abre_em`–`expira_em` |
| `eh_super()` | super-admin, sem acesso clínico nenhum |

A leitura clínica passa **sempre** por RPC (`ficha_clinica(paciente)`, `historico_paciente(paciente)`), nunca por `select` direto — é o que garante que a auditoria não dependa de alguém lembrar de chamá-la. Mesmo princípio do DIME: quem protege é a RPC.

### Peças nomeadas

| Peça no front | Serviço no back | Usada em |
|---|---|---|
| `<FichaRouter>` + `useFicha()` | — | paciente, sessão |
| `<AgendaDia>` / `<AgendaSemana>` + `<AgendaLinha>` | `AgendaService` | Agenda, Início, ficha |
| `<BuscaPaciente>` (atalho `/` no teclado) | `PacienteService.buscar` | barra do topo |
| `<SessaoCartao>` (presença, falta, observação, pagamento num lugar só) | `SessaoService` | Agenda, Histórico |
| `<ObservacaoEditor>` (grava no blur, mostra versões) | `ObservacaoService` | sessão, Histórico |
| `<SaldoPacote>` | lê `pacote_saldo` | ficha, Agenda, Início |
| `<CobrancaLinha>` + `<MarcarPago>` | `CobrancaService` | Financeiro, ficha |
| `<DocumentoFiscalForm>` + `<AttachmentUploader>` | `FiscalService` + `StorageProxyService` | Recibos e notas |
| `<LinhaDoTempo>` | `HistoricoService` | aba Histórico |
| registro de `<ReportSection>` | `ReportBuilderService` (`{quadros, colunas, linhas}`) | Relatórios |
| `<SalaOnline>` | `SalaService` | sessão online, `/sala/:token` |
| `<Pendencias>` | `PendenciaService` | Início, ficha |
| `<SeloStatus>` sobre um mapa único | — | todo lugar com status |

### Menu do beta (`lib/menu.ts`)

`Início · Agenda · Pacientes · Financeiro · Relatórios`, com a busca e a conta na ponta direita. Financeiro tem duas abas: **Cobranças** e **Recibos e notas**. Atendimento online não é item de menu — mora na sessão, que é onde ele acontece; o Início mostra "próxima sessão online" com o botão de entrar.

### Ficha do paciente (abas)

**Resumo** (próxima sessão, saldo do pacote, a receber, queixa principal) · **Histórico** (linha do tempo: sessão + observação + pagamento — o pedido 5 inteiro numa tela) · **Pacotes** · **Financeiro** · **Recibos e notas** · **Dados** (cadastro, responsáveis, consentimento, acessos à ficha).

---

## 06 — Fase −1 — Antes do código

- [x] Levantar com psicólogos o que entra no beta (seção 01)
- [ ] Responder as perguntas da seção 02 — pode ser uma rodada curta por mensagem
- [ ] Escolher o nome e registrar o domínio
- [ ] Conversa com advogado de LGPD/saúde: termos de uso, política de privacidade, contrato de operador (DPA), revisão das referências da seção 04
- [ ] Recrutar de 3 a 5 psicólogos para testar o beta, de preferência os entrevistados

## 07 — Fase 0 — Fundações e acesso privado (pedido 10)

Nada de tela de negócio. Só o esqueleto que todo módulo vai importar, e o login.

**Infra**
- [ ] Criar `PSI-FRONT` e `PSI-BACK`, privados, `main` protegida, `.env.example` com placeholder e `.env` no `.gitignore`
- [ ] Dois projetos Supabase: `psi-prod` e `psi-homolog` (São Paulo); PITR na produção
- [ ] `wrangler.toml` do back com as flags, os `alias` e as variáveis públicas; Workers Builds conectado nos dois repos
- [ ] Preview de PR do front aponta para o back de homologação, nunca para produção
- [ ] CI do back: typecheck + testes + gerar `openapi.json` + gerar bundle do Worker + `supabase start` + `supabase db reset` + pgTAP
- [ ] CI do front: typecheck + `npm run build` (o mesmo da publicação) + codegen contra o back de homologação + `prova:menu`
- [ ] CSP com `connect-src` exato
- [ ] Selo do rodapé carimbado no build

**Banco**
- [ ] `contas`, `membros`, `profissionais`, `configuracoes`, `auditoria`
- [ ] `eh_membro`, `eh_super`, `registrar_leitura`
- [ ] pgTAP: conta A não lê nada da conta B, em nenhuma tabela

**Back**
- [ ] `AuthModule` com guard global, `@Publico()` explícito
- [ ] `SupabaseService` por request com o JWT de quem chamou
- [ ] `POST /sessao/entrar|renovar|recuperar|senha`
- [ ] Segundo fator TOTP (Supabase MFA) disponível e opcional
- [ ] Filtro de erro: sem `code` do PostgREST → 503 com frase pronta
- [ ] `/saude` com origem da configuração, sem valores
- [ ] Interceptor de log que **remove** corpo de requisição e qualquer campo de paciente
- [ ] `GET /conta`, `PATCH /conta/perfil` (CRP, e-Psi, valor padrão), `PATCH /conta/configuracoes`
- [ ] Criação de conta só pelo super-admin via `admin-contas` — o beta é fechado, sem cadastro aberto

**Front**
- [ ] Portar `tokens.css` + `components.css` do DIME e trocar só a paleta (tons mais calmos); mapa de status da seção 04
- [ ] Tema pré-paint (`data-theme`) via `next/script beforeInteractive`
- [ ] Login com entrar / esqueci / nova senha (repetir a senha nova) na mesma tela
- [ ] Saída automática após N minutos sem uso (consultório tem computador compartilhado)
- [ ] `lib/menu.ts` com os cinco itens; item sem tela com selo "em breve"; barra no topo no desktop, rodapé com alvos de 56px no celular
- [ ] Tela de perfil e configurações
- [ ] `useFicha()` sobre a tabela de fichas
- [ ] `api()` como porta única de escrita; selo de gravação que só fala quando falha
- [ ] `fd`, `fdDe`, `moeda`, `duracao` em `lib/formato.ts`

> **Armadilha herdada:** função com parâmetro opcional no fim não vai direto para `map/filter/forEach`. Tipar como obrigatório com overload.

## 08 — Fase 1 — Pacientes, busca e agenda (pedidos 1, 8, 9)

**Banco:** `pacientes`, `responsaveis`, `recorrencias`, `sessoes`; `pode_clinico`; extensões `unaccent` e `pg_trgm` com índice no nome do paciente e do responsável; constraint de exclusão de horário; pgTAP.

**Back**
- [ ] CRUD de paciente, campo a campo; arquivar em vez de apagar
- [ ] Menor de idade exige ao menos um responsável — regra no servidor
- [ ] `GET /pacientes?busca=` sem acento, tolerante a erro, buscando também pelo responsável; resposta sem queixa principal (a lista não é dado clínico)
- [ ] `AgendaService`: sessão avulsa; repetição semanal gerando as próximas ocorrências; editar "só esta" ou "esta e as próximas"
- [ ] Choque de horário recusado **no banco**, com mensagem pronta ("Já existe sessão das 14:00 às 14:50 neste dia")
- [ ] Transição de status validada no servidor

**Front**
- [ ] Lista de pacientes com situação e busca
- [ ] `<BuscaPaciente>` no topo, abre a ficha direto
- [ ] Formulário de paciente (um só para criar e editar) com responsáveis repetíveis e consentimento LGPD marcado
- [ ] Ficha do paciente com as abas da seção 05 — nesta fase **Resumo** e **Dados**; as outras com "em breve"
- [ ] Agenda: dia e semana no desktop, dia no celular — quem esconde é o CSS, não `window.innerWidth`
- [ ] Sessão nova a partir de um horário vazio da agenda
- [ ] Início: sessões de hoje e "pacientes ativos sem próxima sessão"

## 09 — Fase 2 — Registro dos atendimentos e histórico (pedidos 2, 5)

**Banco:** `observacoes`, `observacoes_versoes` (trigger grava a versão anterior a cada alteração); RPCs `historico_paciente` e `ficha_clinica`, com `registrar_leitura` dentro; pgTAP de que a versão é gravada e de que outra conta não lê.

**Back**
- [ ] `PATCH /sessoes/:id/status` — Realizada / Falta / Cancelada, com hora do registro
- [ ] `ObservacaoService`: grava no blur; a versão anterior vai para o histórico pelo trigger, nunca pelo Nest
- [ ] `HistoricoService`: linha do tempo do paciente (sessões, status, observações) — pagamento entra na Fase 3 pela mesma rota
- [ ] `PendenciaService`: sessão Realizada sem observação há mais de 2 dias
- [ ] Exportar a ficha completa do paciente (janela de impressão) — atende o pedido de acesso do paciente pela LGPD

**Front**
- [ ] `<SessaoCartao>`: na agenda, um toque marca presença ou falta; abrir mostra a observação
- [ ] `<ObservacaoEditor>` com "ver versões anteriores"
- [ ] Aba **Histórico** com `<LinhaDoTempo>`, da mais recente para a mais antiga, com filtro por período
- [ ] `<Pendencias>` no Início
- [ ] Em **Dados**, quem acessou a ficha e quando

> **Armadilha:** campo portado se confere contra o que está gravado, não contra o que parece certo. Toda coluna nova ganha prova que prende o nome, conferida quebrando de propósito.

## 10 — Fase 3 — Financeiro e pacotes (pedidos 3, 4, 5)

**Banco:** `pacotes`, view `pacote_saldo`, `cobrancas`; o saldo é contado **só** na view, a partir do status das sessões e de `configuracoes.falta_consome_pacote`; pgTAP de saldo com falta ligada e desligada.

**Back**
- [ ] `PacoteService`: criar pacote (quantidade, valor total, parcelas opcionais); sessão marcada como "do pacote" é recusada se o saldo for zero
- [ ] Cobrança nasce sozinha: sessão avulsa Realizada (e Falta, conforme a configuração) gera cobrança pendente com o valor do paciente ou o padrão; pacote gera a cobrança na criação — uma vez só, idempotente
- [ ] `POST /cobrancas/:id/pagar` com forma e data; desfazer pagamento com motivo
- [ ] `PendenciaService` ganha: cobrança vencida, pacote com 1 sessão restante
- [ ] `HistoricoService` ganha os pagamentos na linha do tempo

**Front**
- [ ] Financeiro → **Cobranças**: filtros pendente / paga / vencida, por mês e por paciente; total no topo
- [ ] `<MarcarPago>` com forma de pagamento em lista fechada
- [ ] Na sessão e na agenda: selo da cobrança e "sessão 3 de 10" quando é de pacote
- [ ] Aba **Pacotes** e **Financeiro** na ficha; `<SaldoPacote>` no Resumo

## 11 — Fase 4 — Recibos, notas e relatórios (pedidos 6, 7)

**Banco:** `documentos_fiscais`, `documento_cobrancas`, bucket privado `fiscais`; `pode_arquivo` conhecendo o bucket **no mesmo commit** (a lição do `producoes` no DIME).

**Back**
- [ ] `FiscalService`: registrar documento (tipo, número, data, valor, pagador) ligado a uma ou mais cobranças pagas
- [ ] Recibo interno em PDF a partir das cobranças, com numeração sequencial por conta e os dados do profissional (nome, CRP)
- [ ] Anexar o comprovante oficial (PDF do Receita Saúde ou da NFS-e): servidor decide o caminho e devolve URL assinada
- [ ] `PendenciaService` ganha: pagamento sem documento fiscal ao fim do mês
- [ ] `ReportBuilderService`: atendimentos realizados, faltas e taxa de falta, recebido, pendente, valor por mês (últimos 12) — um construtor, três saídas

**Front**
- [ ] Financeiro → **Recibos e notas**: lista com situação e filtro por mês; "Emitir recibo" a partir das cobranças pagas
- [ ] Aviso quando falta CPF do pagador para o tipo escolhido
- [ ] Aba **Recibos e notas** na ficha
- [ ] **Relatórios**: seletor de mês, quadros de resumo, gráfico mensal com legenda, exportar CSV e imprimir

## 12 — Fase 5 — Atendimento online (pedido 11)

Em dois passos, para o beta não esperar a decisão do provedor de vídeo.

**5a — Sala com link externo**
- [ ] Sessão com modalidade online ganha uma sala: o psicólogo cola o link que já usa (Meet, Zoom) ou o perfil guarda um link fixo
- [ ] `token_paciente` aleatório e longo; `/sala/:token` pública mostra só data, hora, nome do profissional e o botão de entrar, e só a partir de 15 minutos antes até o fim da sessão
- [ ] Botão "Copiar link do paciente" na sessão, para mandar pelo canal que o psicólogo já usa
- [ ] Início: "próxima sessão online" com "Entrar na sala"
- [ ] Aviso no perfil se o e-Psi estiver vazio
- [ ] Filtro de agenda por modalidade e quadro de online x presencial em Relatórios

**5b — Vídeo dentro da plataforma**
- [ ] Escolher o provedor (seção 15) e criar a sala pela API dele, com acesso por token que expira — sem sala pública reaproveitável
- [ ] `<SalaOnline>` embute o vídeo na página do psicólogo e na do paciente; sala de espera até o psicólogo entrar
- [ ] CSP: `frame-src` exato do provedor; câmera e microfone liberados só na rota da sala
- [ ] Nenhuma gravação, de propósito
- [ ] Registro de entrada e saída na sala vira sugestão de presença na sessão — quem confirma é o psicólogo

## 13 — Fase 6 — Beta com psicólogos

- [ ] Teste de invasão focado em RLS, IDOR e na rota pública da sala
- [ ] Política de privacidade, termos e DPA publicados
- [ ] Plano de resposta a incidente (quem avisa a ANPD e os psicólogos, em quanto tempo)
- [ ] Criar as contas dos 3 a 5 psicólogos do teste; uma sessão de uso guiada com cada um
- [ ] Canal de retorno dentro do app (botão "Relatar problema" no menu da conta, sem dado de paciente)
- [ ] Revisão em 2 e 6 semanas: o que usam, o que contornam, o que pedem

---

## 14 — Depois do beta

Na ordem provável, a conferir com o retorno do beta.

1. **Clínica com equipe**: convite, papéis de recepção e financeiro sem acesso clínico, várias agendas, salas físicas, repasse por profissional, compartilhamento de ficha para supervisão.
2. **Documentos psicológicos** (Resolução CFP 06/2019): declaração, atestado, relatório, laudo, parecer, com hash e imutáveis depois de emitidos.
3. **Anamnese estruturada e instrumentos de domínio público** (PHQ-9, GAD-7), com escore calculado no servidor.
4. **Integrações**: gateway de pagamento com Pix e baixa automática, lembrete por WhatsApp e e-mail (sem nada que revele que é atendimento psicológico), emissão de NFS-e e Receita Saúde.
5. **Portal do paciente**: confirmar, remarcar, pagar, aceitar contrato.
6. **Assinatura SaaS e painel de contas**, com o encerramento em quatro tempos: exportar → indicar responsável pela guarda → confirmar → apagar só depois do prazo.
7. **Pedidos do titular (LGPD)** como fluxo: acesso, portabilidade, exclusão bloqueada dentro do prazo de guarda.

## 15 — Em aberto

- **Nome do produto** e domínio.
- **Provedor de vídeo** (bloqueia a 5b). Candidatos: Daily (sala pronta para embutir, plano gratuito por minutos), JaaS da 8x8 (Jitsi gerenciado, gratuito até certo número de usuários) e Whereby Embedded. O `meet.jit.si` público não serve para embutir em produção. Conferir preços, limites e onde o dado trafega antes de decidir — os números mudam.
- **Criptografia de campo** para `observacoes.texto` e `pacientes.queixa_principal`, além da criptografia em repouso do Supabase. Protege contra vazamento de backup, mas impede busca no texto. Decidir antes da Fase 2, porque mudar depois exige migrar todo o histórico.
- **Gateway de pagamento** — recomendação: **Asaas** (Pix, boleto, cartão, NFS-e e split, foco no Brasil). Não bloqueia o beta.
- **App nativo** — começar como PWA instalável.

**Fora de escopo, de propósito:** prontuário de outras profissões (o nicho é a força do produto), gravação de sessão online e qualquer recurso de IA sobre conteúdo clínico — este último exige uma conversa de consentimento e ética própria antes de existir.
