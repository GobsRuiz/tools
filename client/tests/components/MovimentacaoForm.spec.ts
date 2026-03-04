import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MovimentacaoForm from '~/components/movimentacoes/MovimentacaoForm.vue'
import { useAccountsStore } from '~/stores/useAccounts'

const toastMock = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}

vi.mock('~/composables/useAppToast', () => ({
  useAppToast: () => toastMock,
}))

const SelectStub = defineComponent({
  name: 'Select',
  inheritAttrs: false,
  props: {
    modelValue: { type: [String, Number, null], default: null },
    disabled: { type: Boolean, default: false },
  },
  template: '<div class="select-stub" :data-disabled="String(disabled)" v-bind="$attrs"><slot /></div>',
})

const MoneyInputStub = defineComponent({
  name: 'MoneyInput',
  inheritAttrs: false,
  props: {
    modelValue: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
  },
  template: '<input class="money-input-stub" :disabled="disabled" v-bind="$attrs" />',
})

const TabsStub = defineComponent({
  name: 'Tabs',
  template: '<div><slot /></div>',
})

describe('MovimentacaoForm - transferencia paga', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    toastMock.success.mockClear()
    toastMock.error.mockClear()
    toastMock.info.mockClear()
    toastMock.warning.mockClear()
  })

  it('bloqueia origem/destino/valor na UI ao editar transferencia paga', () => {
    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, bank: 'A', label: 'Conta A', type: 'bank', balance_cents: 100000 } as any,
      { id: 2, bank: 'B', label: 'Conta B', type: 'bank', balance_cents: 50000 } as any,
      { id: 3, bank: 'C', label: 'Conta C', type: 'bank', balance_cents: 20000 } as any,
    ]

    const wrapper = mount(MovimentacaoForm, {
      props: {
        editTransaction: {
          id: 'tx-transfer-paid',
          accountId: 1,
          destinationAccountId: 2,
          date: '2026-03-02',
          type: 'transfer',
          amount_cents: -20000,
          description: 'Transferencia paga',
          paid: true,
          installment: null,
          createdAt: '2026-03-02',
        } as any,
      },
      global: {
        stubs: {
          Tabs: TabsStub,
          TabsList: true,
          TabsTrigger: true,
          Select: SelectStub,
          SelectTrigger: true,
          SelectValue: true,
          SelectContent: true,
          SelectItem: true,
          Label: true,
          Input: true,
          MoneyInput: MoneyInputStub,
          Checkbox: true,
          Button: true,
          Spinner: true,
          Save: true,
        },
      },
    })

    const origin = wrapper.get('[data-testid="transfer-origin-select"]')
    const destination = wrapper.get('[data-testid="transfer-destination-select"]')
    const amountInput = wrapper.get('[data-testid="transfer-amount-input"]')

    expect(origin.attributes('data-disabled')).toBe('true')
    expect(destination.attributes('data-disabled')).toBe('true')
    expect(amountInput.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Conta origem e destino ficam bloqueadas')
  })

  it('hidrata destinationAccountId ao abrir edicao de transferencia', async () => {
    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, bank: 'A', label: 'Conta A', type: 'bank', balance_cents: 100000 } as any,
      { id: 2, bank: 'B', label: 'Conta B', type: 'bank', balance_cents: 50000 } as any,
    ]

    const wrapper = mount(MovimentacaoForm, {
      props: {
        editTransaction: {
          id: 'tx-transfer-open',
          accountId: 1,
          destinationAccountId: 2,
          date: '2026-03-02',
          type: 'transfer',
          amount_cents: -20000,
          description: 'Transferencia em aberto',
          paid: false,
          installment: null,
          createdAt: '2026-03-02',
        } as any,
      },
      global: {
        stubs: {
          Tabs: TabsStub,
          TabsList: true,
          TabsTrigger: true,
          Select: SelectStub,
          SelectTrigger: true,
          SelectValue: true,
          SelectContent: true,
          SelectItem: true,
          Label: true,
          Input: true,
          MoneyInput: MoneyInputStub,
          Checkbox: true,
          Button: true,
          Spinner: true,
          Save: true,
        },
      },
    })

    await nextTick()
    await nextTick()

    const vm = wrapper.vm as any
    expect(vm.txForm.type).toBe('transfer')
    expect(vm.txForm.accountId).toBe(1)
    expect(vm.txForm.destinationAccountId).toBe(2)
  })
})

describe('MovimentacaoForm - parcelamento bidirecional', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    toastMock.success.mockClear()
    toastMock.error.mockClear()
    toastMock.info.mockClear()
    toastMock.warning.mockClear()
  })

  function mountForm() {
    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, bank: 'A', label: 'Conta A', type: 'bank', balance_cents: 100000, card_closing_day: 8, card_due_day: 15 } as any,
    ]

    return mount(MovimentacaoForm, {
      global: {
        stubs: {
          Tabs: TabsStub,
          TabsList: true,
          TabsTrigger: true,
          Select: SelectStub,
          SelectTrigger: true,
          SelectValue: true,
          SelectContent: true,
          SelectItem: true,
          Label: true,
          Input: true,
          MoneyInput: MoneyInputStub,
          Checkbox: true,
          Button: true,
          Spinner: true,
          Save: true,
        },
      },
    })
  }

  it('recalcula total quando valor da parcela for o ultimo campo editado', async () => {
    const wrapper = mountForm()
    const vm = wrapper.vm as any

    vm.txForm.parcelado = true
    vm.txForm.totalParcelas = '3'
    vm.txForm.amount = '300,00'
    await nextTick()
    await nextTick()

    expect(vm.txForm.valorParcela).toBe('100,00')
    expect(wrapper.text()).toContain('Campo autoajustado: Valor da parcela')

    vm.txForm.valorParcela = '120,00'
    await nextTick()
    await nextTick()

    expect(vm.txForm.amount).toBe('360,00')
    expect(wrapper.text()).toContain('Campo autoajustado: Total')
  })

  it('deriva quantidade por total+parcela e sinaliza combinacao inviavel', async () => {
    const wrapper = mountForm()
    const vm = wrapper.vm as any

    vm.txForm.parcelado = true
    vm.txForm.totalParcelas = ''
    vm.txForm.amount = '100,00'
    await nextTick()

    vm.txForm.valorParcela = '30,00'
    await nextTick()
    await nextTick()
    expect(vm.txForm.totalParcelas).toBe('')
    expect(wrapper.text()).toContain('Total e valor da parcela devem resultar em quantidade inteira.')

    vm.txForm.valorParcela = '25,00'
    await nextTick()
    await nextTick()
    expect(vm.txForm.totalParcelas).toBe('4')
    expect(wrapper.text()).toContain('Campo autoajustado: Quantidade de parcelas')
  })
})
