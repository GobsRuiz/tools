import { describe, expect, it } from 'vitest'
import { getBankIdentity } from '~/utils/bankIdentity'

describe('utils/bankIdentity', () => {
  it('retorna identidade exata para bancos mapeados', () => {
    expect(getBankIdentity('nubank')).toEqual({
      color: 'text-purple-400',
      dotColor: 'bg-purple-500',
    })
    expect(getBankIdentity('inter')).toEqual({
      color: 'text-orange-400',
      dotColor: 'bg-orange-500',
    })
  })

  it('normaliza maiusculas/minusculas e espacos nas extremidades', () => {
    expect(getBankIdentity('  MERCADO PAGO  ')).toEqual({
      color: 'text-sky-400',
      dotColor: 'bg-sky-500',
    })
  })

  it('resolve por correspondencia parcial quando nao ha match exato', () => {
    expect(getBankIdentity('Nubank PJ')).toEqual({
      color: 'text-purple-400',
      dotColor: 'bg-purple-500',
    })
    expect(getBankIdentity('Banco do Brasil S.A.')).toEqual({
      color: 'text-yellow-400',
      dotColor: 'bg-yellow-500',
    })
  })

  it('retorna identidade padrao para banco desconhecido', () => {
    expect(getBankIdentity('Banco Desconhecido XYZ')).toEqual({
      color: 'text-muted-foreground',
      dotColor: 'bg-muted-foreground/50',
    })
  })
})
