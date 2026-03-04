# Financeiro

Aplicação pessoal de controle financeiro local, com frontend em Nuxt 4 e modo desktop via Electron.

## Documentação oficial (fonte única)

Este `README.md` na raiz é a referência principal do projeto.

Documentos de apoio:
- `docs/aprimoramentos-resolucoes.md`: backlog técnico (melhorias/correções).
- `docs/anotacao.md`: ideias futuras sem execução imediata.

## Stack

- Nuxt 4 (SPA, `ssr: false`)
- Vue 3 + Pinia
- Zod (validação)
- shadcn-nuxt (UI)
- Vitest (testes)
- Electron (desktop)
- json-server (mock em desenvolvimento web)

## Requisitos

- Node.js `>=20.0.0`

## Endereços em desenvolvimento

- Frontend Nuxt: `http://localhost:3010`
- API mock: `http://localhost:3011`

## Scripts principais (raiz)

```bash
npm run dev           # mock + frontend
npm run typecheck     # typecheck do client
npm run electron:dev  # mock + frontend + electron
npm run electron:build
```

## Scripts úteis (client)

```bash
cd client
npm run dev
npm run typecheck
npm run test
npm run test:coverage
npm run preview
```

## Rotas atuais

- `/` dashboard
- `/movimentacoes`
- `/investimentos`
- `/pagamentos`
- `/contas`
- `/settings`
- `/alertas`

## Convenções de manutenção

1. Toda nova demanda técnica entra primeiro em `docs/aprimoramentos-resolucoes.md`.
2. Evitar múltiplos planos paralelos em arquivos separados.
3. Atualizar este `README.md` quando mudar arquitetura, scripts ou rotas.
4. Não executar comandos destrutivos sem aprovação.
