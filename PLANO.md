# PSI — plataforma de gestão para clínicas e psicólogos

> Plano vivo. Nasce do que a migração do DIME ensinou (`MIGRACAO.md` do DIME) e aplica a um domínio novo: consultório e clínica de psicologia.

O DIME levou seis fases para sair de um `index.html` de 3000 linhas e chegar a Front/Back/Infra. O PSI não tem app antigo para migrar — ele **começa** onde o DIME terminou. Isso permite pular o caminho de convivência (strangler, `CompatController`, importação repetível) e trazer só o que deu certo, mais o que a área da saúde exige e a área musical não exigia: sigilo, prontuário, retenção e auditoria.

---

## 00 — Como ler este documento

- **Seção 01** traduz o DIME para o PSI: o que fica igual, o que muda e por quê.
- **Seção 02** é o domínio: quem usa, o que guarda, o que a regulamentação obriga.
- **Seção 03** é a arquitetura e o modelo de dados.
- **Seções 04 a 11** são as fases, em microatividades com caixa de marcar.
- **Seção 12** é o que está em aberto.

A regra de escrita é a mesma do DIME: sem emoji, sem exclamação, nenhum botão genérico ("OK", "Enviar") — o botão diz o que faz ("Registrar evolução", "Emitir recibo").

---

## 01 — Do DIME para o PSI

### Fica igual (já provado em produção no DIME)

| No DIME | No PSI | Por quê |
|---|---|---|
| Dois repos, `DIME-FRONT` (Next) e `DIME-BACK` (Nest) | `PSI-FRONT` e `PSI-BACK` | Contrato por OpenAPI resolveu o alinhamento sem monorepo nem pacote publicado |
| NestJS como **BFF**, regra de acesso no Postgres (RLS + `security definer`) | Idem | Regra de acesso escrita em dois lados se desencontra calada |
| Front nunca fala com o Supabase, só com o back | Idem, com a mesma exceção: upload vai direto ao Storage por URL assinada | Nenhuma credencial no bundle; o Worker não carrega bytes |
| `@nestjs/swagger` → `/openapi.json` público → `openapi-typescript` no build do front | Idem | DTO muda, tipo desatualizado vira erro de build |
| Cloudflare Workers nos dois (`@opennextjs/cloudflare` no front, `httpServerHandler` no back) | Idem | Grátis, não dorme, já validado |
| Guard global de JWT, rota nasce fechada, `@Publico()` para abrir | Idem | |
| `/saude` diz se a config existe e **de onde veio**, nunca o valor | Idem, e nunca dado de paciente | Foi o que encerrou três rodadas de adivinhação no DIME |
| CI roda **o mesmo comando** que a publicação (`npm run build`) e gera o bundle a cada push | Idem | CI verde com deploy quebrado já aconteceu |
| Erro sem `code` do PostgREST = transporte = 503 | Idem | Senão a API mente ("você não é administrador") para um DNS errado |
| Cache de link assinado inclui **quem pediu** | Idem, e com TTL curto | Cache só por caminho entrega o link de uma pessoa para outra |
| `FichaRouter` por tabela, nunca if/else | Idem (paciente, sessão, documento) | Módulo novo caía no lugar errado sem erro |
| Menu como dado (`lib/menu.ts`), três telas saindo dele, prova na CI | Idem | Item que some no celular e ninguém reproduz |
| Item sem tela aparece apagado com selo "em breve" | Idem | 404 parece deploy quebrado |
| Campo grava no blur, campo a campo | Idem | Gravar o objeto inteiro apaga o que a tela não conhece |
| Regra de negócio que decide "pronto" mora no servidor (`credPend` → `pendencias`) | Idem (pendências de prontuário, de cobrança) | O front desenha, não decide |
| `fd(iso)` / `fdDe(Date)` como único formatador de data | Idem, mais `moeda()` e `duracao()` | Data escrita à mão é onde a segunda grafia começa |
| Grade em componente é `data-n`, nunca `style` | Idem | O React re-serializa `repeat(4, 1fr)` com espaço |
| Selo do rodapé carimbado no build | Idem | |
| Rota velha sai um passo **depois** da nova, nunca no mesmo | Idem | Aba aberta segue com o JS antigo |
| Mock no formato do dado real; prova que prende nome de campo, conferida quebrando de propósito | Idem | `ok` vs `done`, `funcao` vs `papel` |

### Muda (e o próprio DIME apontou para isso)

1. **Tabelas relacionais desde o dia 1, não um documento `jsonb` por espaço.** O DIME nasceu com `dados_espaco` porque era um arquivo só, e já começou a sair dele (as tarefas foram para a tabela `tarefas`). No PSI cada evolução de prontuário precisa de dono, data, trava, auditoria e uma política de acesso **por linha** — o psicólogo A não pode ler o paciente do psicólogo B na mesma clínica. Isso é RLS por linha, que um documento único não dá.
2. **Migrations versionadas, não "passo 30 do README".** `supabase/migrations/` no `PSI-BACK`, aplicadas pela Supabase CLI. Toda função `security definer` e toda política nascem num arquivo com número e entram por PR.
3. **Prova de RLS na CI.** O DIME provava contrato com mock — e aprendeu que "o mock responde o que eu mandei ele responder". No PSI a CI sobe um Postgres local (`supabase start`) e roda testes pgTAP que logam como cada papel e conferem o que cada um enxerga. É a única prova que pega política vazando.
4. **Auditoria de leitura, não só histórico de escrita.** Quem abriu o prontuário de quem, e quando. Exigência de sigilo, não enfeite.
5. **Staging separado é obrigatório**, não "fora de escopo por ora". Dois projetos Supabase: produção e homologação, a segunda só com dado sintético. Preview de PR **nunca** aponta para a base de produção.
6. **IDs são UUID em tudo.** O DIME herdou `Date.now().toString(36)` e precisou do `IdDeItemPipe`. Aqui não há legado: `ParseUUIDPipe` em toda rota.
7. **Sem convivência com app antigo.** Não existe strangler, nem `CompatController`, nem importação repetível. A regra de rota velha continua valendo entre deploys do próprio PSI.
8. **Nada sensível em log, URL ou notificação.** Nome de paciente nunca vai em query string, em log do Worker, em título de evento de calendário externo ou em mensagem de WhatsApp.

---

## 02 — O domínio

### Quem usa

| Papel | O que faz | O que **não** vê |
|---|---|---|
| **Titular** (dono da clínica) | Configura clínica, salas, equipe, planos, financeiro geral | Prontuário de paciente que não é dele |
| **Psicólogo** | Agenda própria, pacientes próprios, prontuário, documentos, recibos | Prontuário de colega (salvo compartilhamento explícito) |
| **Recepção / secretaria** | Agenda de todos, cadastro básico do paciente, confirmação, cobrança | **Nada clínico**: evolução, anamnese, documento, anexo de prontuário |
| **Financeiro** | Cobranças, pagamentos, repasses, relatórios financeiros | Nada clínico |
| **Paciente** (portal, Fase 7) | Próprias sessões, confirmar/remarcar, pagar, preencher anamnese, assinar contrato | Qualquer anotação clínica |
| **Super-admin** (você) | Painel de clínicas, plano/assinatura SaaS, contas | Nenhum dado clínico — nem por suporte |

**Psicólogo autônomo é uma clínica de um.** O modelo é multiprofissional desde o começo; o autônomo só tem um membro com papel `titular` + `psicologo`. Isso evita a reescrita que viria no dia em que ele contratar uma secretária.

### O que a regulamentação pede (conferir com advogado antes da Fase 2)

- **Registro documental obrigatório** (Resolução CFP 001/2009 e atualizações): identificação, avaliação de demanda, objetivos, registro da evolução, encaminhamentos e documentos produzidos. Guarda mínima de **5 anos**.
- **Documentos psicológicos** (Resolução CFP 06/2019): declaração, atestado, relatório, laudo e parecer, cada um com estrutura definida.
- **Atendimento online** (Resolução CFP 11/2018): o psicólogo precisa de cadastro no e-Psi; a plataforma guarda o número e lembra o vencimento, não substitui o cadastro.
- **Sigilo** (Código de Ética): em serviço multiprofissional, só se compartilha o necessário. Daí o papel de recepção sem acesso clínico, e o compartilhamento de prontuário ser explícito e auditado.
- **LGPD**: dado de saúde é dado pessoal sensível (art. 11). Base legal, consentimento registrado, direito de acesso/portabilidade do titular, registro de operações, encarregado (DPO) nomeado.
- **Conflito retenção x exclusão**: paciente pode pedir exclusão, mas o prontuário tem guarda mínima. A plataforma **bloqueia** o apagar dentro do prazo e registra o pedido.
- **Encerramento de clínica**: o DIME fazia backup → confirmar → apagar. Aqui o prontuário não pode simplesmente sumir — o fluxo vira **exportar → transferir/entregar a responsável → confirmar → apagar após prazo**.
- **Recibo**: pessoa física emite pelo Receita Saúde (Receita Federal); pessoa jurídica emite NFS-e. A plataforma gera os dados e o comprovante interno; a emissão fiscal é integração de fase posterior.
- **Testes psicológicos (SATEPSI)**: teste restrito não se digitaliza nem se hospeda. Só instrumentos de domínio público (PHQ-9, GAD-7 e similares).

### Status de sessão (o mapa de cor vem antes do código)

O DIME aprendeu que dois estados com o mesmo selo confundem (Confirmado e Realizado verdes). Definir de saída:

| Status | Cor | Significado |
|---|---|---|
| Agendada | cinza | marcada, sem confirmação |
| Confirmada | âmbar | fechada, **parada esperando a data** |
| Realizada | verde | aconteceu |
| Falta | vermelho | paciente não veio, sem aviso no prazo |
| Cancelada | cinza tracejado | desmarcada no prazo |
| Remarcada | ciano | gerou outra sessão |

Status nunca violeta — violeta é escopo e ação, como no kit do DIME.

---

## 03 — Arquitetura

```
Next.js (browser)  --REST + JWT-->  NestJS (BFF, DTO, auditoria de leitura)  --supabase-js-->  Supabase
                                                                                               ├── Postgres + RLS + RPCs security definer
                                                                                               ├── Storage (bucket privado `prontuarios`, `documentos`)
                                                                                               └── Edge Function `admin-contas`
         \--- upload direto por URL assinada ------------------------------------------------> Storage
```

- **Região**: projeto Supabase em São Paulo (`sa-east-1`). Simplifica a conversa de LGPD.
- **Backup**: PITR ligado na produção desde o primeiro paciente real.
- **CSP**: `connect-src` = domínio do back + URL **exata** do projeto Supabase. Nada de `https://*.supabase.co`.
- **`wrangler.toml`**: `SUPABASE_URL` e `SUPABASE_ANON_KEY` ficam no arquivo (são públicas por design e o deploy sobrescreve config do painel). Segredo de verdade só `SUPABASE_JWT_SECRET`.
- **As três armadilhas do Nest no Workers**, já pagas no DIME: flag `enable_nodejs_http_server_modules`, `alias` para `@nestjs/microservices`/`@nestjs/websockets` no `wrangler.toml`, e **nada de Swagger UI**.
- **`NEXT_PUBLIC_*` é variável de build**, e o `buildCommand` do `open-next.config.ts` não pode chamar `npm run build` (recursão).

### Modelo de dados (primeiro esboço)

```
clinicas            id, nome, cnpj?, plano, situacao
membros             clinica_id, user_id, papeis[] (titular|psicologo|recepcao|financeiro)
profissionais       membro_id, crp, uf_crp, epsi_numero, epsi_validade, especialidades[]
salas               clinica_id, nome, ativa

pacientes           id, clinica_id, nome, nascimento, cpf?, contato, responsavel_legal?
                    profissional_responsavel_id, situacao (ativo|alta|encaminhado|inativo)
vinculos_paciente   paciente_id, membro_id, motivo (supervisao|coterapia), inicio, fim
                    -- compartilhamento explícito, auditado, com prazo

recorrencias        id, paciente_id, profissional_id, regra (semanal|quinzenal), dia, hora
agendamentos        id, clinica_id, paciente_id, profissional_id, sala_id?, recorrencia_id?
                    inicio, fim, modalidade (presencial|online), link_online?, status
                    valor_previsto

anamneses           paciente_id, modelo_id, respostas jsonb, preenchida_por, preenchida_em
modelos_anamnese    clinica_id?, secoes jsonb      -- como EV_SECOES: seção nova é dado
evolucoes           id, paciente_id, agendamento_id?, autor_id, texto,
                    criada_em, assinada_em?, retifica_id?
                    -- assinada = imutável; correção é nova linha apontando para a antiga
notas_pessoais      id, autor_id, paciente_id, texto   -- só o autor; fora do prontuário
documentos          id, paciente_id, tipo (declaracao|atestado|relatorio|laudo|parecer),
                    conteudo, emitido_em, emitido_por, hash_sha256
anexos              id, paciente_id, dono (evolucao|documento|anamnese), caminho, hash
aplicacoes          id, paciente_id, instrumento (phq9|gad7|...), respostas, escore, aplicado_em

cobrancas           id, clinica_id, paciente_id, origem (sessao|pacote|mensal), valor,
                    vencimento, situacao, gateway_id?
pagamentos          cobranca_id, valor, meio (pix|cartao|dinheiro|boleto), pago_em
recibos             pagamento_id, numero, emitido_em, receita_saude_id?
repasses            membro_id, periodo, regra (percentual|fixo), valor, pago_em

consentimentos      paciente_id, tipo (contrato|lgpd|online), versao, aceito_em, origem
auditoria           id, quem, papel, acao (ler|criar|editar|assinar|exportar|compartilhar),
                    tabela, registro_id, paciente_id?, em, ip_hash
pedidos_titular     paciente_id, tipo (acesso|portabilidade|exclusao), situacao, prazo
```

### Funções de acesso (o equivalente a `eh_pleno` / `dados_ler` / `fatia_artista`)

| Função | Responde |
|---|---|
| `eh_membro(clinica)` | está na clínica |
| `tem_papel(clinica, papel)` | tem aquele papel |
| `pode_clinico(paciente)` | é o responsável ou tem `vinculos_paciente` vigente — **titular não ganha por ser titular** |
| `pode_agenda(clinica)` | qualquer membro, incluindo recepção |
| `pode_financeiro(clinica)` | titular, financeiro, recepção (só cobranças), psicólogo (só os próprios) |
| `pode_arquivo(balde, caminho)` | confere o caminho contra `pacientes`/`documentos` e chama `pode_clinico` |
| `registrar_leitura(paciente, tabela, id)` | grava em `auditoria`; chamada **dentro** das RPCs de leitura clínica, não pelo Nest |
| `eh_super()` | super-admin, sem acesso clínico nenhum |

A leitura clínica passa **sempre** por RPC (`prontuario_ler(paciente)`), nunca por `select` direto na tabela — é o que garante que a auditoria não dependa de alguém lembrar de chamá-la. Mesmo princípio do DIME: quem protege é a RPC.

### Peças nomeadas (o equivalente ao quadro de reaproveitamento)

| Peça no front | Serviço no back | Usada em |
|---|---|---|
| `<FichaRouter>` + `useFicha()` | — | paciente, sessão, documento |
| `<AgendaGrade>` (mês/semana, só desktop) + `<AgendaLinha>` (com `acoes` separado de `extra`) | `AgendaService` | Agenda, Dashboard, ficha do paciente |
| `<SeletorClinica>` (clínica + profissional) | — | barra do topo |
| `<EvolucaoEditor>` (rascunho → assinar) | `ProntuarioService` | ficha do paciente, sessão |
| `<FormularioPorSecoes>` | `ModeloService` | anamnese, instrumentos |
| `<AttachmentUploader>` | `StorageProxyService` | prontuário, documentos |
| `<DocumentoEditor>` (por tipo da Res. 06/2019) | `DocumentoService` | documentos |
| `<Pendencias>` | `PendenciaService` | Dashboard, ficha |
| registro de `<ReportSection>` | `ReportBuilderService` (`{quadros, colunas, linhas}`) | Relatórios, Exportar |
| `<SeloStatus>` sobre um mapa único | — | agenda, financeiro |

---

## 04 — Antes do código (Fase −1)

O DIME foi escrito por quem vive o domínio. Aqui é preciso ouvir quem vive.

- [ ] Entrevistar 5 a 8 psicólogos (autônomos e de clínica): como agendam, onde registram evolução, como cobram, o que odeiam no sistema atual
- [ ] Listar 3 concorrentes que eles citarem e anotar o que falta neles (não o que sobra)
- [ ] Escolher o nome e registrar o domínio
- [ ] Conversa com advogado de LGPD/saúde: termos de uso, política de privacidade, contrato de operador (DPA) com a clínica, quem é controlador e quem é operador
- [ ] Ler as resoluções CFP 001/2009, 06/2019 e 11/2018 e o Código de Ética, anotando cada obrigação como requisito numerado
- [ ] Definir o MVP vendável: **Fases 0 a 4** (agenda, paciente, prontuário, financeiro básico)

## 05 — Fase 0 — Fundações

Nada de tela de negócio. Só o esqueleto que todo módulo vai importar.

**Infra**
- [ ] Criar `PSI-FRONT` e `PSI-BACK`, privados, `main` protegida, `.env.example` com placeholder e `.env` no `.gitignore`
- [ ] Dois projetos Supabase: `psi-prod` e `psi-homolog` (região São Paulo); PITR na produção
- [ ] `wrangler.toml` do back com as flags, os `alias` e as variáveis públicas; Workers Builds conectado nos dois repos
- [ ] Preview de PR do front aponta para o back de homologação, nunca para produção
- [ ] CI do back: typecheck + testes + gerar `openapi.json` + gerar bundle do Worker + `supabase start` + `supabase db reset` + pgTAP
- [ ] CI do front: typecheck + `npm run build` (o mesmo da publicação) + codegen contra o back de homologação + `prova:menu`
- [ ] CSP com `connect-src` exato
- [ ] Selo do rodapé carimbado no build

**Back**
- [ ] `AuthModule` com guard global, `@Publico()` explícito
- [ ] `SupabaseService` por request com o JWT de quem chamou
- [ ] `POST /sessao/entrar|renovar|recuperar|senha` (o login não nasce morto)
- [ ] Filtro de erro: sem `code` do PostgREST → 503 com frase pronta
- [ ] `/saude` com origem da configuração, sem valores
- [ ] Interceptor de log que **remove** corpo de requisição e qualquer campo de paciente
- [ ] `GET /clinicas`, `GET /clinicas/:id/membros`

**Banco (migrations 0001–0010)**
- [ ] `clinicas`, `membros`, `profissionais`, `auditoria`
- [ ] `eh_membro`, `tem_papel`, `eh_super`, `registrar_leitura`
- [ ] Testes pgTAP: membro de outra clínica não vê nada; recepção não vê nada clínico

**Front**
- [ ] Portar `tokens.css` + `components.css` do DIME e trocar só a paleta (o PSI pede tons mais calmos; o mapa de status da seção 02 entra aqui)
- [ ] Tema pré-paint (`data-theme`) via `next/script beforeInteractive`
- [ ] Login com entrar / esqueci / nova senha (repetir a senha nova) na mesma tela
- [ ] `lib/menu.ts` com os grupos `Início · Agenda · Pacientes · Financeiro · Relatórios · Administração`; item sem tela com selo "em breve"; barra no topo no desktop, rodapé com alvos de 56px no celular
- [ ] `useFicha()` sobre a tabela de fichas
- [ ] `api()` como porta única de escrita; selo de gravação que só fala quando falha
- [ ] `fd`, `fdDe`, `moeda`, `duracao` em `lib/formato.ts`

> **Armadilha herdada:** função com parâmetro opcional no fim não vai direto para `map/filter/forEach`. Tipar como obrigatório com overload.

## 06 — Fase 1 — Pacientes e Agenda

**Banco:** `pacientes`, `vinculos_paciente`, `salas`, `recorrencias`, `agendamentos`, `consentimentos`; `pode_clinico`, `pode_agenda`; pgTAP para cada papel.

**Back**
- [ ] CRUD de paciente (campo a campo), com `responsavel_legal` obrigatório para menor de idade — regra no servidor
- [ ] `AgendaService`: criar sessão avulsa, criar recorrência, gerar ocorrências futuras, editar uma / esta e as próximas
- [ ] Conflito de horário (profissional e sala) recusado **no banco** com constraint de exclusão (`tstzrange` + `EXCLUDE USING gist`), não só no Nest
- [ ] Transição de status validada no servidor (Realizada não volta a Agendada sem registro)
- [ ] `.ics` só da sessão, sem nome do paciente (iniciais)

**Front**
- [ ] Lista de pacientes com busca e situação
- [ ] Ficha do paciente com abas — nesta fase só **Dados** e **Sessões**; as outras aparecem como "em breve"
- [ ] Agenda: semana e mês no desktop, lista do dia no celular — quem esconde é o CSS, não `window.innerWidth`
- [ ] **Um formulário só** para criar e editar sessão
- [ ] Sessão muda de profissional/sala no próprio cartão, sem apagar e refazer
- [ ] Dashboard: "hoje", "esta semana", "sem próxima sessão marcada"

## 07 — Fase 2 — Prontuário (o módulo mais denso)

É o Lançamentos do PSI. Só entra depois de `FichaRouter`, `AttachmentUploader` e auditoria prontos.

**Banco:** `evolucoes`, `notas_pessoais`, `anamneses`, `modelos_anamnese`, `anexos`; `prontuario_ler` com `registrar_leitura` dentro; trigger que recusa `update` em evolução assinada; `pode_arquivo` conhecendo `pacientes` **no mesmo commit** do módulo (a lição do `producoes`).

**Back**
- [ ] `ProntuarioService`: rascunho, assinar (trava), retificar (nova linha que aponta para a antiga)
- [ ] `PendenciaService`: sessão Realizada sem evolução há mais de N dias; paciente sem anamnese; menor sem responsável
- [ ] Anamnese por modelo (`secoes` como dado — seção nova não mexe em código, como o `EV_SECOES`)
- [ ] Anexo: servidor confere, decide o caminho e devolve URL assinada; bytes vão do navegador ao Storage
- [ ] Compartilhar prontuário (supervisão/coterapia) com prazo, auditado
- [ ] Exportar prontuário completo de um paciente (janela de impressão, como o dossiê do DIME)

**Front**
- [ ] Abas da ficha: Dados · Sessões · Anamnese · Evoluções · Documentos · Anexos · Financeiro · Histórico
- [ ] `<EvolucaoEditor>` grava rascunho no blur; "Assinar evolução" pede confirmação e trava
- [ ] Notas pessoais num bloco visualmente separado, com aviso de que não fazem parte do prontuário
- [ ] Histórico da ficha lê `auditoria` (quem abriu, quem alterou)
- [ ] Atalho na agenda: sessão Realizada abre direto a evolução daquela sessão

> **Armadilha:** campo portado se confere contra o que está gravado, não contra o que parece certo. Toda coluna nova ganha prova que prende o nome, conferida quebrando de propósito.

## 08 — Fase 3 — Financeiro

**Banco:** `cobrancas`, `pagamentos`, `recibos`, `repasses`; `pode_financeiro`; psicólogo só vê as próprias.

**Back**
- [ ] Origem da cobrança: por sessão, pacote (N sessões) ou mensalidade
- [ ] Política de falta configurável por clínica (cobra / não cobra / cobra se aviso < X horas) — regra no servidor
- [ ] Gerar cobrança ao marcar sessão como Realizada ou Falta, conforme a política
- [ ] Recibo interno numerado e PDF; campos prontos para o Receita Saúde
- [ ] Repasse por profissional (percentual ou fixo) por período
- [ ] Relatório: a receber, recebido, inadimplência, repasses — **um construtor, três saídas** (tela, CSV, impressão)

**Front**
- [ ] Lista de cobranças com filtro por situação e profissional
- [ ] Baixa manual (Pix, dinheiro, cartão)
- [ ] Gráfico mensal com legenda (três cores sem chave obrigam a adivinhar)
- [ ] Aba Financeiro na ficha do paciente

## 09 — Fase 4 — Documentos e instrumentos

- [ ] `DocumentoService` com um modelo por tipo da Resolução CFP 06/2019, campos obrigatórios conferidos no servidor
- [ ] Emitir gera PDF, guarda o hash SHA-256 e vira imutável
- [ ] Instrumentos de domínio público (PHQ-9, GAD-7) com escore calculado **no servidor**; gráfico de evolução do escore na ficha
- [ ] Relatórios de atendimento: sessões por profissional, taxa de falta, pacientes ativos/alta

**Fim do MVP.** A partir daqui dá para vender ao psicólogo autônomo e à clínica pequena.

## 10 — Fase 5 — Equipe, Painel, Assinatura e Contas

O mesmo desenho da Fase 5 do DIME.

- [ ] **Equipe**: convite por e-mail com papel; psicólogo exige CRP; RPCs de membros com proxy 1:1 no Nest
- [ ] **Painel** (super-admin): clínicas, quantidade de pacientes ativos, situação da assinatura — **sem dado clínico**
- [ ] **Assinatura SaaS**: plano por profissional ativo; selo de situação na barra; clínica suspensa vê aviso antes de bloquear
- [ ] **Contas**: Nest repassa o token para a Edge Function `admin-contas`, que tem a `service_role` — não recriar em Nest
- [ ] **Encerramento de clínica** em quatro tempos: exportar tudo → indicar responsável pela guarda → confirmar → apagar só depois do prazo de guarda; arquivos saem antes da linha de `membros` (a ordem é do servidor, como no DIME)
- [ ] **Pedidos do titular (LGPD)**: acesso e portabilidade geram exportação; exclusão dentro do prazo de guarda fica registrada e bloqueada, com a explicação na tela

## 11 — Fase 6 — Integrações; Fase 7 — Portal do paciente

**Fase 6 — Integrações**
- [ ] Gateway de pagamento (ver seção 12): Pix com QR na cobrança, webhook de baixa automática
- [ ] Lembrete de sessão por WhatsApp (API oficial) e e-mail: só data, hora e endereço — nada que revele, a quem vê a tela bloqueada do celular, que é atendimento psicológico (o texto do lembrete é configurável pela clínica)
- [ ] Confirmação pelo próprio lembrete muda o status para Confirmada
- [ ] Sessão online: campo de link (Meet, Jitsi, Daily) por sessão; vídeo próprio só se a demanda pedir
- [ ] NFS-e para clínica PJ

**Fase 7 — Portal do paciente**
- [ ] Login do paciente separado do login da equipe
- [ ] Ver próximas sessões, confirmar, pedir remarcação
- [ ] Preencher anamnese e instrumentos antes da primeira sessão
- [ ] Aceitar contrato terapêutico e termo LGPD (grava em `consentimentos` com versão)
- [ ] Pagar cobrança aberta
- [ ] Agendamento online pelos horários livres que o psicólogo publicar

**Antes de abrir para clientes reais (vale em qualquer fase que leve dado real)**
- [ ] Teste de invasão externo focado em RLS e IDOR
- [ ] Política de privacidade, termos e DPA publicados
- [ ] Plano de resposta a incidente (quem avisa a ANPD e a clínica, em quanto tempo)
- [ ] Beta fechado com 3 a 5 psicólogos das entrevistas da Fase −1

---

## 12 — Em aberto

- **Nome do produto** e domínio.
- **Gateway de pagamento** — recomendação: **Asaas** (Pix, boleto, cartão, NFS-e e split nativos, foco no Brasil). Stripe só se houver plano de atender fora do país. A decisão bloqueia a Fase 6, não o MVP.
- **Criptografia de campo** para `evolucoes.texto` e `notas_pessoais.texto`, além da criptografia em repouso do Supabase. Protege contra vazamento de backup, mas impede busca no texto. Decidir antes da Fase 2, porque mudar depois exige migrar todo o histórico.
- **Assinatura digital ICP-Brasil / gov.br** em laudo e relatório — pedido comum, custo e fluxo a estudar.
- **Convênios (padrão TISS)** — só se as entrevistas mostrarem demanda; é um módulo inteiro.
- **App nativo** — começar como PWA instalável; nativo só se o lembrete por push precisar.
- **Fornecedor de WhatsApp** — API oficial (Cloud API da Meta) contra intermediários; a oficial custa por conversa, os intermediários arriscam bloqueio do número.

**Fora de escopo, de propósito:** prontuário de outras profissões (o nicho é a força do produto), teleconsulta com vídeo próprio, emissão fiscal dentro do MVP e qualquer recurso de IA sobre conteúdo clínico — este último exige uma conversa de consentimento e ética própria antes de existir.
