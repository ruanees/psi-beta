# Senda (psi-beta)

Visão geral, arquitetura e regras do repositório: [`README.md`](README.md). Plano e decisões: [`PLANO.md`](PLANO.md).

## Validar antes de publicar

- `scripts/validar.sh` roda aqui o mesmo que a CI: back (tipos, testes, contrato openapi, bundle), banco (Supabase local, migrations do zero, provas pgTAP) e front (tipos, provas, build).
- `scripts/validar.sh back|banco|front` roda só uma parte; `--alterado`, só o que os commits fora da `main` tocam.
- O pre-push (`.githooks/pre-push`) roda `--alterado` antes de cada push. Não usar `git push --no-verify` sem o usuário pedir: se a validação falha, corrigir.
- Mudou migration ou regra de acesso: rodar `scripts/validar.sh banco` antes de commitar. Migration nova leva prova em `back/supabase/tests/`.
- Mudou DTO ou rota: `npm run openapi` em `back/` e commitar o `openapi.json`.

## Ambiente da nuvem

- O hook de início instala as dependências, liga o pre-push e sobe o Supabase local (banco + auth). Se ele avisar que o Supabase não subiu, `scripts/validar.sh banco` tenta de novo.
- O Docker Hub às vezes responde 429 (limite de download); o script tenta de novo sozinho. ECR e GHCR são bloqueados pela rede da sessão, por isso o script usa `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`.
- Daqui nada vai para homologação ou produção: migrations e Workers só sobem pelo workflow `publicar`, no merge na `main`.
