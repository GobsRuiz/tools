import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ParcelasExpansion from '~/components/movimentacoes/ParcelasExpansion.vue'
import { useTransactionsStore } from '~/stores/useTransactions'

const toastMock = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}

vi.mock('~/composables/useAppToast', () => ({
  useAppToast: () => toastMock,
}))

const CheckboxStub = defineComponent({
  name: 'Checkbox',
  props: {
    modelValue: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  template: `
    <button
      class="checkbox-stub"
      :disabled="disabled"
      @click="$emit('update:modelValue', !modelValue)"
    />
  `,
})

const SpinnerStub = defineComponent({
  name: 'Spinner',
  template: '<span class="spinner-stub" />',
})

describe('ParcelasExpansion.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    toastMock.success.mockClear()
    toastMock.error.mockClear()
    toastMock.info.mockClear()
    toastMock.warning.mockClear()
  })

  it('renderiza parcelas ordenadas e com data formatada', () => {
    const transactionsStore = useTransactionsStore()
    transactionsStore.transactions = [
      {
        id: 'inst-2',
        accountId: 1,
        date: '2026-04-15',
        type: 'expense',
        payment_method: 'credit',
        amount_cents: -2500,
        description: 'Compra',
        paid: true,
        installment: { parentId: 'grp-1', total: 2, index: 2, product: 'Produto' },
        createdAt: '2026-04-15',
      },
      {
        id: 'inst-1',
        accountId: 1,
        date: '2026-03-15',
        type: 'expense',
        payment_method: 'credit',
        amount_cents: -2500,
        description: 'Compra',
        paid: false,
        installment: { parentId: 'grp-1', total: 2, index: 1, product: 'Produto' },
        createdAt: '2026-03-15',
      },
    ] as any

    const wrapper = mount(ParcelasExpansion, {
      props: { parentId: 'grp-1' },
      global: {
        stubs: {
          Checkbox: CheckboxStub,
          Spinner: SpinnerStub,
        },
      },
    })

    const text = wrapper.text()
    expect(text.indexOf('Parcela 1/2')).toBeLessThan(text.indexOf('Parcela 2/2'))
    expect(text).toContain('15/03/2026')
    expect(text).toContain('15/04/2026')
  })

  it('chama markPaid e markUnpaid ao alternar checkbox', async () => {
    const transactionsStore = useTransactionsStore()
    transactionsStore.transactions = [
      {
        id: 'inst-1',
        accountId: 1,
        date: '2026-03-15',
        type: 'expense',
        payment_method: 'credit',
        amount_cents: -2500,
        description: 'Compra',
        paid: false,
        installment: { parentId: 'grp-1', total: 2, index: 1, product: 'Produto' },
        createdAt: '2026-03-15',
      },
      {
        id: 'inst-2',
        accountId: 1,
        date: '2026-04-15',
        type: 'expense',
        payment_method: 'credit',
        amount_cents: -2500,
        description: 'Compra',
        paid: true,
        installment: { parentId: 'grp-1', total: 2, index: 2, product: 'Produto' },
        createdAt: '2026-04-15',
      },
    ] as any

    const markPaidSpy = vi.spyOn(transactionsStore, 'markPaid').mockResolvedValue(undefined)
    const markUnpaidSpy = vi.spyOn(transactionsStore, 'markUnpaid').mockResolvedValue(undefined)

    const wrapper = mount(ParcelasExpansion, {
      props: { parentId: 'grp-1' },
      global: {
        stubs: {
          Checkbox: CheckboxStub,
          Spinner: SpinnerStub,
        },
      },
    })

    const checkboxes = wrapper.findAll('.checkbox-stub')
    expect(checkboxes).toHaveLength(2)

    await checkboxes[0]?.trigger('click')
    await flushPromises()
    expect(markPaidSpy).toHaveBeenCalledWith('inst-1')
    expect(toastMock.success).toHaveBeenCalled()

    await checkboxes[1]?.trigger('click')
    await flushPromises()
    expect(markUnpaidSpy).toHaveBeenCalledWith('inst-2')
  })
})
