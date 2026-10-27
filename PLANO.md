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
| A observação pode ser corrigida depois? Até quando? | Por um mês depois da sessão (confirmado) | Editável por 30 dias depois da sessão, toda versão guardada; depois disso trava e correção vira adendo |
| Cada paciente tem um valor de sessão próprio, ou é um valor único? | Próprio, e o paciente tem um plano: avulsa, pacote ou mensal | Plano na aba Dados da ficha (migration `20261015000004_plano_paciente.sql`): avulsa com valor da sessão (vazio usa o padrão da conta), pacote com nº de sessões e valor, mensal com valor do mês e nº de sessões opcional. O Financeiro (Fase 3) cobra a partir dele |

### Ainda abertas

Cada uma bloqueia só a fase indicada. Enquanto não houver resposta, vale o padrão da coluna da direita, configurável por conta.

| Pergunta | Bloqueia | Padrão até a resposta |
|---|---|---|
| Mensal vence em que dia, e é pago adiantado ou no fim do mês? | Fase 3 | Dia 10 de cada mês, configurável nas Configurações (1 a 28); a primeira mensalidade vence no dia 10 ou, se já passou, no dia em que nasce |
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
| **Super-admin** (você) | Sim, pelo backoffice (`senda-backoffice`): consultórios, logins e assinaturas | Nenhum dado clínico — nem por suporte, nem contagem |

### O que a regulamentação pede, e como o beta cumpre

Conferir com advogado antes da Fase 2 — as referências abaixo foram levantadas de memória e precisam de revisão nas fontes.

| Obrigação | Fonte | No beta |
|---|---|---|
| Registro documental de cada atendimento, guarda mínima de 5 anos | Resolução CFP 001/2009 | Observação por sessão, com versões; nenhuma rota apaga paciente com atendimento — o paciente é **arquivado** |
| Sigilo | Código de Ética | Conta isolada por RLS; auditoria de leitura; nada clínico em log, URL ou notificação |
| Cadastro no e-Psi para atendimento online | Exigido pela Resolução CFP 11/2018, que a Resolução CFP 09/2024 revogou | Deixou de ser exigido: o Senda não pede nem avisa mais (o número antigo continua guardado no perfil, sem uso) |
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
salas_pacientes     paciente_id, token                    -- um link por paciente, trocável
salas_sessoes       sessao_id, origem (colado|google_meet), link   -- sem ela, vale profissionais.sala_link
                    -- a janela (15 min antes até 15 depois) sai do horário da sessão, não é gravada
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
| `sala_publica(token)` | a única RPC aberta ao papel anon: devolve só data, hora e nome do profissional da próxima sessão online, e o link da chamada só dentro da janela |
| `eh_super()` | super-admin, sem acesso clínico nenhum |
| `exigir_super()` | porta de toda função `plataforma_*` do backoffice: levanta `so_super` ou `segundo_fator` em vez de devolver vazio |

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

**Resumo** (próxima sessão, saldo do pacote, a receber, queixa principal) · **Relatos** (o relato de cada sessão, o que falta escrever primeiro; só o psicólogo do paciente vê) · **Histórico** (linha do tempo: sessão + observação + pagamento — o pedido 5 inteiro numa tela) · **Pacotes** · **Financeiro** · **Recibos** · **Dados** (cadastro, responsáveis, consentimento, acessos à ficha).

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
- [x] Depois: backoffice em repositório próprio (`senda-backoffice`), com `plataforma_*` (migration `20261019000002_plataforma`) e a Edge Function `admin-contas` para criar e cuidar dos logins

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

**Código pronto em 14/10/2026.** Publicação automática: no merge, o workflow `publicar` aplica as migrations novas e sobe back e front.

**Banco**
- [x] `pacientes`, `responsaveis`, `recorrencias`, `sessoes`; RLS ligada sem política: toda leitura e escrita por RPC
- [x] `pode_clinico`: a queixa principal só chega ao psicólogo do paciente, e a leitura entra na auditoria
- [x] Busca sem acento e tolerante a erro de digitação (`unaccent` + `pg_trgm`), também pelo nome do responsável
- [x] Choque de horário barrado por constraint de exclusão (`EXCLUDE USING gist`); sessão desmarcada libera o horário
- [x] Repetição semanal: gera as próximas 8 semanas e se estende quando a agenda é aberta mais à frente
- [x] Desmarcar compara a hora do aviso com `aviso_minimo_horas` (6 h ou 24 h) e decide falta ou desmarcada; `simular` responde antes de gravar
- [x] Presença e falta só depois do horário da sessão; alta e arquivo encerram a repetição e tiram as sessões futuras
- [x] Excluir paciente só sem atendimento registrado (cadastro por engano); com sessão realizada ou falta, o prontuário tem guarda mínima de 5 anos e o caminho é arquivar (migration `20261015000002_excluir_paciente.sql`)
- [x] Alta e arquivo com repetição semanal que ainda não começou (migration `20261015000003_arquivar_repeticao_futura.sql`)
- [x] Plano do paciente na aba Dados: avulsa, pacote (sessões + valor, mostra o valor por sessão) ou mensal (valor do mês); o Resumo mostra o plano numa linha
- [x] Plano escolhido já no cadastro do paciente, gravado na mesma transação (migration `20261015000005_plano_no_cadastro.sql`)
- [x] 57 provas pgTAP

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

**Banco** (migration `20261015000006_observacoes.sql`): `observacoes`, `observacoes_versoes` (o trigger grava a versão anterior a cada mudança de texto) e `adendos`, sem permissão nenhuma para o cliente; RPCs `observacao_ler`, `observacao_gravar`, `adendo_criar`, `historico_paciente`, `pendencias_observacao`, `ficha_clinica` e `paciente_acessos`, com a leitura e a exportação registradas na auditoria de dentro da função.

- [x] Observação por sessão realizada ou com falta, só para o psicólogo do paciente; grava ao sair do campo
- [x] Corrigível por 30 dias depois da sessão (resposta dos psicólogos: "um mês"); cada correção guarda a versão anterior, com "ver versões anteriores"
- [x] Depois da trava, o que faltou entra como **adendo**, que não muda
- [x] Na janela da sessão, marcar presença ou falta não fecha a janela: a observação aparece logo abaixo
- [x] Aba **Histórico**: tudo o que já aconteceu, da mais recente para a mais antiga, filtro de 3 meses, 12 meses ou tudo, com a observação de cada sessão e aviso das realizadas sem observação
- [x] **Observações pendentes** no Início: sessões realizadas sem observação, com a data até quando ainda pode ser escrita
- [x] **Exportar ficha**: página para imprimir ou salvar em PDF (cadastro, queixa, plano, sessões, observações e adendos), registrada como exportação — atende o pedido de acesso do paciente pela LGPD
- [x] Em **Dados**, quem acessou a ficha e quando (psicólogo do paciente e titular da conta)
- [x] 26 provas pgTAP: versão gravada, mesmo texto não gera versão, trava, adendo só depois da trava, recepção da mesma conta não lê o texto, outra conta recusada, auditoria de leitura e exportação, tabela não se lê direto

> **Armadilha:** campo portado se confere contra o que está gravado, não contra o que parece certo. Toda coluna nova ganha prova que prende o nome, conferida quebrando de propósito.

## 10 — Fase 3 — Financeiro e pacotes (pedidos 3, 4, 5)

**Banco** (migration `20261015000007_financeiro.sql`): `pacotes`, `cobrancas` e `sessoes.pacote_id`; o saldo do pacote é contado **só** na view `privado.pacote_saldo` (gasta quem tem `pacote_id`). Quem cobra é um trigger da sessão, uma vez só, quando ela vira realizada ou falta:

1. Paciente com pacote com saldo → gasta uma sessão do pacote mais antigo, sem cobrança própria.
2. Senão, pelo plano: **avulsa** cobra a sessão (valor do paciente ou o padrão; falta também, salvo se a conta desligar); **pacote** esgotado cobra a sessão pelo valor por sessão do pacote; **mensal** não cobra por sessão.

Pacote nasce com a cobrança do valor inteiro (pago adiantado, sem validade). Mensalidade nasce no mês para cada paciente ativo no plano mensal, com vencimento no dia das Configurações (padrão 10; a primeira não nasce vencida). "Vencida" não se grava: é pendente com vencimento passado. Sessão realizada, com falta ou desmarcada não volta a ser agendada (o que ela consumiu já foi lançado); realizada ↔ falta continua se corrigindo.

- [x] Cobrança nasce sozinha, idempotente; pacote gasta saldo; mensalidade do mês
- [x] Desmarcar com aviso curto vira falta, cobra ou gasta pacote — a tela já avisava antes de confirmar (Fase 1)
- [x] Marcar paga com forma em lista fechada (Pix, dinheiro, cartão, transferência, boleto) e data; desfazer pagamento e cancelar cobrança com motivo, sem apagar; corrigir valor de cobrança pendente
- [x] **Financeiro**: a receber, vencido e recebido no mês; filtros a receber / vencidas / pagas / todas, por mês de vencimento e por paciente (o nome filtra na tela, não vai em URL); aviso de pacote acabando
- [x] Na janela da sessão: "Sessão 3 de 10 do pacote" ou a cobrança dela, com **Marcar paga**
- [x] Ficha: abas **Pacotes** (vender pacote a partir do plano, usadas e restantes) e **Financeiro**; saldo do pacote no Resumo
- [x] Início: a receber, vencidas, recebido no mês e pacote acabando
- [x] Configurações: dia de vencimento da mensalidade
- [x] Excluir paciente recusa quem já tem pacote ou cobrança (o registro financeiro fica)
- [x] 34 provas pgTAP
- [ ] Pagamentos na linha do tempo do Histórico

## 11 — Fase 4 — Recibos (Receita Saúde) e relatórios (pedidos 6, 7)

**Banco** (migration `20261015000008_recibos_relatorios.sql`): `recibos` e `recibo_cobrancas`. O recibo guarda uma cópia de quem pagou e de quem foi atendido (nome e CPF): mudar o cadastro depois não reescreve documento emitido. O pagador é o responsável marcado como "paga as sessões"; sem ele, o próprio paciente. O número do recibo não se repete na conta. Pagamento com recibo não se desfaz antes de cancelar o registro do recibo.

A Receita não oferece API de emissão do Receita Saúde: a emissão é no app ou no e-CAC. O PSI faz o resto — a fila do que falta emitir, os dados prontos para copiar e o registro do número depois.

- [x] Fila "A emitir no Receita Saúde": todo pagamento recebido sem recibo, agrupado por paciente, com CPF de quem pagou, CPF do beneficiário (quando é o responsável quem paga), valor, data e descrição do serviço, cada um com **Copiar**
- [x] Aviso quando falta CPF, com atalho para a ficha
- [x] Registrar o recibo (número e data) cobrindo um ou mais pagamentos do mesmo paciente; cancelar o registro com motivo (os pagamentos voltam para a fila, o registro fica)
- [x] Financeiro com abas Cobranças e **Recibos** (quantos a emitir); aba **Recibos** na ficha; aviso no Início
- [x] **Relatórios**: mês escolhido em números (realizadas e online, taxa de falta, pacientes atendidos e novos, recebido, a receber), gráficos dos 12 meses (recebido; realizadas e faltas), tabela mês a mês, **exportar planilha** (CSV que abre no Excel) e **imprimir**
- [x] 20 provas pgTAP
- [ ] Anexar o PDF do Receita Saúde ao recibo (precisa do Storage do Supabase; fica para um passo próprio)
- [ ] Recibo interno em PDF, para quem pedir comprovante antes do oficial

## 12 — Fase 5 — Atendimento online com Google Meet (pedido 11)

O Meet não pode ser embutido numa página de outro site — o Google bloqueia por segurança, e não há como contornar. O que dá para fazer, e é o mais próximo de "integrado": **a plataforma cria a sala do Meet sozinha** para cada sessão online e entrega o link ao psicólogo e ao paciente. Em dois passos, para o beta não depender da aprovação do Google.

**5a — Sala da sessão, com link colado** ✅
- [x] Sessão online tem sala: o link da chamada é o colado na sessão ou, sem ele, o **link fixo do perfil** (Configurações)
- [x] **Um link por paciente** (`/sala/<token>`), não um por sessão: quem atende toda semana manda o link uma vez só. Token aleatório de 64 caracteres; "Trocar link do paciente" invalida o anterior na hora
- [x] `/sala/:token` pública mostra só a próxima sessão online (data, hora, nome do profissional) e libera o botão da chamada de 15 minutos antes até 15 minutos depois do fim — o link do Meet não circula solto. A página se atualiza sozinha a cada 30 s; `no-referrer` impede o token de seguir para o Meet
- [x] Botão "Copiar link do paciente" na sessão, para mandar pelo canal que o psicólogo já usa
- [x] Início: "Próxima sessão online" com "Entrar no Meet"
- [x] ~~Aviso na sala se o e-Psi estiver vazio~~ — saiu em 27/10/2026: o cadastro no e-Psi deixou de ser exigido em 2024 (seção 12d)
- [x] Filtro de agenda por modalidade (Todas, Presencial, Online) e realizadas presenciais × online em Relatórios

**5b — Link do Meet gerado pela plataforma** — código pronto, desligado até o Google
- [x] Configurações → "Conectar Google": o psicólogo autoriza uma vez (conta pessoal ou Workspace). O back guarda o refresh token **cifrado** (AES-GCM, chave `GOOGLE_CHAVE` só no Worker) e nunca o devolve ao front
- [x] OAuth com retorno numa página do front (`/google/retorno`), que repassa código e `state` ao back com o login de quem pediu; `state` assinado e amarrado ao usuário e à conta (10 min), PKCE S256 sem estado guardado
- [x] **Uma sala do Meet por paciente** (`spaces.create`), criada na primeira sessão online e reaproveitada, como o link do paciente. Ordem do link: colado na sessão > Meet do paciente > fixo do perfil
- [x] Falhou o Google: a sessão é criada mesmo assim; a janela mostra "Não foi possível gerar o link do Meet. Cole um link ou tente de novo." e o botão "Gerar link do Meet" — nunca trava a agenda
- [x] Token recusado (revogado ou vencido): marca para reconectar e a tela pede "Conectar de novo"
- [x] "Desconectar" apaga a conexão e revoga o token no Google
- [x] Escopos: só `meetings.space.created`, `openid` e `email`. Nenhuma gravação nem transcrição
- [ ] **Ligar** (depende do domínio próprio — ver seção 15): projeto no Google Cloud com a Google Meet API, tela de consentimento, cliente OAuth "Aplicativo da Web" com o URI de redirecionamento `https://<front>/google/retorno`, e três segredos no Worker do back: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_CHAVE` (`openssl rand -base64 32`). Sem os três, o cartão do Google aparece, mas "Conectar Google" só avisa que ainda não está disponível

## 12b — Anamnese (pedido dos psicólogos, depois da Fase 5) ✅

- [x] Ficha de anamnese por paciente, parte do prontuário: **laudo ou diagnóstico** (sim / não / não sabe + qual, quem emitiu e quando) e **medicação** (sim / não / não sabe + lista com nome, dose, quando toma e quem receitou)
- [x] Temas em texto livre: acompanhamento com outros profissionais, saúde geral, psicoterapia e tratamentos anteriores, histórico familiar, substâncias, sono e alimentação, escola/trabalho/rotina, outras observações
- [x] No cadastro do paciente: laudo e medicação à vista e "Preencher a anamnese completa"; em branco, não grava nada
- [x] Aba **Anamnese** na ficha e cartão **Saúde** no Resumo (laudo e medicação de relance); entra na ficha exportada
- [x] Dado clínico: só o psicólogo do paciente lê e grava, toda leitura vai para a auditoria, cada gravação guarda a versão anterior (trigger). Não trava com o tempo, ao contrário da observação

## 12c — Excluir sessão marcada por engano ✅

- [x] "Excluir sessão" na janela da sessão: some da agenda e do histórico, sem contar como falta nem desmarcada
- [x] Em repetição semanal: só esta sessão ou a repetição inteira (passadas e futuras); a repetição para de gerar sessões
- [x] Não sai o que virou prontuário (observação, adendo) nem dinheiro (pagamento recebido, recibo); cobrança não paga sai junto e o pacote recupera a sessão
- [x] Fica na auditoria como exclusão

## 12d — Pedidos das psicólogas do beta (27/10/2026)

**Repetição quinzenal**
- [x] O horário de sempre pode ser **toda semana** ou **a cada 15 dias** (`recorrencias.intervalo_semanas`, migration `20261027000001_repeticao_quinzenal.sql`). A quinzenal conta a partir do primeiro dia: a semana do meio fica livre
- [x] Nova sessão: "Só esta", "Toda semana" ou "A cada 15 dias". Remarcar "esta e as próximas" também troca o intervalo
- [x] Agenda, ficha e janela da sessão dizem "toda semana" ou "a cada 15 dias" (`intervaloSemanas` em toda leitura de sessão)

**Relatos de sessão em destaque**
- [x] Aba **Relatos** logo depois do Resumo, só para o psicólogo do paciente: as sessões realizadas e com falta, da mais recente para a mais antiga, com o relato escrito ali mesmo. A que falta escrever vem aberta e marcada
- [x] Sessão cujo horário passou sem presença marcada aparece no topo com "Realizada" e "Falta": marcar abre o relato
- [x] Na tela, "observação" passou a se chamar **relato**. No banco continua `observacoes`, com as mesmas regras: um mês para corrigir, versões guardadas, adendo depois

**e-Psi**
- [x] O cadastro no e-Psi não é mais exigido (Resolução CFP 09/2024 revogou a 11/2018): saíram o aviso da sala online, a pendência do Início e o campo em Configurações

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
- **Lembrete: domínio próprio → aprovação do Google.** Quando o domínio do Senda estiver criado, começar a verificação do OAuth (a 5b já está pronta no código, só espera isto).
- **Aprovação do Google para o OAuth** (bloqueia a 5b em produção). Criar sala do Meet em nome do psicólogo usa escopo que o Google classifica como sensível: app com usuários externos precisa passar pela verificação (política de privacidade publicada, domínio próprio, vídeo de demonstração), que pode levar semanas. Antes dela, o app roda em modo de teste com até 100 usuários cadastrados à mão — o que serve ao beta, com um custo: nesse modo a autorização expira a cada 7 dias e o psicólogo reconecta. Começar a verificação junto com a Fase 5a, não depois. Conferir as regras na hora — mudam.
- **Vídeo embutido na plataforma** (Daily, JaaS, Whereby) — fora do beta; volta à mesa só se o Meet em outra aba incomodar no uso real.
- **Criptografia de campo** para `observacoes.texto` e `pacientes.queixa_principal`, além da criptografia em repouso do Supabase. Protege contra vazamento de backup, mas impede busca no texto. Decidir antes da Fase 2, porque mudar depois exige migrar todo o histórico.
- **Gateway de pagamento** — recomendação: **Asaas** (Pix, boleto, cartão, NFS-e e split, foco no Brasil). Não bloqueia o beta.
- **App nativo** — começar como PWA instalável.

**Fora de escopo, de propósito:** prontuário de outras profissões (o nicho é a força do produto), NFS-e no beta, gravação de sessão online e qualquer recurso de IA sobre conteúdo clínico — este último exige uma conversa de consentimento e ética própria antes de existir.
