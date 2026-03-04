interface BankIdentity {
  color: string
  dotColor: string
}

const BANK_MAP: Record<string, BankIdentity> = {
  nubank: { color: 'text-purple-400', dotColor: 'bg-purple-500' },
  inter: { color: 'text-orange-400', dotColor: 'bg-orange-500' },
  'mercado pago': { color: 'text-sky-400', dotColor: 'bg-sky-500' },
  mercadopago: { color: 'text-sky-400', dotColor: 'bg-sky-500' },
  itau: { color: 'text-amber-400', dotColor: 'bg-amber-500' },
  bradesco: { color: 'text-red-400', dotColor: 'bg-red-500' },
  caixa: { color: 'text-blue-400', dotColor: 'bg-blue-500' },
  santander: { color: 'text-rose-400', dotColor: 'bg-rose-500' },
  'banco do brasil': { color: 'text-yellow-400', dotColor: 'bg-yellow-500' },
  bb: { color: 'text-yellow-400', dotColor: 'bg-yellow-500' },
  xp: { color: 'text-emerald-400', dotColor: 'bg-emerald-500' },
  c6: { color: 'text-zinc-400', dotColor: 'bg-zinc-400' },
  master: { color: 'text-indigo-400', dotColor: 'bg-indigo-500' },
  sicoob: { color: 'text-green-400', dotColor: 'bg-green-500' },
  sicredi: { color: 'text-green-500', dotColor: 'bg-green-600' },
  avenue: { color: 'text-cyan-400', dotColor: 'bg-cyan-500' },
  picpay: { color: 'text-lime-400', dotColor: 'bg-lime-500' },
  neon: { color: 'text-teal-400', dotColor: 'bg-teal-500' },
  pagseguro: { color: 'text-yellow-500', dotColor: 'bg-yellow-600' },
}

const DEFAULT_IDENTITY: BankIdentity = {
  color: 'text-muted-foreground',
  dotColor: 'bg-muted-foreground/50',
}

export function getBankIdentity(bank: string): BankIdentity {
  const key = bank.toLowerCase().trim()

  if (BANK_MAP[key]) return BANK_MAP[key]

  for (const [k, identity] of Object.entries(BANK_MAP)) {
    if (key.includes(k) || k.includes(key)) return identity
  }

  return DEFAULT_IDENTITY
}
