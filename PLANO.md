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
| 4 | **Controle de sessões** — individual ou pacote, usadas e restantes | `pacotes` pagos adiantado + saldo calculado **num lugar só** (view no banco), nunca contado na tela. Falta sem aviso no prazo gasta sessão; desmarcação avisada no prazo não gasta | 3 |
| 5 | **Histórico do paciente** — atendimentos, observações e pagamentos anteriores | Aba **Histórico** na ficha: linha do tempo que junta sessão, observação e pagamento | 2 e 3 |
| 6 | **Recibos e notas fiscais** — controle da emissão e histórico | `documentos_fiscais` ligados às cobranças: número, data, situação, comprovante. O caminho oficial é o **Receita Saúde**: a plataforma separa o que falta emitir e entrega os dados prontos para copiar; a emissão é feita no app da Receita e **registrada** aqui | 4 |
| 7 | **Relatórios** — realizados, faltas, recebidos, pendentes, valores mensais | `ReportBuilderService`: um construtor, três saídas (tela, CSV, impressão) | 4 |
| 8 | **Agenda** — pacientes por dia e horário | Visão dia e semana; repetição semanal opcional | 1 |
| 9 | **Busca de pacientes** — por nome, rápido | Busca no topo, sem acento e com erro de digitação (`unaccent` + `pg_trgm`), também pelo nome do responsável | 1 |
| 10 | **Acesso privado** — login e senha | Supabase Auth via BFF; recuperação de senha; saída automática por inatividade; segundo fator (TOTP) opcional | 0 |
| 11 | **Atendimento online** — gerir consultas online, espaço para atender | Sessão online com **link do Google Meet gerado pela plataforma** (conta Google do psicólogo conectada uma vez). Sem conexão, o psicólogo cola o link. Página da sala para o paciente entrar sem login | 5 |

**Para quem é o beta:** psicólogos que atendem sozinhos, cada um na sua conta. O modelo de dados já nasce multiprofissional (o autônomo é "uma clínica de um"), mas a tela de equipe, a recepção e a gestão de clínica com vários profissionais ficam para depois do beta. Isso corta a Fase de equipe inteira sem criar dívida.

**O que o beta não tem, e é decisão:** documentos psicológicos (laudo, relatório etc.), anamnese estruturada, instrumentos (PHQ-9, GAD-7), portal do paciente, lembrete por WhatsApp, cobrança por gateway, emissão fiscal integrada, assinatura SaaS e painel de clínicas. Todos estão na seção 14.

### Duas coisas que o levantamento implica, e não foram ditas

- **CPF do pagador.** O pedido 6 depende dele: o recibo do Receita Saúde exige CPF de quem paga e de quem foi atendido. Por isso o cadastro ganha CPF no paciente e no responsável financeiro — **opcional para cadastrar, obrigatório para entrar na fila do recibo**, e a tela avisa quando falta.
- **Data de nascimento.** O pedido 1 cita pais e responsáveis, o que indica atendimento infantil. Com a data de nascimento o sistema sabe que o paciente é menor e exige ao menos um responsável — regra no servidor.

---

## 02 — Perguntas a fechar com os psicólogos

### Respondidas (14/10/2026)

| Pergunta | Resposta | O que muda no sistema |
|---|---|---|
| Falta **consome** uma sessão do pacote? | Gasta se não for avisada com antecedência | Desmarcar **dentro** do prazo de aviso vira Falta e gasta a sessão; desmarcar **fora** dele vira Cancelada e não gasta. Quem decide é o servidor, pela hora do aviso contra `aviso_minimo_horas` — a tela só mostra o resultado antes de confirmar |
| Pacote é pago adiantado, parcelado ou conforme usa? | Adiantado | Uma cobrança só, do valor inteiro, criada com o pacote. Sessão de pacote nunca gera cobrança própria. Sem parcelas no beta |
| Recibo pelo Receita Saúde ou NFS-e? | Receita Saúde | NFS-e sai do beta. O recibo do Receita Saúde é o caminho principal (Fase 4) |
| Atendimento online | Meet integrado à plataforma ou gerado por ela; se não der, o mais otimizado possível | O Meet **não pode ser embutido** numa página de outro site — o Google bloqueia. O que dá, e é o plano: a plataforma **gera o link do Meet sozinha** para cada sessão online, pela conta Google do psicólogo. Vídeo embutido sai do beta (Fase 5) |

### Respondidas (15/10/2026)

| Pergunta | Resposta | O que muda no sistema |
|---|---|---|
| Com quantas horas de antecedência o aviso de falta conta? | 24 h ou 6 h | Escolha do psicólogo nas Configurações (24 h ou 6 h, padrão 24 h); o servidor aplica a regra |
| Falta de sessão avulsa também é cobrada? | Sim | Falta avulsa gera cobrança, pela mesma regra do aviso |
| Pacote tem validade? | Não | Pacote sem validade |
| A observação pode ser corrigida depois? Até quando? | Por um mês (*interpretação: a resposta veio como "É pra ser um mês"; confirmar*) | Editável por 30 dias depois da sessão, toda versão guardada; depois disso trava e correção vira adendo |

### Ainda abertas

Cada uma bloqueia só a fase indicada. Enquanto não houver resposta, vale o padrão da coluna da direita, configurável por conta.

| Pergunta | Bloqueia | Padrão até a resposta |
|---|---|---|
| Cada paciente tem um valor de sessão próprio, ou é um valor único? | Fase 3 | Valor padrão da conta, sobrescrito por paciente |
| A maioria dos pacientes tem horário fixo semanal? | Fase 1 | Repetição semanal disponível |
| Alguém além do psicólogo (secretária) precisa entrar no beta? | Fase 0 | Não |
| O psicólogo usa conta Google pessoal (gmail.com) ou do Google Workspace? | Fase 5 | As duas funcionam; Workspace pode exigir liberação do administrador |

---

## 03 — Do DIME para o PSI

### Fica igual (já provado em produção no DIME)

| No DIME | No PSI | Por quê |
|---|---|---|
| Dois repos, `DIME-FRONT` (Next) e `DIME-BACK` (Nest) | Um repo, `psi-beta`, com `back/` e `front/` independentes (cada um com seu `package.json`, CI e Worker) | O contrato por OpenAPI continua sendo o único elo; no mesmo repo, o front gera os tipos do `back/openapi.json` versionado, sem depender do back no ar |
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
| Falta | vermelho | não veio, ou desmarcou **dentro** do prazo de aviso | sim | sim (padrão; pergunta aberta) |
| Cancelada | cinza tracejado | desmarcada **com** antecedência | não | não |

Status nunca violeta — violeta é escopo e ação, como no kit do DIME. Situação de cobrança tem mapa próprio: **Pendente** âmbar, **Paga** verde, **Vencida** vermelho.

---

## 05 — Arquitetura

```
Next.js (browser)  --REST + JWT-->  NestJS (BFF, DTO)  --supabase-js-->  Supabase
                                                                          ├── Postgres + RLS + RPCs security definer
                                                                          ├── Storage (bucket privado `fiscais`)
                                                                          └── Edge Function `admin-contas`
         \--- upload direto por URL assinada -----------------------------> Storage
Paciente (browser) --/sala/:token (público)--> NestJS --> link do Google Meet (Fase 5)
NestJS --OAuth do psicólogo--> Google Meet API (cria a sala da sessão)
```

- **Região**: projeto Supabase em São Paulo (`sa-east-1`).
- **Backup**: PITR ligado na produção desde o primeiro paciente real.
- **CSP**: `connect-src` = domínio do back + URL **exata** do projeto Supabase. O Meet abre na aba dele, então a CSP não ganha `frame-src` nem libera câmera.
- **`wrangler.toml`**: `SUPABASE_URL` e `SUPABASE_ANON_KEY` ficam no arquivo (são públicas por design e o deploy sobrescreve config do painel). Segredos de verdade: `SUPABASE_JWT_SECRET` e, na Fase 5, o client secret do OAuth do Google e a chave que cifra os tokens dos psicólogos.
- **As três armadilhas do Nest no Workers**, já pagas no DIME: flag `enable_nodejs_http_server_modules`, `alias` para `@nestjs/microservices`/`@nestjs/websockets`, e **nada de Swagger UI**.
- **`NEXT_PUBLIC_*` é variável de build**, e o `buildCommand` do `open-next.config.ts` não pode chamar `npm run build` (recursão).

### Modelo de dados do beta

```
-- Fase 0
contas              id, nome, criada_em                 -- "clínica de um"; vira clínica depois
membros             conta_id, user_id, papel             -- no beta só 'psicologo'
profissionais       membro_id, nome, crp, uf_crp, epsi_numero, valor_sessao_padrao
configuracoes       conta_id, falta_cobra_avulsa, aviso_minimo_horas,
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
                    tipo (avulsa|pacote), pacote_id?, valor?, desmarcada_em?
                    -- desmarcada_em contra aviso_minimo_horas decide Falta x Cancelada
                    -- EXCLUDE USING gist: duas sessões do mesmo profissional não se sobrepõem

-- Fase 2  (pedidos 2, 5)
observacoes         id, sessao_id, autor_id, texto, criada_em, alterada_em
observacoes_versoes observacao_id, texto, gravada_em, gravada_por   -- trigger, nunca a tela

-- Fase 3  (pedidos 3, 4)
pacotes             id, paciente_id, quantidade, valor_total, inicio, validade?, situacao
                    -- pago adiantado: nasce com uma cobrança do valor inteiro
pacote_saldo        VIEW: pacote_id, usadas, restantes        -- a única conta de saldo
cobrancas           id, conta_id, paciente_id, origem (sessao|pacote), sessao_id?, pacote_id?,
                    valor, vencimento, situacao (pendente|paga|cancelada),
                    forma (pix|dinheiro|cartao|transferencia|boleto)?, paga_em?

-- Fase 4  (pedidos 6, 7)
documentos_fiscais  id, conta_id, paciente_id, tipo (recibo_interno|receita_saude),   -- nfse depois do beta
                    numero?, emitido_em?, valor, situacao (pendente|emitido|cancelado),
                    arquivo_caminho?, pagador_nome, pagador_cpf?
documento_cobrancas documento_id, cobranca_id            -- um recibo pode cobrir várias

-- Fase 5  (pedido 11)
salas_online        sessao_id, origem (google_meet|colado), link, meet_espaco_id?,
                    token_paciente, abre_em, expira_em
integracoes_google  membro_id, email_google, refresh_token_cifrado, conectada_em, revogada_em?
                    -- token cifrado pelo back com chave em segredo do Worker; nunca volta ao front
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

`Início · Agenda · Pacientes · Financeiro · Relatórios`, com a busca e a conta na ponta direita. Financeiro tem duas abas: **Cobranças** e **Recibos**. Atendimento online não é item de menu — mora na sessão, que é onde ele acontece; o Início mostra "próxima sessão online" com o botão de entrar.

### Ficha do paciente (abas)

**Resumo** (próxima sessão, saldo do pacote, a receber, queixa principal) · **Histórico** (linha do tempo: sessão + observação + pagamento — o pedido 5 inteiro numa tela) · **Pacotes** · **Financeiro** · **Recibos** · **Dados** (cadastro, responsáveis, consentimento, acessos à ficha).

---

## 06 — Fase −1 — Antes do código

- [x] Levantar com psicólogos o que entra no beta (seção 01)
- [ ] Responder as perguntas da seção 02 — pode ser uma rodada curta por mensagem
- [ ] Escolher o nome e registrar o domínio
- [ ] Conversa com advogado de LGPD/saúde: termos de uso, política de privacidade, contrato de operador (DPA), revisão das referências da seção 04
- [ ] Recrutar de 3 a 5 psicólogos para testar o beta, de preferência os entrevistados

## 07 — Fase 0 — Fundações e acesso privado (pedido 10)

Nada de tela de negócio. Só o esqueleto que todo módulo vai importar, e o login. **Fechada em 14/10/2026: no ar em homologação**, com o primeiro login de ponta a ponta — front publicado, back na Cloudflare, Supabase com RLS, conta lida. Passo a passo da publicação no `README.md`.

**Infra**
- [x] Repositório `psi-beta` com `back/` e `front/` independentes, `.env.example` com placeholder e `.env` no `.gitignore`
- [x] `wrangler.toml` do back com as flags, os `alias` (incluindo `class-transformer/storage`, que o DIME não precisou) e as variáveis públicas; ambientes de homologação (padrão) e produção
- [x] CI do back: typecheck + testes + `openapi.json` conferido + bundle do Worker + `supabase start` + `db reset` + pgTAP
- [x] CI do front: typecheck (gera os tipos do `openapi.json`) + provas + `npm run build` (o mesmo da publicação)
- [x] CSP com `connect-src` exato
- [x] Selo do rodapé carimbado no build
- [x] Projeto Supabase `psi-homolog` (São Paulo), migration aplicada, cadastro aberto desligado, TOTP ligado, primeira conta criada
- [x] Workers Builds: `psi-back-homolog.balbuquerc.workers.dev` (pasta `back`) e `psi-front-homolog.balbuquerc.workers.dev` (pasta `front`), cada um com token de publicação próprio
- [x] Primeira execução da CI no GitHub verde, incluindo as 22 provas de RLS num Supabase local de verdade (14/10/2026)
- [ ] `main` protegida exigindo PR
- [ ] Projeto `psi-prod` com PITR — na véspera do beta

**Banco**
- [x] `contas`, `membros`, `profissionais`, `configuracoes`, `super_admins`, `auditoria`
- [x] `eh_membro`, `tem_papel`, `eh_super`, `aal_ok` (segundo fator exigido pelo banco), `privado.registrar`
- [x] pgTAP (22 provas): conta A não lê nem grava nada da conta B; escrita direta recusada; `aal1` com fator cadastrado não lê nada. Conferido quebrando a política de propósito
- [x] Conta nasce por `conta_criar`, só pelo editor SQL — sem Edge Function `admin-contas` no beta

**Back**
- [x] Guard global de JWT (HS256 com segredo ou JWKS), `@Publico()` explícito; prova que toda rota fora da lista pede sessão
- [x] Cliente Supabase com o JWT de quem chamou e a chave pública
- [x] `POST /sessao/entrar|segundo-fator|renovar|recuperar|senha|sair`, `GET|POST|DELETE /sessao/fatores`
- [x] Segundo fator TOTP disponível e opcional
- [x] Erro sem `code` → 503; serviço de login fora → 503 com frase própria; erro desconhecido do banco não vaza o texto do Postgres
- [x] `/saude` com origem da configuração, sem valores
- [x] Log só com método, padrão da rota e status — nunca corpo, query ou valor de parâmetro
- [x] `GET /contas`, `GET /contas/:conta`, `PATCH /contas/:conta/perfil`, `PATCH /contas/:conta/configuracoes`, gravando campo a campo; prova que prende os nomes de campo contra a migration
- [x] Testado rodando dentro do workerd (runtime da Cloudflare) contra Postgres + serviço de login do Supabase: login, segundo fator, renovação, isolamento entre contas, queda do banco

**Front**
- [x] Login com entrar / código do autenticador / esqueci / nova senha (repetir a senha nova) na mesma tela
- [x] Saída automática após N minutos sem uso (configurável por conta)
- [x] `lib/menu.ts` com os cinco itens; item sem tela com selo "em breve"; barra no topo no desktop, barra de baixo no celular; `prova:menu` na CI
- [x] Configurações: perfil profissional e regras do consultório gravando no blur, troca de senha, ativar e desativar o código do autenticador
- [x] Tabela de fichas (`lib/fichas.ts`) — módulo novo é uma linha, nunca if/else
- [x] `api()` tipada pelo OpenAPI como porta única; renova a sessão sozinha; selo de gravação que só fala quando falha
- [x] `fd`, `fdDe`, `fdh`, `moeda`, `duracao` em `lib/formato.ts`, com prova
- [x] Tema claro/escuro pré-paint
- [x] Testado no navegador com o build da Cloudflare: login, senha errada, gravação no blur, recarregar mantém o dado, celular, sair limpa a sessão
- [x] **Visual a partir das referências** (`docs/referencias/`): sidebar azul-marinho (só ícones no tablet, barra de baixo no celular), ação em violeta, fundo lavanda, cartões sem borda com sombra suave, selos em tom pastel, Poppins nos títulos e números e DM Sans no texto (empacotadas no build), padrão geométrico de quartos de círculo como marca, login em duas colunas, Início com saudação, métricas e mini calendário. Tokens em `front/styles/tokens.css`, componentes em `front/styles/components.css`; contraste de texto conferido nos dois temas

> **Armadilha herdada:** função com parâmetro opcional no fim não vai direto para `map/filter/forEach`. Tipar como obrigatório com overload.

### O que a Fase 0 aprendeu

**A publicação, como ela foi de verdade:**
- **Root directory errado não dá erro claro.** Com `/` no lugar de `back`, o build falha sem dizer que não achou o `package.json`. Em monorepo, é o primeiro campo a conferir.
- **O token de publicação vem pré-selecionado com o do último projeto.** O painel sugeriu o token do `dime-back`. Funciona, mas mistura os dois produtos; cada Worker ganhou o seu.
- **O branch de produção mora no topo de Settings → Builds**, acima de "Disable builds", e não numa seção "Branch control".
- **Projeto novo do Supabase não precisa de `SUPABASE_JWT_SECRET`.** O JWT vem assinado com chave assimétrica e o back valida pelo JWKS público. O `/saude` mostra `faltando` e está certo.
- **A secret key do Supabase não entra em lugar nenhum.** Ela passa por cima da RLS; o PSI só usa a publishable.


**O Next mais novo nem sempre roda na Cloudflare.** O Next 16.4.1 saiu no mesmo dia e o adaptador do OpenNext ainda não o conhecia: o build passava e toda página respondia 500. O front fica fixo na versão que o adaptador declara (`next` 16.3.8) e só sobe quando o adaptador acompanhar — conferindo com `npm run build` e uma página aberta, não só com o build verde.

**A chave nova do Supabase não é JWT.** A *publishable key* vai só no cabeçalho `apikey`; o `Authorization` leva apenas o token de quem chamou.

**Teste no navegador pega o que o typecheck não pega.** O Next tem um anunciador de rota com `role="alert"` em toda página — seletor de teste por `role=alert` pegava o elemento errado e lia vazio.

## 08 — Fase 1 — Pacientes, busca e agenda (pedidos 1, 8, 9)

**Código pronto em 14/10/2026.** Antes de publicar, a migration `20261015000001_pacientes_agenda.sql` roda no SQL Editor do Supabase.

**Banco**
- [x] `pacientes`, `responsaveis`, `recorrencias`, `sessoes`; RLS ligada sem política: toda leitura e escrita por RPC
- [x] `pode_clinico`: a queixa principal só chega ao psicólogo do paciente, e a leitura entra na auditoria
- [x] Busca sem acento e tolerante a erro de digitação (`unaccent` + `pg_trgm`), também pelo nome do responsável
- [x] Choque de horário barrado por constraint de exclusão (`EXCLUDE USING gist`); sessão desmarcada libera o horário
- [x] Repetição semanal: gera as próximas 8 semanas e se estende quando a agenda é aberta mais à frente
- [x] Desmarcar compara a hora do aviso com `aviso_minimo_horas` (6 h ou 24 h) e decide falta ou desmarcada; `simular` responde antes de gravar
- [x] Presença e falta só depois do horário da sessão; alta e arquivo encerram a repetição e tiram as sessões futuras
- [x] 31 provas pgTAP

**Back**
- [x] Pacientes: buscar (POST, para nome de paciente não ir em URL), criar com responsáveis e consentimento LGPD obrigatório, ler, gravar campo a campo, situação, responsáveis
- [x] Agenda: período até 62 dias, painel do Início, sessões do paciente, criar (avulsa ou semanal), remarcar ("só esta" ou "esta e as próximas"), status, desmarcar, encerrar repetição
- [x] Prova que prende os nomes de campo da API contra as funções da migration

**Front**
- [x] Agenda da semana como a referência: grade por hora, blocos coloridos pelo status, linha do "agora", clique num horário vazio abre a sessão nova; no celular, faixa de dias e lista do dia
- [x] Janela de sessão: agendar, confirmar, presença ou falta, remarcar, desmarcar com o aviso de falta antes de confirmar, encerrar repetição
- [x] Pacientes: lista com busca e filtro de situação; cadastro com responsáveis, CPF, valor próprio e queixa principal; ficha com Resumo, Sessões e Dados (Histórico, Pacotes, Financeiro e Recibos aparecem como "em breve")
- [x] Busca de paciente no topo, de qualquer tela (atalho `/`)
- [x] Início com sessões de hoje, contagens da semana e pacientes sem próxima sessão
- [x] Configurações: antecedência do aviso de falta em 6 h ou 24 h
- [ ] `.ics` da sessão — fica para quando houver sessão online (Fase 5), onde ele é útil de verdade

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

**Banco:** `pacotes`, view `pacote_saldo`, `cobrancas`; o saldo é contado **só** na view: Realizada e Falta gastam, Cancelada não; pgTAP de saldo com sessão desmarcada dentro e fora do prazo.

**Back**
- [ ] `PacoteService`: criar pacote (quantidade, valor total) já com a cobrança do valor inteiro; sessão marcada como "do pacote" é recusada se o saldo for zero
- [ ] Cobrança nasce sozinha: sessão avulsa Realizada ou Falta gera cobrança pendente com o valor do paciente ou o padrão; sessão de pacote nunca gera — uma vez só, idempotente
- [ ] Desmarcar sessão: o servidor compara a hora do aviso com o prazo e devolve Falta ou Cancelada; a tela mostra qual vai ser **antes** de confirmar ("O aviso veio com 6 h. Vai contar como falta e gastar 1 sessão do pacote.")
- [ ] `POST /cobrancas/:id/pagar` com forma e data; desfazer pagamento com motivo
- [ ] `PendenciaService` ganha: cobrança vencida, pacote com 1 sessão restante
- [ ] `HistoricoService` ganha os pagamentos na linha do tempo

**Front**
- [ ] Financeiro → **Cobranças**: filtros pendente / paga / vencida, por mês e por paciente; total no topo
- [ ] `<MarcarPago>` com forma de pagamento em lista fechada
- [ ] Na sessão e na agenda: selo da cobrança e "sessão 3 de 10" quando é de pacote
- [ ] Aba **Pacotes** e **Financeiro** na ficha; `<SaldoPacote>` no Resumo

## 11 — Fase 4 — Recibos (Receita Saúde) e relatórios (pedidos 6, 7)

**Banco:** `documentos_fiscais`, `documento_cobrancas`, bucket privado `fiscais`; `pode_arquivo` conhecendo o bucket **no mesmo commit** (a lição do `producoes` no DIME).

**Back**
- [ ] Fila "a emitir no Receita Saúde": toda cobrança paga sem recibo, com os dados do recibo já montados — CPF do paciente, CPF do pagador (o responsável, quando é menor), valor, data do pagamento, forma e descrição do serviço
- [ ] `FiscalService`: registrar a emissão (número, data) ligada a uma ou mais cobranças pagas, e anexar o PDF que o Receita Saúde gera — servidor decide o caminho e devolve URL assinada
- [ ] Recibo interno em PDF, para quem pedir um comprovante antes do oficial
- [ ] Conferir se a Receita oferece integração (API) para emissão; até onde se sabe hoje não oferece, e a emissão é pelo app ou pelo e-CAC — se surgir, a fila vira emissão automática sem mudar o resto
- [ ] `PendenciaService` ganha: pagamento sem documento fiscal ao fim do mês
- [ ] `ReportBuilderService`: atendimentos realizados, faltas e taxa de falta, recebido, pendente, valor por mês (últimos 12) — um construtor, três saídas

**Front**
- [ ] Financeiro → **Recibos**: a fila do que falta emitir (com botão de copiar cada dado, na ordem dos campos do Receita Saúde) e o histórico do que já foi emitido, com filtro por mês
- [ ] Aviso quando falta CPF do paciente ou do pagador, com atalho para o cadastro
- [ ] Aba **Recibos** na ficha
- [ ] **Relatórios**: seletor de mês, quadros de resumo, gráfico mensal com legenda, exportar CSV e imprimir

## 12 — Fase 5 — Atendimento online com Google Meet (pedido 11)

O Meet não pode ser embutido numa página de outro site — o Google bloqueia por segurança, e não há como contornar. O que dá para fazer, e é o mais próximo de "integrado": **a plataforma cria a sala do Meet sozinha** para cada sessão online e entrega o link ao psicólogo e ao paciente. Em dois passos, para o beta não depender da aprovação do Google.

**5a — Sala da sessão, com link colado**
- [ ] Sessão com modalidade online ganha uma sala; sem Google conectado, o psicólogo cola o link do Meet (ou guarda um link fixo no perfil)
- [ ] `token_paciente` aleatório e longo; `/sala/:token` pública mostra só data, hora, nome do profissional e o botão "Entrar no Meet", e só a partir de 15 minutos antes até o fim da sessão — o link do Meet não circula solto
- [ ] Botão "Copiar link do paciente" na sessão, para mandar pelo canal que o psicólogo já usa
- [ ] Início: "próxima sessão online" com "Entrar no Meet"
- [ ] Aviso no perfil se o e-Psi estiver vazio
- [ ] Filtro de agenda por modalidade e quadro de online x presencial em Relatórios

**5b — Link do Meet gerado pela plataforma**
- [ ] Projeto no Google Cloud com a Google Meet API e tela de consentimento OAuth (ver seção 15: aprovação do Google)
- [ ] Configurações → "Conectar Google": o psicólogo autoriza uma vez; o back guarda o token **cifrado** e nunca o devolve ao front
- [ ] Ao marcar sessão online, o back cria o espaço do Meet (`spaces.create`) com acesso restrito a quem tem o link, e grava na sala; remarcar mantém o espaço, cancelar o encerra
- [ ] Falhou o Google (token revogado, fora do ar): a sessão é criada mesmo assim, com aviso "Não foi possível gerar o link do Meet. Cole um link ou tente de novo." — nunca trava a agenda
- [ ] "Desconectar Google" revoga o token no Google e apaga do banco
- [ ] Nenhuma gravação, de propósito; o PSI não pede escopo de gravação nem de transcrição

## 13 — Fase 6 — Beta com psicólogos

- [ ] Teste de invasão focado em RLS, IDOR, na rota pública da sala e no armazenamento dos tokens do Google
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
- **Aprovação do Google para o OAuth** (bloqueia a 5b em produção). Criar sala do Meet em nome do psicólogo usa escopo que o Google classifica como sensível: app com usuários externos precisa passar pela verificação (política de privacidade publicada, domínio próprio, vídeo de demonstração), que pode levar semanas. Antes dela, o app roda em modo de teste com até 100 usuários cadastrados à mão — o que serve ao beta, com um custo: nesse modo a autorização expira a cada 7 dias e o psicólogo reconecta. Começar a verificação junto com a Fase 5a, não depois. Conferir as regras na hora — mudam.
- **Vídeo embutido na plataforma** (Daily, JaaS, Whereby) — fora do beta; volta à mesa só se o Meet em outra aba incomodar no uso real.
- **Criptografia de campo** para `observacoes.texto` e `pacientes.queixa_principal`, além da criptografia em repouso do Supabase. Protege contra vazamento de backup, mas impede busca no texto. Decidir antes da Fase 2, porque mudar depois exige migrar todo o histórico.
- **Gateway de pagamento** — recomendação: **Asaas** (Pix, boleto, cartão, NFS-e e split, foco no Brasil). Não bloqueia o beta.
- **App nativo** — começar como PWA instalável.

**Fora de escopo, de propósito:** prontuário de outras profissões (o nicho é a força do produto), NFS-e no beta, gravação de sessão online e qualquer recurso de IA sobre conteúdo clínico — este último exige uma conversa de consentimento e ética própria antes de existir.
