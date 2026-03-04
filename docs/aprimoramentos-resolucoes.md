# Aprimoramentos e Resoluções
# As tarefas devem estar claras, detalhadas e com exemplos quando necessário.

---

## Template de tarefa

Use este modelo para novas entradas:

### [ ] <número>. <título objetivo>

**Problema**
- Contexto do problema.
- Onde acontece.

**Evidência**
- Arquivo(s) e trecho(s) observados.
- Exemplo(s) de cenário real.

**Impacto**
- Risco técnico/funcional.
- Efeito para manutenção e usuário.

**Correção esperada (aceite)**
1. Resultado esperado 1.
2. Resultado esperado 2.
3. Resultado esperado 3.

**Plano sugerido (incremental)**
1. Fase 1.
2. Fase 2.
3. Fase 3.

**Regras de qualidade**
1. Não misturar com mudanças fora do escopo.
2. Preservar comportamento funcional (quando aplicável).
3. Validar por lotes pequenos.

**Critérios de pronto**
1. Critério verificável 1.
2. Critério verificável 2.
3. Documentação atualizada no `README.md` (raiz), se necessário.

---

## EXECUTAR

### [ ] 107. Remover uso de `any` em stores/composables/componentes sem alterar regra de negócio

**Problema**
- O projeto ainda possui vários pontos com `any` em camadas críticas (stores, composables e componentes).
- Isso reduz segurança de tipo e aumenta risco de regressão silenciosa.

**Evidência**
- `catch (error: any)` em fluxos de negócio.
- `Record<string, any>` em snapshot e dados dinâmicos.
- Tipos IPC com `<T = any>` em `client/app/types/electron.d.ts`.
- Uso de `any` em composables de dashboard e investimentos.

**Impacto**
- Menor previsibilidade em manutenção e refactor.
- Erros de integração aparecem só em runtime.
- Contratos entre camadas ficam ambíguos.

**Correção esperada (aceite)**
1. Substituir `any` por tipos explícitos nos pontos com contrato conhecido.
2. Trocar `catch (error: any)` por `unknown` com type guard padrão.
3. Definir tipos auxiliares para payloads dinâmicos (snapshot, IPC e callbacks).
4. Manter comportamento funcional idêntico.
5. Cobrir trechos alterados com testes unitários direcionados.

**Plano sugerido (incremental)**
1. Fase 1: Base de tipos
- Criar utilitários de narrowing de erro (`isErrorLike`, `getErrorMessage`).
- Ajustar `client/app/types/electron.d.ts` removendo default `any`.

2. Fase 2: Stores críticas
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
1. Não misturar com mudança visual/UX.
2. Não alterar fluxo de persistência durante tipagem.
3. Validar por lotes pequenos e com testes.
4. Evitar `as any` como atalho.

**Critérios de pronto**
1. Zero `any` nas camadas de negócio (`stores`, `composables` e tipos IPC).
2. Erros tratados com `unknown` e narrowing padronizado.
3. Testes atualizados para os novos contratos tipados.
4. Documentação técnica atualizada no `README.md` da raiz, se necessário.
