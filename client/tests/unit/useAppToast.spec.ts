import { describe, expect, it, vi } from 'vitest'
import { toast } from 'vue-sonner'
import { useAppToast } from '~/composables/useAppToast'

vi.mock('vue-sonner', () => ({
  toast: {
    custom: vi.fn(),
  },
}))

describe('useAppToast', () => {
  it('success usa variant default e duracao padrao', () => {
    const appToast = useAppToast()
    appToast.success({ title: 'ok', description: 'feito' })

    const call = vi.mocked(toast.custom).mock.calls[0]
    expect(call).toBeTruthy()
    expect(call?.[1]).toMatchObject({ duration: 4000 })
    expect((call?.[0] as any).props.variant).toBe('default')
    expect((call?.[0] as any).props.title).toBe('ok')
    expect((call?.[0] as any).props.description).toBe('feito')
  })

  it('error usa variant destructive e duracao padrao de erro', () => {
    const appToast = useAppToast()
    appToast.error({ title: 'erro' })

    const call = vi.mocked(toast.custom).mock.calls[0]
    expect(call?.[1]).toMatchObject({ duration: 5000 })
    expect((call?.[0] as any).props.variant).toBe('destructive')
  })

  it('info e warning respeitam override de duracao', () => {
    const appToast = useAppToast()
    appToast.info({ title: 'info', duration: 1500 })
    appToast.warning({ title: 'alerta', duration: 2500 })

    const infoCall = vi.mocked(toast.custom).mock.calls[0]
    const warningCall = vi.mocked(toast.custom).mock.calls[1]

    expect(infoCall?.[1]).toMatchObject({ duration: 1500 })
    expect((infoCall?.[0] as any).props.variant).toBe('default')

    expect(warningCall?.[1]).toMatchObject({ duration: 2500 })
    expect((warningCall?.[0] as any).props.variant).toBe('destructive')
  })
})
