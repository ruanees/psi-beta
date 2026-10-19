# PSI

Gestão de consultório para psicólogos. O plano completo, com fases e decisões, está em [`PLANO.md`](PLANO.md).

```
psi-beta/
├── back/                 NestJS (BFF) no Cloudflare Workers
│   ├── src/              rotas, guard de JWT, conversa com o Supabase
│   ├── supabase/
│   │   ├── migrations/   o banco inteiro, em ordem — toda regra de acesso mora aqui
│   │   └── tests/        provas de RLS (pgTAP)
│   ├── test/             testes da API
│   ├── openapi.json      contrato da API, gerado e versionado
│   └── wrangler.toml     configuração do Worker (homologação e produção)
├── front/                Next.js no Cloudflare Workers (@opennextjs/cloudflare)
│   ├── app/              páginas
│   ├── components/
│   ├── lib/              api() tipada, sessão, menu, formatadores
│   └── wrangler.jsonc
├── docs/referencias/     telas de referência para o design system
└── .github/workflows/    CI do back e do front
```

Front e back moram no mesmo repositório, em pastas independentes: cada uma tem o próprio `package.json`, a própria CI e vira um Worker separado na Cloudflare. O único elo é o `back/openapi.json` — o front gera os tipos a partir dele, e um DTO que muda no back quebra o build do front em vez de virar bug em produção.

## Como funciona

```
navegador ──> psi-front (Next) ──REST + JWT──> psi-back (Nest) ──JWT de quem chamou──> Supabase
                                                                                    (Postgres + RLS)
```

- O front **nunca** fala com o Supabase. Não há chave nenhuma no bundle.
- O back repassa o JWT de quem chamou e usa só a chave pública. **Quem decide o que cada um vê é o banco** (RLS e funções `security definer`), não o Nest.
- Toda escrita passa por RPC; nenhuma tabela aceita insert, update ou delete direto. As tabelas de paciente e agenda também não aceitam leitura direta: o dado clínico sai só pela RPC, que registra quem leu.
- Quem ativou o código do autenticador só lê dado depois de confirmá-lo — a trava também é do banco.

## Publicação (homologação)

Homologação usa só dado de teste. O ambiente de produção nasce na véspera do beta, repetindo estes passos com os nomes de produção.

**Depois da configuração inicial abaixo, ninguém publica à mão.** O fluxo é:

1. PR aberto → CI (`back` e `front`) roda.
2. CI verde → o auto-merge junta o PR na `main`.
3. Merge na `main` → o workflow `publicar` roda, nesta ordem: migrations novas no Supabase (`supabase db push`), Worker do back, Worker do front. Se um passo falha, os seguintes não rodam.

Os segredos ficam só em **GitHub → Settings → Secrets and variables → Actions**:

| Nome | Tipo | Onde pegar |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | secret | Supabase → avatar → **Account preferences → Access Tokens** |
| `SUPABASE_DB_PASSWORD` | secret | a senha do banco do projeto (**Database → Settings → Reset database password** se perdeu) |
| `CLOUDFLARE_API_TOKEN` | secret | Cloudflare → **My Profile → API Tokens → Create Token → Edit Cloudflare Workers** |
| `SUPABASE_PROJECT_REF` | variable | o `xxxx` de `https://xxxx.supabase.co` |
| `CLOUDFLARE_ACCOUNT_ID` | variable | Cloudflare → **Workers & Pages**, coluna da direita, **Account ID** |

Sem eles o `publicar` só avisa e não publica nada. Migration que foi rodada à mão no SQL Editor precisa ser marcada uma vez pelo workflow **marcar migrations** (Actions → marcar migrations → Run workflow), senão o `db push` tenta rodá-la de novo.

### 1. Supabase

1. Criar o projeto **`psi-homolog`**, região **South America (São Paulo)**. Guardar a senha do banco.
2. **Authentication → Sign In / Providers → Email**: desligar **Allow new users to sign up**. O beta é fechado; conta nasce pelo passo 5.
3. **Authentication → Multi-Factor**: ligar **TOTP** (enroll e verify).
4. As migrations de `back/supabase/migrations/` sobem sozinhas no merge (workflow `publicar`). Projeto novo: configurar os segredos acima antes do primeiro merge.
5. Criar sua conta:
   - **Authentication → Users → Add user → Create new user**: seu e-mail e uma senha (10+ caracteres, letras e números), marcando **Auto Confirm User**.
   - **SQL Editor**:
     ```sql
     select public.conta_criar('seu@email.com', 'Nome do consultório', 'Seu nome');
     ```
6. **Project Settings → API Keys**: copiar a **Publishable key** (ou a `anon` em *Legacy API keys*). É pública por design.
7. **Project Settings → Data API**: copiar a **URL** do projeto (`https://xxxx.supabase.co`).

### 2. Cloudflare — back

1. **Workers & Pages → Create → Import a repository** → `ruanees/psi-beta`.
2. Nome do Worker: **`psi-back-homolog`** (tem que ser igual ao `name` do `back/wrangler.toml`).
3. **Root directory**: `back` · **Build command**: `npm run build` · **Deploy command**: `npm run deploy`. Depois do primeiro deploy, desconectar o repositório (**Settings → Build → Git repository → Disconnect**): quem publica é o workflow `publicar`, na ordem certa.
4. Antes do primeiro deploy, preencher no `back/wrangler.toml`, seção `[vars]`: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e, depois que o front existir, o endereço dele em `ORIGENS` e `FRONT_URL`. **Não use o painel para isso**: o deploy sobrescreve as variáveis do painel com as do arquivo.
5. Conferir `https://psi-back-homolog.<sua-conta>.workers.dev/saude`: precisa responder `"supabase": true`.

### 3. Cloudflare — front

1. **Import a repository** de novo, mesmo repositório.
2. Nome do Worker: **`psi-front-homolog`** (igual ao `name` do `front/wrangler.jsonc`).
3. **Root directory**: `front` · **Build command**: `npm run build` · **Deploy command**: `npm run deploy`. Também desconectar o repositório depois do primeiro deploy.
4. `NEXT_PUBLIC_API_URL` = endereço do back, sem barra no fim. É variável de **build** (colada no bundle): no workflow `publicar` ela está no `env` do job `front`; no build da Cloudflare, em **Settings → Build → Variables and secrets**, nunca nas de runtime.
5. Voltar ao `back/wrangler.toml` e pôr o endereço do front em `ORIGENS` e `FRONT_URL`. Sem isso o navegador bloqueia as chamadas (CORS) e o link de recuperação de senha volta para o lugar errado.

### 4. Supabase — endereço do front

**Authentication → URL Configuration**: **Site URL** e **Redirect URLs** = endereço do front. A recuperação de senha só volta para endereço que estiver nesta lista.

### 5. Backoffice (`ruanees/senda-backoffice`)

O backoffice da plataforma mora em outro repositório, com API e front próprios, mas o banco é este. O que ele lê e grava está aqui:

- `back/supabase/migrations/20261019000002_plataforma.sql`: assinaturas, pagamentos e as funções `plataforma_*`. Toda função abre com `exigir_super()`, e nenhuma lê tabela clínica (a prova `0015_plataforma` confere isso no código das funções).
- `back/supabase/functions/admin-contas/`: cria login, troca senha e e-mail, desativa e apaga. É o único código que usa a chave de serviço, e o Supabase entrega a chave pelo ambiente da função. Antes de agir, a função pergunta ao banco com o token de quem pediu. Sobe no job **Banco** do `publicar`, depois das migrations.

Para entrar no backoffice, o seu login precisa estar em `super_admins` (uma vez, no **SQL Editor**):

```sql
insert into public.super_admins (user_id) select id from auth.users where email = 'seu@email.com';
```

Super-admin opera consultório, login e assinatura, e nunca ganha acesso clínico por estar nessa tabela.

**Escolha de contexto.** Quem está em `super_admins` vê, depois de entrar, a tela "Por onde você quer entrar?" (`/perfil`): consultório ou backoffice. O menu da conta também ganha "Ir para o backoffice". Como são dois endereços, a sessão vai junto no fragmento do endereço (`#entrar=`, que não chega ao servidor): é só o token de renovação, de uso único, trocado na hora pelo outro lado, e quem recebe pergunta "continuar como fulano?" antes de abrir. O endereço do backoffice é a variável de build `NEXT_PUBLIC_BACKOFFICE_URL` (no `publicar`); sem ela, a escolha não aparece.

### Se algo não subir

| Sintoma | Causa provável |
|---|---|
| `/saude` com `"supabase": false` | `SUPABASE_URL` ou `SUPABASE_ANON_KEY` não estão no `wrangler.toml` |
| Login funciona, o resto responde 503 com `codigo: SUPABASE_JWT_SECRET` | Projeto antigo, que assina JWT em HS256. Rodar em `back/`: `npx wrangler secret put SUPABASE_JWT_SECRET` com o JWT Secret de *Project Settings → JWT Keys* |
| Tela de login sem reação, erro de CORS no console | Endereço do front fora de `ORIGENS` |
| Build do front para com "NEXT_PUBLIC_API_URL é obrigatória" | A variável foi posta em runtime, não em build |
| "Acesso sem consultório" depois do login | Faltou o `conta_criar` do passo 1.5 |
| "O banco está desatualizado: falta rodar a migration nova" | O job **Banco** do `publicar` falhou ou não rodou; ver Actions |
| `publicar` para no **Banco** com "already exists" | Migration rodada à mão e não marcada: rodar **marcar migrations** com a versão dela e depois **Re-run** no `publicar` |
| `publicar` só mostra o aviso "Publicação desligada" | Falta segredo ou variável em Settings → Secrets and variables → Actions |

O `/saude` diz **de onde** veio cada configuração (`process`, `worker`, `faltando`), nunca o valor.

## Desenvolvimento local

Precisa de Node 22.

```bash
# back
cd back
npm ci
cp .env.example .env        # apontar para o projeto de homologação
npm run dev                 # http://localhost:3001

# front (outro terminal)
cd front
npm ci
cp .env.example .env.local  # NEXT_PUBLIC_API_URL=http://localhost:3001
npm run dev                 # http://localhost:3000
```

### Testes

```bash
cd back
npm test                    # API: rota fechada por padrão, 503 com banco fora, nomes de campo x migration
npm run bundle              # gera o Worker exatamente como a Cloudflare
npx supabase start          # Postgres + Auth locais (Docker)
npx supabase test db        # provas de RLS

cd front
npm run typecheck           # inclui gerar os tipos de back/openapi.json
npm run prova               # formatadores e menu x páginas
npm run build               # o mesmo build da Cloudflare
```

A CI roda tudo isso a cada push e em todo PR. Para rodar o mesmo de uma vez, na raiz:

```bash
scripts/validar.sh               # back, banco (migrations do zero + pgTAP) e front
scripts/validar.sh banco         # só uma parte: back, banco ou front
scripts/validar.sh --alterado    # só as partes que os commits fora da main tocam
```

Com `git config core.hooksPath .githooks`, o `--alterado` roda sozinho antes de cada `git push`. Na sessão do Claude Code na nuvem isso já vem ligado: o hook de início (`.claude/hooks/session-start.sh`) instala as dependências, liga o pre-push e deixa o Supabase local no ar.

## Regras do repositório

- **Banco muda por migration**, nunca pelo painel. Arquivo novo em `back/supabase/migrations/`, com teste em `back/supabase/tests/`.
- **Mudou DTO ou rota no back**: rodar `npm run openapi` em `back/` e fazer commit do `openapi.json`. A CI recusa o contrato desatualizado.
- **Tela nova**: ligar o item em `front/lib/menu.ts` (`pronta: true`). A prova do menu confere que a página existe.
- **Rota pública nova** no back exige mudar a lista `PUBLICAS` em `back/test/http.test.ts` — abrir rota é decisão, não acidente.
- **Nada de dado de paciente** em log, URL, query string ou mensagem de erro.
- Escrita da interface: sem emoji, sem exclamação, botão diz o que faz.
