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
- Toda escrita passa por RPC; nenhuma tabela aceita insert, update ou delete direto.
- Quem ativou o código do autenticador só lê dado depois de confirmá-lo — a trava também é do banco.

## Publicação (homologação)

Homologação usa só dado de teste. O ambiente de produção nasce na véspera do beta, repetindo estes passos com os nomes de produção.

### 1. Supabase

1. Criar o projeto **`psi-homolog`**, região **South America (São Paulo)**. Guardar a senha do banco.
2. **Authentication → Sign In / Providers → Email**: desligar **Allow new users to sign up**. O beta é fechado; conta nasce pelo passo 5.
3. **Authentication → Multi-Factor**: ligar **TOTP** (enroll e verify).
4. **SQL Editor**: colar e rodar o conteúdo de `back/supabase/migrations/20261014000001_fundacoes.sql`. Cada migration nova entra do mesmo jeito, em ordem.
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
3. **Root directory**: `back` · **Build command**: `npm run build` · **Deploy command**: `npm run deploy`.
4. Antes do primeiro deploy, preencher no `back/wrangler.toml`, seção `[vars]`: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e, depois que o front existir, o endereço dele em `ORIGENS` e `FRONT_URL`. **Não use o painel para isso**: o deploy sobrescreve as variáveis do painel com as do arquivo.
5. Conferir `https://psi-back-homolog.<sua-conta>.workers.dev/saude`: precisa responder `"supabase": true`.

### 3. Cloudflare — front

1. **Import a repository** de novo, mesmo repositório.
2. Nome do Worker: **`psi-front-homolog`** (igual ao `name` do `front/wrangler.jsonc`).
3. **Root directory**: `front` · **Build command**: `npm run build` · **Deploy command**: `npm run deploy`.
4. **Settings → Build → Variables and secrets** (de **build**, não as de runtime): `NEXT_PUBLIC_API_URL` = endereço do back, sem barra no fim. Ela é colada no bundle durante o build; posta como variável de runtime não chega.
5. Voltar ao `back/wrangler.toml` e pôr o endereço do front em `ORIGENS` e `FRONT_URL`. Sem isso o navegador bloqueia as chamadas (CORS) e o link de recuperação de senha volta para o lugar errado.

### 4. Supabase — endereço do front

**Authentication → URL Configuration**: **Site URL** e **Redirect URLs** = endereço do front. A recuperação de senha só volta para endereço que estiver nesta lista.

### Se algo não subir

| Sintoma | Causa provável |
|---|---|
| `/saude` com `"supabase": false` | `SUPABASE_URL` ou `SUPABASE_ANON_KEY` não estão no `wrangler.toml` |
| Login funciona, o resto responde 503 com `codigo: SUPABASE_JWT_SECRET` | Projeto antigo, que assina JWT em HS256. Rodar em `back/`: `npx wrangler secret put SUPABASE_JWT_SECRET` com o JWT Secret de *Project Settings → JWT Keys* |
| Tela de login sem reação, erro de CORS no console | Endereço do front fora de `ORIGENS` |
| Build do front para com "NEXT_PUBLIC_API_URL é obrigatória" | A variável foi posta em runtime, não em build |
| "Acesso sem consultório" depois do login | Faltou o `conta_criar` do passo 1.5 |

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

A CI roda tudo isso a cada push e em todo PR.

## Regras do repositório

- **Banco muda por migration**, nunca pelo painel. Arquivo novo em `back/supabase/migrations/`, com teste em `back/supabase/tests/`.
- **Mudou DTO ou rota no back**: rodar `npm run openapi` em `back/` e fazer commit do `openapi.json`. A CI recusa o contrato desatualizado.
- **Tela nova**: ligar o item em `front/lib/menu.ts` (`pronta: true`). A prova do menu confere que a página existe.
- **Rota pública nova** no back exige mudar a lista `PUBLICAS` em `back/test/http.test.ts` — abrir rota é decisão, não acidente.
- **Nada de dado de paciente** em log, URL, query string ou mensagem de erro.
- Escrita da interface: sem emoji, sem exclamação, botão diz o que faz.
