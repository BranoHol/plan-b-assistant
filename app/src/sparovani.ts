// Spárování s vlastním serverem.
// Adresa a token žijí JEN v trvalém úložišti telefonu (localStorage) —
// v balíčku aplikace není žádné tajemství. Klíč živého přepisu a slovník
// jmen vydává po spárování server; drží se pouze v paměti.

const KL_SERVER = 'planb.server'
const KL_TOKEN = 'planb.token'

let ulServer = ''
let ulToken = ''
let ulSoniox = ''
let ulSlovnik: string[] = []

/** Načte uložené spárování; vrací true, když existuje. */
export function nactiSparovani(): boolean {
  try {
    ulServer = localStorage.getItem(KL_SERVER) ?? ''
    ulToken = localStorage.getItem(KL_TOKEN) ?? ''
  } catch { ulServer = ''; ulToken = '' }
  return sparovano()
}

export function sparovano(): boolean { return !!(ulServer && ulToken) }
export function server(): string { return ulServer }
export function token(): string { return ulToken }
export function sonioxKlic(): string { return ulSoniox }
export function slovnik(): string[] { return ulSlovnik }

export function normalizujAdresu(vstup: string): string {
  let a = vstup.trim()
  if (!a) return ''
  if (!/^https?:\/\//i.test(a)) a = 'https://' + a
  return a.replace(/\/+$/, '')
}

/** Ověří adresu + token proti serveru a uloží je. Vrací null, nebo text chyby. */
export async function sparuj(adresa: string, tok: string): Promise<string | null> {
  const a = normalizujAdresu(adresa)
  const t = tok.trim()
  if (!a || !t) return 'Enter both the server address and the token.'
  try {
    const r = await fetch(`${a}/stav`, {
      headers: { 'Authorization': `Bearer ${t}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (r.status === 401 || r.status === 403) return 'The server refused this token.'
    if (!r.ok) return `The server answered with an error (${r.status}).`
  } catch {
    return 'Server not reachable. Check the address and your connection.'
  }
  ulServer = a
  ulToken = t
  try {
    localStorage.setItem(KL_SERVER, a)
    localStorage.setItem(KL_TOKEN, t)
  } catch { /* bez trvalého úložiště vydrží spárování do konce běhu */ }
  return null
}

export function zrusSparovani() {
  ulServer = ''; ulToken = ''; ulSoniox = ''; ulSlovnik = []
  try {
    localStorage.removeItem(KL_SERVER)
    localStorage.removeItem(KL_TOKEN)
  } catch { /* nic */ }
}

/** Stáhne ze serveru klíč živého přepisu a slovník jmen.
 *  Starší server bez /nastaveni → tiše bez nich (pojede záložní přepis). */
export async function nactiNastaveni(): Promise<void> {
  if (!sparovano()) return
  try {
    const r = await fetch(`${ulServer}/nastaveni`, {
      headers: { 'Authorization': `Bearer ${ulToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return
    const j = await r.json()
    if (typeof j.soniox === 'string') ulSoniox = j.soniox.trim()
    if (Array.isArray(j.slovnik)) {
      ulSlovnik = j.slovnik.filter((x: unknown): x is string => typeof x === 'string' && !!x.trim())
    }
  } catch { /* živý přepis pak jede přes záložní cestu */ }
}
