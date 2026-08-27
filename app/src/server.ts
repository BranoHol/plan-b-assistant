// Spojení se serverem. Adresa a token přicházejí ze spárování.
import { server, token } from './sparovani'

export type NaKus = (kus: string) => void
export type NaPrepis = (text: string) => void

/** Chyba, kterou vrátil server/aplikace (ne síť) — nefrontovat, jen ohlásit. */
export class AplikacniChyba extends Error {}

const NECINNOST_MS = 30000

/** fetch se stráží nečinnosti: každý přijatý kus odklad prodlouží. */
async function ctiStream(
  odpoved: Response,
  naKus: NaKus,
  ctrl: AbortController,
  prodluz: () => void,
): Promise<string> {
  let cele = ''
  if (!odpoved.body) {
    cele = await odpoved.text()
    if (cele) naKus(cele)
    return cele
  }
  const ctecka = odpoved.body.getReader()
  const dekoder = new TextDecoder('utf-8')
  while (true) {
    const { done, value } = await ctecka.read()
    if (done) break
    prodluz()
    const t = dekoder.decode(value, { stream: true })
    if (t) { cele += t; naKus(t) }
  }
  const zbytek = dekoder.decode()
  if (zbytek) { cele += zbytek; naKus(zbytek) }
  void ctrl
  return cele
}

function strazceNecinnosti(): { ctrl: AbortController; prodluz: () => void; konec: () => void } {
  const ctrl = new AbortController()
  let budik = window.setTimeout(() => ctrl.abort(), NECINNOST_MS)
  const prodluz = () => {
    clearTimeout(budik)
    budik = window.setTimeout(() => ctrl.abort(), NECINNOST_MS)
  }
  const konec = () => clearTimeout(budik)
  return { ctrl, prodluz, konec }
}

/** Pošle hotový text dotazu (přepis proběhl živě v aplikaci). */
export async function poslatText(text: string, naKus: NaKus): Promise<void> {
  const s = strazceNecinnosti()
  try {
    const odpoved = await fetch(`${server()}/dotaz`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token()}`,
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: text,
      signal: s.ctrl.signal,
    })
    if (!odpoved.ok) throw new AplikacniChyba(`server ${odpoved.status}`)
    await ctiStream(odpoved, naKus, s.ctrl, s.prodluz)
  } finally { s.konec() }
}

/** Záloha: pošle nahrávku, server přepíše a odpoví. */
export async function poslatHlas(
  wav: Blob,
  naPrepis: NaPrepis,
  naKus: NaKus,
): Promise<void> {
  const s = strazceNecinnosti()
  try {
    const odpoved = await fetch(`${server()}/hlas`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token()}`,
        'Content-Type': 'audio/wav',
        'X-Format': 'nahravka.wav',
      },
      body: wav,
      signal: s.ctrl.signal,
    })
    if (!odpoved.ok) throw new AplikacniChyba(`server ${odpoved.status}`)

    let nahromadeno = ''
    let prepisHotov = false
    let chybaPrepisu: string | null = null
    await ctiStream(odpoved, (kus) => {
      if (prepisHotov) { naKus(kus); return }
      nahromadeno += kus
      const konec = nahromadeno.indexOf('\n')
      if (konec === -1) return
      const prvni = nahromadeno.slice(0, konec)
      const zbytek = nahromadeno.slice(konec + 1)
      prepisHotov = true
      try {
        const j = JSON.parse(prvni)
        if (j.chyba) { chybaPrepisu = String(j.chyba); return }
        naPrepis(j.prepis ?? '')
      } catch { /* neplatný první řádek — bereme jako text */ naKus(prvni + '\n') }
      if (zbytek) naKus(zbytek)
    }, s.ctrl, s.prodluz)
    if (chybaPrepisu) throw new AplikacniChyba(chybaPrepisu)
  } finally { s.konec() }
}

/** Zjistí, jestli server odpovídá (s krátkým timeoutem). */
export async function jeOnline(): Promise<boolean> {
  try {
    const r = await fetch(`${server()}/stav`, {
      headers: { 'Authorization': `Bearer ${token()}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    return r.ok
  } catch {
    return false
  }
}

/** Pošle rozpracovanou nahrávku a vrátí jen přepis (pro živý přepis). */
export async function poslatPrepis(wav: Blob): Promise<string> {
  const r = await fetch(`${server()}/prepis`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token()}`,
      'Content-Type': 'audio/wav',
      'X-Format': 'nahravka.wav',
    },
    body: wav,
    signal: AbortSignal.timeout(15000),
  })
  if (!r.ok) throw new Error(`server ${r.status}`)
  const j = await r.json()
  if (j.chyba) throw new Error(j.chyba)
  return j.prepis ?? ''
}
