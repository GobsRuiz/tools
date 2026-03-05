<script setup lang="ts">
import { Save } from 'lucide-vue-next'
import type { Account } from '~~/schemas/zod-schemas'
import { useAppToast } from '~/composables/useAppToast'
import { useAccountsStore } from '~/stores/useAccounts'
import { assertValidCreditCardPair, CREDIT_CARD_BLANK_MESSAGE, CREDIT_CARD_PAIR_MESSAGE } from '~/utils/account-credit'
import { getErrorMessage } from '~/utils/error'
import { parseBRLToCents } from '~/utils/money'

const props = defineProps<{
  account?: Account | null
}>()

const emit = defineEmits<{
  saved: []
  processing: [value: boolean]
}>()

const accountsStore = useAccountsStore()
const appToast = useAppToast()

const isEdit = computed(() => !!props.account)
const loading = ref(false)

const form = reactive({
  bank: '',
  label: '',
  balance: '',
  card_closing_day: '',
  card_due_day: '',
})

const lastAutoLabel = ref('')
const hasManualLabelEdit = ref(false)

watch(() => props.account, (acc) => {
  if (acc) {
    form.bank = acc.bank
    form.label = acc.label
    form.balance = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(acc.balance_cents / 100)
    form.card_closing_day = acc.card_closing_day?.toString() ?? ''
    form.card_due_day = acc.card_due_day?.toString() ?? ''
    lastAutoLabel.value = ''
    hasManualLabelEdit.value = true
  } else {
    resetForm()
  }
}, { immediate: true })

watch(() => form.bank, (bank) => {
  if (isEdit.value) return

  const normalizedBank = bank.trim()
  if (!normalizedBank) {
    if (!hasManualLabelEdit.value || form.label === lastAutoLabel.value) {
      form.label = ''
      lastAutoLabel.value = ''
      hasManualLabelEdit.value = false
    }
    return
  }

  if (hasManualLabelEdit.value && form.label !== lastAutoLabel.value) return

  const suggestedLabel = `${normalizedBank} Principal`
  form.label = suggestedLabel
  lastAutoLabel.value = suggestedLabel
})

watch(() => form.label, (label) => {
  if (isEdit.value) return
  if (label !== lastAutoLabel.value) {
    hasManualLabelEdit.value = true
  }
})

function resetForm() {
  form.bank = ''
  form.label = ''
  form.balance = ''
  form.card_closing_day = ''
  form.card_due_day = ''
  lastAutoLabel.value = ''
  hasManualLabelEdit.value = false
}

function parseOptionalBillingDay(rawValue: string | number, fieldLabel: string): number | undefined {
  const value = String(rawValue).trim()
  if (!value) return undefined
  if (!/^\d+$/.test(value)) {
    throw new Error(`${fieldLabel} deve ser um numero inteiro entre 1 e 31`)
  }

  const day = Number(value)
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`${fieldLabel} deve estar entre 1 e 31`)
  }

  return day
}

async function handleSubmit() {
  if (loading.value) return
  if (!form.bank.trim()) {
    appToast.error({ title: 'Erro ao salvar conta', description: 'Informe o banco' })
    return
  }

  if (!form.label.trim()) {
    appToast.error({ title: 'Erro ao salvar conta', description: 'Informe o nome da conta' })
    return
  }

  loading.value = true
  emit('processing', true)

  try {
    const closingDay = parseOptionalBillingDay(form.card_closing_day, 'Dia de fechamento da fatura')
    const dueDay = parseOptionalBillingDay(form.card_due_day, 'Dia de vencimento da fatura')
    assertValidCreditCardPair({
      card_closing_day: closingDay,
      card_due_day: dueDay,
    })

    const data = {
      bank: form.bank.trim().toLowerCase(),
      label: form.label.trim(),
      type: 'bank' as const,
      balance_cents: parseBRLToCents(form.balance),
      card_closing_day: closingDay,
      card_due_day: dueDay,
    }

    if (isEdit.value && props.account) {
      await accountsStore.updateAccount(props.account.id, data)
    } else {
      await accountsStore.addAccount(data)
    }

    appToast.success({ title: isEdit.value ? 'Conta atualizada' : 'Conta criada' })
    resetForm()
    emit('saved')
  } catch (e: unknown) {
    const message = getErrorMessage(e, 'Ocorreu um erro ao salvar a conta.')
    const isCreditPairError = message.includes(CREDIT_CARD_PAIR_MESSAGE)
    appToast.error({
      title: 'Erro ao salvar conta',
      description: isCreditPairError
        ? `${CREDIT_CARD_PAIR_MESSAGE} ${CREDIT_CARD_BLANK_MESSAGE}`
        : message,
    })
  } finally {
    loading.value = false
    emit('processing', false)
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit" class="space-y-4">
    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-2">
        <Label>Banco *</Label>
        <Input v-model="form.bank" :disabled="loading" placeholder="Ex: nubank" />
      </div>

      <div class="space-y-2">
        <Label>Nome da Conta *</Label>
        <Input v-model="form.label" :disabled="loading" placeholder="Ex: Nubank Principal" />
      </div>

      <div class="space-y-2">
        <Label>Saldo</Label>
        <MoneyInput v-model="form.balance" :disabled="loading" />
      </div>

      <div class="space-y-2">
        <Label>Dia Fechamento Fatura</Label>
        <Input v-model="form.card_closing_day" :disabled="loading" placeholder="1-31" type="number" min="1" max="31" />
      </div>

      <div class="space-y-2">
        <Label>Dia Vencimento Fatura</Label>
        <Input v-model="form.card_due_day" :disabled="loading" placeholder="1-31" type="number" min="1" max="31" />
      </div>
    </div>

    <Button type="submit" :disabled="loading" class="w-full">
      <Spinner v-if="loading" class="h-4 w-4 mr-2" />
      <Save v-else class="h-4 w-4 mr-2" />
      {{ loading ? 'Salvando...' : (isEdit ? 'Atualizar' : 'Criar Conta') }}
    </Button>
  </form>
</template>


