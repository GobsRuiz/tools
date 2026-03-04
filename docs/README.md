# Documentacao do Projeto Financeiro

Este diretorio foi simplificado para manter apenas documentos ativos e uteis no estado atual do projeto.

## Arquivos ativos

- `aprimoramentos-resolucoes.md`: backlog de melhorias e correcoes (fonte principal de tarefas).
- `anotacao.md`: ideias futuras sem compromisso de execucao imediata.

## Resumo tecnico atual

- App desktop/local: Electron + Nuxt 4 (SSR desativado).
- Estado e regras: Pinia + Zod.
- Persistencia:
  - Desenvolvimento web: json-server no root (`http://localhost:3011`).
  - Electron: acesso IPC para `db.json` local com operacoes atomicas no processo principal.
- Node suportado: `>=20.0.0`.

## Scripts principais

No root:
- `npm run dev`: sobe API mock (`3011`) + frontend (`3010`).
- `npm run typecheck`: roda typecheck do client.
- `npm run electron:dev`: sobe mock + frontend e abre Electron.

No client:
- `npm run dev`
- `npm run typecheck`
- `npm run test`
- `npm run test:coverage`

## Rotas da aplicacao (estado atual)

- `/` dashboard
- `/movimentacoes`
- `/investimentos`
- `/pagamentos`
- `/contas`
- `/settings`
- `/alertas`

## Convencoes para evolucao

1. Registrar mudancas tecnicas novas primeiro em `aprimoramentos-resolucoes.md`.
2. Evitar criar multiplos planos paralelos; manter backlog centralizado.
3. Atualizar este arquivo quando mudar arquitetura, scripts ou rotas.
4. Nao executar comandos destrutivos sem aprovacao.
