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

### [x] 108. Corrigir textos com mojibake (encoding quebrado) no app

**Problema**
- Alguns textos em português apareciam com caracteres quebrados (`TransaÃ§Ãµes`, `NÃ£o`, etc.).
- Isso impacta legibilidade e percepção de qualidade da interface.

**Evidência**
- Ocorrências em componentes/páginas e stores do `client/app`.
- Exemplos: rótulos de abas, mensagens de erro e comentários.

**Impacto**
- UX prejudicada por textos visualmente incorretos.
- Maior risco de regressão visual e de interpretação do usuário.

**Correção esperada (aceite)**
1. Remover mojibake nos arquivos afetados do `client/app`.
2. Preservar textos com acentuação correta (`ç`, `ã`, `é`, etc.).
3. Não alterar regra de negócio.

**Plano sugerido (incremental)**
1. Identificar arquivos com padrões de mojibake.
2. Corrigir encoding apenas onde necessário.
3. Validar ausência dos padrões corrigidos.

**Regras de qualidade**
1. Não misturar com mudança funcional.
2. Preservar lógica e assinatura de funções.
3. Evitar alterações fora do `client/app`.

**Critérios de pronto**
1. Zero ocorrências de mojibake no `client/app`.
2. Textos em português legíveis na base.
3. Sem impacto no typecheck e testes.

### [x] 109. Eliminar `any` residual nas páginas (`settings.vue` e `contas.vue`)

**Problema**
- Ainda existem `catch (error: any)` em páginas do app.
- Isso mantém brecha de tipagem e tratamento inconsistente de erro.

**Evidência**
- `client/app/pages/settings.vue` (múltiplos `catch (error: any)`).
- `client/app/pages/contas.vue` (`catch (e: any)`).

**Impacto**
- Menor segurança de tipos no fluxo de UI.
- Possível divergência de padrão em relação às stores/composables.

**Correção esperada (aceite)**
1. Substituir `any` por `unknown`.
2. Padronizar leitura da mensagem de erro com utilitário (`getErrorMessage`) ou type guard equivalente.
3. Manter comportamento visual e funcional atual.

**Plano sugerido (incremental)**
1. Ajustar `catch` na `settings.vue`.
2. Ajustar `catch` na `contas.vue`.
3. Validar com typecheck e testes.

**Regras de qualidade**
1. Não alterar fluxo de negócio.
2. Não mudar UX.
3. Evitar casting forçado.

**Critérios de pronto**
1. Zero `any` nas páginas citadas.
2. Erros tratados com `unknown` + narrowing.
3. Typecheck e testes sem regressão.
