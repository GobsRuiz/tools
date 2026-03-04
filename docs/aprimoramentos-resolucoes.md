# Aprimoramentos e Resolucao
# As tarefas devem estar claras, detalhadas e com exemplos quando necessario.

---

## EXECUTAR

### [ ] 107. Remover uso de `any` em stores/composables/componentes sem alterar regra de negocio

**Problema**
- O projeto ainda possui varios pontos com `any` em camadas criticas (stores, composables e componentes).
- Isso reduz seguranca de tipo e aumenta risco de regressao silenciosa.

**Evidencia**
- `catch (error: any)` em fluxos de negocio.
- `Record<string, any>` em snapshot e dados dinamicos.
- Tipos IPC com `<T = any>` em `client/app/types/electron.d.ts`.
- Uso de `any` em composables de dashboard e investimentos.

**Impacto**
- Menor previsibilidade em manutencao e refactor.
- Erros de integracao aparecem so em runtime.
- Contratos entre camadas ficam ambiguos.

**Correcao esperada (aceite)**
1. Substituir `any` por tipos explicitos nos pontos com contrato conhecido.
2. Trocar `catch (error: any)` por `unknown` com type guard padrao.
3. Definir tipos auxiliares para payloads dinamicos (snapshot, IPC e callbacks).
4. Manter comportamento funcional identico.
5. Cobrir trechos alterados com testes unitarios direcionados.

**Plano sugerido (incremental)**
1. Fase 1: Base de tipos
- Criar utilitarios de narrowing de erro (`isErrorLike`, `getErrorMessage`).
- Ajustar `client/app/types/electron.d.ts` removendo default `any`.

2. Fase 2: Stores criticas
- `client/app/stores/useTransactions.ts`
- `client/app/stores/useAccounts.ts`
- `client/app/stores/useInvestmentEvents.ts`

3. Fase 3: Composables de maior acoplamento
- `client/app/composables/useInvestmentPageState.ts`
- `client/app/composables/useMovimentacoesState.ts`
- `client/app/composables/useDashboardData.ts`

4. Fase 4: Componentes com alto tratamento de erro
- `client/app/components/movimentacoes/MovimentacaoForm.vue`
- `client/app/components/pendentes/PendentesList.vue`
- `client/app/components/contas/AccountFormModal.vue`
- `client/app/components/movimentacoes/ParcelasExpansion.vue`

**Regras de qualidade**
1. Nao misturar com mudanca visual/UX.
2. Nao alterar fluxo de persistencia durante tipagem.
3. Validar por lotes pequenos e com testes.
4. Evitar `as any` como atalho.

**Criterios de pronto**
1. Zero `any` nas camadas de negocio (`stores`, `composables` e tipos IPC).
2. Erros tratados com `unknown` e narrowing padronizado.
3. Testes atualizados para os novos contratos tipados.
4. Documentacao tecnica atualizada em `docs/README.md`.
