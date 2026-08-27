// Plan B Assistant — prémiová verze podle schválené studie.
// Tři zóny (hlavička / tělo / patička), nativní skrolování těla,
// živá slova ze Sonioxu (návrh A), kalibrováno 49 × 10.
import {
  waitForEvenAppBridge,
  TextContainerProperty,
  ImageContainerProperty,
  ImageRawDataUpdate,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  RebuildPageContainer,
  utf8ByteLength,
} from '@evenrealities/even_hub_sdk'
import { PRIRUSTKOVY_TEXT } from './config'
import { mountUi, vykresliParovani, setState, logLine } from './ui'
import { zacniSbirat, pridejRamec, hotovyWav, delkaSekund } from './zvuk'
import { zalom, vycentruj } from './displej'
import { poslatHlas, poslatText, jeOnline, AplikacniChyba } from './server'
import { ZivyPrepis } from './soniox'
import { logoPng, cernyPng } from './logo'
import manifest from '../app.json'
import {
  nactiSparovani, sparovano, sparuj, zrusSparovani, nactiNastaveni,
  server, sonioxKlic,
} from './sparovani'

// ── Události (čísla čteme přímo, ne přes enum ze SDK) ──────────
const KLIK = 0, DVOJKLIK = 3, PAD = 6, UKONCENI = 7
const PODRZENI = 9, PUSTENI = 10
const ZDROJ_PRSTEN = 2

type Rezim = 'setup' | 'ready' | 'listening' | 'thinking' | 'answer' | 'saved' | 'offline'

nactiSparovani()
mountUi({
  sparovano: sparovano(),
  server: server(),
  onPair: async (adresa, tok) => {
    const chyba = await sparuj(adresa, tok)
    if (chyba) return chyba
    online = true
    vykresliParovani(true, server())
    logLine('ok', `Spárováno se serverem ${server()}.`)
    void nactiNastaveni().then(() => {
      logLine(sonioxKlic() ? 'ok' : 'sys',
        sonioxKlic() ? 'Živý přepis povolen serverem.' : 'Živý přepis nedostupný — pojede záloha.')
    })
    nastav('ready', true)
    return null
  },
  onUnpair: () => {
    zrusSparovani()
    vykresliParovani(false, '')
    logLine('sys', 'Spárování zrušeno.')
    nastav('setup', true)
  },
})

// ── Stav ──────────────────────────────────────────────────────
let rezim: Rezim = 'ready'
let online = true
let nahravaOd = 0
let otazka = ''
let zivaFinalni = ''
let zivaRozpracovana = ''
let odpoved = ''
let posledniOdpoved = ''
let posledniOtazka = ''
let hlaska = ''
let frontaCeka: Blob | null = null
let blik = true
let generace = 0        // stoupá s každou novou otázkou; staré streamy se zahazují
let prepisovac: ZivyPrepis | null = null

const bridge = await waitForEvenAppBridge()
logLine('ok', 'Most k aplikaci Even navázán.')

// ── Kompozice podle mockupu: jeden rámeček přes celý displej,
//    uvnitř hlavička / tělo / patička oddělené linkami.
//    zOrderIndex: když ho má jeden, musí ho mít všichni (unikátní).
const ram = new TextContainerProperty({
  xPosition: 0, yPosition: 0, width: 576, height: 288,
  borderWidth: 2, borderColor: 12, borderRadius: 8, paddingLength: 2,
  containerID: 7, containerName: 'ram',
  content: ' ', isEventCapture: 0, zOrderIndex: 1,
})
const sepH = new TextContainerProperty({
  xPosition: 14, yPosition: 49, width: 548, height: 2,
  borderWidth: 1, borderColor: 2, borderRadius: 0, paddingLength: 0,
  containerID: 8, containerName: 'sepH',
  content: ' ', isEventCapture: 0, zOrderIndex: 4,
})
const sepP = new TextContainerProperty({
  xPosition: 14, yPosition: 241, width: 548, height: 2,
  borderWidth: 1, borderColor: 2, borderRadius: 0, paddingLength: 0,
  containerID: 9, containerName: 'sepP',
  content: ' ', isEventCapture: 0, zOrderIndex: 5,
})
const hlava = new TextContainerProperty({
  xPosition: 24, yPosition: 12, width: 540, height: 34,
  borderWidth: 0, borderColor: 0, paddingLength: 0,
  containerID: 2, containerName: 'hlava',
  content: ' ', textColor: 1, isEventCapture: 0, zOrderIndex: 6,
})
const telo = new TextContainerProperty({
  xPosition: 12, yPosition: 54, width: 552, height: 184,
  borderWidth: 0, borderColor: 0, paddingLength: 4,
  containerID: 1, containerName: 'telo',
  content: 'PLAN B\nstartuji...', isEventCapture: 1, zOrderIndex: 7,
})
const pataL = new TextContainerProperty({
  xPosition: 24, yPosition: 248, width: 330, height: 34,
  borderWidth: 0, borderColor: 0, paddingLength: 0,
  containerID: 3, containerName: 'pataL',
  content: ' ', textColor: 1, isEventCapture: 0, zOrderIndex: 8,
})
const pataR = new TextContainerProperty({
  xPosition: 432, yPosition: 248, width: 134, height: 34,
  borderWidth: 0, borderColor: 0, paddingLength: 0,
  containerID: 6, containerName: 'pataR',
  content: ' ', textColor: 1, isEventCapture: 0, zOrderIndex: 9,
})
// Logo: velké uprostřed těla (ready), malé v hlavičce (pulz při poslechu).
const logoStred = new ImageContainerProperty({
  xPosition: 252, yPosition: 110, width: 72, height: 72,
  containerID: 4, containerName: 'logoStred', zOrderIndex: 2,
})
const logoHlava = new ImageContainerProperty({
  xPosition: 534, yPosition: 17, width: 24, height: 24,
  containerID: 5, containerName: 'logoHlava', zOrderIndex: 3,
})

const VSECHNY_TEXTY = [ram, sepH, sepP, hlava, telo, pataL, pataR]
const VSECHNY_OBRAZKY = [logoStred, logoHlava]

const vysledek = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 9,
    textObject: VSECHNY_TEXTY,
    imageObject: VSECHNY_OBRAZKY,
  }),
)
if (vysledek !== 0) {
  const KODY: Record<number, string> = { 1: 'invalid', 2: 'oversize', 3: 'outOfMemory' }
  logLine('err', `Obrazovka selhala (kód ${vysledek} = ${KODY[vysledek] ?? '?'}), zkouším přestavbu…`)
  await new Promise(r => setTimeout(r, 600))
  try {
    await bridge.rebuildPageContainer(
      new RebuildPageContainer({
        containerTotalNum: 9,
        textObject: VSECHNY_TEXTY,
        imageObject: VSECHNY_OBRAZKY,
      }),
    )
    logLine('ok', 'Obrazovka vytvořena přestavbou (pozor: obrázky po ní nechodí).')
  } catch (e) { logLine('err', `Přestavba spadla: ${String(e)}`) }
} else {
  logLine('ok', `Stránka vytvořena (kód 0): rámeček + zóny + linky + loga.`)
}

// ── Obrázky: předkreslené PNG + sériové posílání ──────────────
let pngStred: Uint8Array, pngStredCerny: Uint8Array
let pngHlavaJasny: Uint8Array, pngHlavaTlumeny: Uint8Array, pngHlavaCerny: Uint8Array
const obrazkyPripraveny = (async () => {
  pngStred = await logoPng(72, 187)
  pngStredCerny = await cernyPng(72)
  pngHlavaJasny = await logoPng(24, 255)
  pngHlavaTlumeny = await logoPng(24, 110)
  pngHlavaCerny = await cernyPng(24)
})()

let obrazkovaFronta: Promise<unknown> = Promise.resolve()
const posledniObrazek: Record<number, Uint8Array | null> = { 4: null, 5: null }
function posliObrazek(id: number, jmeno: string, data: Uint8Array) {
  if (posledniObrazek[id] === data) return
  posledniObrazek[id] = data
  obrazkovaFronta = obrazkovaFronta.then(async () => {
    try {
      const vys = await bridge.updateImageRawData(
        new ImageRawDataUpdate({ containerID: id, containerName: jmeno, imageData: data }),
      )
      logLine('sys', `Obrázek ${jmeno}: výsledek ${JSON.stringify(vys)} (${data.length} B)`)
    } catch (e) { logLine('err', `Obrázek ${jmeno} spadl: ${String(e)}`) }
  })
}

function aktualizujLoga() {
  if (!pngStred) return
  posliObrazek(4, 'logoStred', rezim === 'ready' ? pngStred : pngStredCerny)
  if (rezim === 'listening') posliObrazek(5, 'logoHlava', blik ? pngHlavaJasny : pngHlavaTlumeny)
  else posliObrazek(5, 'logoHlava', pngHlavaCerny)
}

// ── Vykreslování (každá zóna zvlášť, mění se jen to, co se změnilo) ──
const posledniObsah: Record<number, string> = {}
let casovac: number | null = null

function stavovka(): string {
  return online ? '● online' : '○ offline'
}

const HLAVA_MAX = 44 // konci pred malym logem v pravem rohu
function zkratNaRadek(t: string): string {
  return t.length <= HLAVA_MAX ? t : t.slice(0, HLAVA_MAX - 1) + '...'
}

function obsahZon(): { hlava: string; telo: string; pataL: string; pataR: string } {
  switch (rezim) {
    case 'listening': {
      const s = Math.floor((Date.now() - nahravaOd) / 1000)
      const cas = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
      const ziva = (zivaFinalni + zivaRozpracovana).trim()
      let teloZiva: string
      if (ziva) {
        // Ukazujeme posledních 5 řádků, ať je vidět to, co právě říkáš.
        const r = zalom(ziva)
        const ocas = r.slice(-5)
        const posledni = ocas[ocas.length - 1] ?? ''
        teloZiva = ocas.join('\n') + (posledni.length < 46 ? '▌' : '\n▌')
      } else {
        teloZiva = '\n\n' + vycentruj('...')
      }
      const zbyva = MAX_NAHRAVKA_S - s
      return {
        hlava: zbyva <= 15 ? `listening  ${cas}  (${zbyva}s left)` : `listening  ${cas}`,
        telo: teloZiva,
        pataL: 'release = send', pataR: stavovka(),
      }
    }
    case 'thinking':
      return {
        hlava: zkratNaRadek(otazka ? `„${otazka}"` : ' '),
        telo: '\n\n' + vycentruj('▸ ▸ ▸'),
        pataL: ' ', pataR: 'thinking...',
      }
    case 'answer': {
      const dlouhe = zalom(odpoved).length > 6
      return {
        hlava: zkratNaRadek(otazka ? `„${otazka}"` : ' '),
        telo: odpoved || ' ',
        pataL: 'hold = new question', pataR: dlouhe ? '▲▼' : ' ',
      }
    }
    case 'saved':
      return { hlava: ' ', telo: '\n\n' + vycentruj(`● ${hlaska}`), pataL: ' ', pataR: 'tap = close' }
    case 'offline':
      return {
        hlava: ' ',
        telo: '\n\n' + vycentruj('○ Offline') + '\n' + vycentruj(hlaska),
        pataL: ' ', pataR: '○ offline',
      }
    case 'setup':
      return {
        hlava: `v${manifest.version}`,
        telo: '\n\n' + vycentruj('Open the Even app on your phone')
          + '\n' + vycentruj('and pair with your server'),
        pataL: ' ', pataR: 'not paired',
      }
    default:
      return {
        hlava: `v${manifest.version}`,
        telo: ' ',
        pataL: 'hold ring to talk', pataR: stavovka(),
      }
  }
}

async function zapisZonu(id: number, jmeno: string, obsah: string) {
  if (id === 6) obsah = obsah.trimEnd().padStart(11) // pataR k pravé hraně
  const stary = posledniObsah[id]
  if (stary === obsah) return
  posledniObsah[id] = obsah
  try {
    // Přírůstkově: když nový obsah jen prodlužuje starý (streamovaná odpověď),
    // pošleme pouze rozdíl s posunem — firmware pak neresetuje skrolování.
    if (id === 1 && PRIRUSTKOVY_TEXT !== 'vypnuto' && rezim === 'answer'
        && typeof stary === 'string' && stary.length > 1
        && obsah.length > stary.length && obsah.startsWith(stary)) {
      const rozdil = obsah.slice(stary.length)
      const bajty = PRIRUSTKOVY_TEXT === 'bajty'
      await bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          containerID: id, containerName: jmeno,
          contentOffset: bajty ? utf8ByteLength(stary) : stary.length,
          contentLength: bajty ? utf8ByteLength(rozdil) : rozdil.length,
          content: rozdil,
        }),
      )
      return
    }
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: id, containerName: jmeno, content: obsah }),
    )
  } catch (e) { logLine('err', `Zápis zóny ${jmeno} selhal: ${String(e)}`) }
}

let textovaFronta: Promise<unknown> = Promise.resolve()
function prekresli(hned = false) {
  const napis = () => {
    casovac = null
    textovaFronta = textovaFronta.then(async () => {
      const z = obsahZon()
      await zapisZonu(1, 'telo', z.telo)
      await zapisZonu(2, 'hlava', z.hlava)
      await zapisZonu(3, 'pataL', z.pataL)
      await zapisZonu(6, 'pataR', z.pataR)
      aktualizujLoga()
    })
  }
  if (hned) { if (casovac !== null) { clearTimeout(casovac); casovac = null } napis(); return }
  if (casovac !== null) return
  casovac = window.setTimeout(napis, 300)
}

function naTelefon() {
  setState([
    `Režim:    ${rezim}`,
    `Server:   ${online ? 'online' : 'offline'}`,
    `Stream:   ${prepisovac?.pripojeno ? 'živý přepis běží' : '—'}`,
    `Otázka:   ${otazka || (zivaFinalni + zivaRozpracovana) || '—'}`,
    `Ve frontě: ${frontaCeka ? 'ano' : 'ne'}`,
  ].join('\n'))
}

function nastav(novy: Rezim, hned = false) {
  rezim = novy
  naTelefon()
  prekresli(hned)
}

// ── Nahrávání: vysílačka + živá slova ─────────────────────────
// Strop délky: aplikace je na otázky, ne na nahrávání schůzek.
// Po vypršení se nahrávání samo ukončí a odešle.
const MAX_NAHRAVKA_S = 90
let tikTimer: number | null = null
let stropTimer: number | null = null

function zrusStrop() {
  if (stropTimer !== null) { clearTimeout(stropTimer); stropTimer = null }
}

function zacniNahravat() {
  if (rezim === 'listening') return
  generace++              // vše staré (streamy odpovědí) se od teď zahazuje
  otazka = ''; odpoved = ''; zivaFinalni = ''; zivaRozpracovana = ''
  zacniSbirat()               // WAV pojistka pro případ výpadku streamu
  nahravaOd = Date.now()
  blik = true

  const p = new ZivyPrepis((fin, roz) => {
    if (prepisovac !== p) return
    zivaFinalni = fin; zivaRozpracovana = roz
    if (rezim === 'listening') { prekresli(); naTelefon() }
  })
  prepisovac = p
  p.start().then(
    () => { if (prepisovac === p) logLine('ok', 'Živý přepis připojen.'); else p.zavri() },
    (e) => {
      p.zavri()
      if (prepisovac === p) {
        prepisovac = null
        logLine('sys', `Živý přepis nedostupný (${String(e?.message ?? e)}), pojede záloha.`)
      }
    },
  )

  bridge.audioControl(true)
  nastav('listening', true)
  logLine('ok', 'Poslouchám…')
  if (tikTimer === null) tikTimer = window.setInterval(() => {
    if (rezim === 'listening') { blik = !blik; prekresli(true) }
  }, 800)
  zrusStrop()
  stropTimer = window.setTimeout(() => {
    if (rezim !== 'listening') return
    logLine('sys', `Dosažen strop ${MAX_NAHRAVKA_S} s, odesílám.`)
    void ukonciNahravani()
  }, MAX_NAHRAVKA_S * 1000)
}

async function ukonciNahravani() {
  if (rezim !== 'listening') return
  bridge.audioControl(false)
  zrusStrop()
  if (tikTimer !== null) { clearInterval(tikTimer); tikTimer = null }

  const sekund = delkaSekund()
  if (sekund < 0.4) {
    prepisovac?.zavri(); prepisovac = null
    hlaska = 'too short'
    nastav('saved', true)
    window.setTimeout(() => { if (rezim === 'saved') nastav('ready') }, 1500)
    return
  }

  // Stav přepnout hned — ať displej nečeká na doznění streamu.
  const p = prepisovac
  prepisovac = null
  otazka = (zivaFinalni + zivaRozpracovana).trim()
  nastav('thinking', true)

  // 1) Preferovaná cesta: finální přepis ze streamu → text na server
  if (p?.pripojeno) {
    const text = await p.ukonci()
    p.zavri()
    if (text) {
      otazka = text
      logLine('ok', `Slyšel jsem: „${text}"`)
      nastav('thinking', true)
      await odesliText(generace, text)
      return
    }
  }
  p?.zavri()

  // 2) Záloha: celá nahrávka na server (přepis přes Groq tam)
  logLine('sys', 'Jedu záložní cestou přes nahrávku.')
  const wav = hotovyWav()
  await odesliWav(generace, wav)
}

async function odesliText(g: number, text: string) {
  try {
    await poslatText(text, (kus) => prijmiKus(g, kus))
    dokonciOdpoved(g)
  } catch (e) {
    zpracujSelhani(g, e, null)
  }
}

async function odesliWav(g: number, wav: Blob) {
  try {
    await poslatHlas(
      wav,
      (t) => {
        if (g !== generace) return
        otazka = t; online = true
        logLine('ok', `Slyšel jsem: „${t}"`)
        nastav('thinking', true)
      },
      (kus) => prijmiKus(g, kus),
    )
    dokonciOdpoved(g)
  } catch (e) {
    zpracujSelhani(g, e, wav)
  }
}

function prijmiKus(g: number, kus: string) {
  if (g !== generace) return   // stará odpověď — zahodit
  odpoved += kus
  if (rezim !== 'answer') nastav('answer', true)
  else prekresli()
}

function dokonciOdpoved(g: number) {
  if (g !== generace) return
  posledniOdpoved = odpoved
  posledniOtazka = otazka
  logLine('ok', 'Odpověď kompletní.')
  naTelefon()
}

function zpracujSelhani(g: number, e: unknown, wav: Blob | null) {
  const zprava = String((e as Error)?.message || e)
  logLine('err', `Odeslání selhalo: ${zprava}`)
  if (g !== generace) return   // selhal starý stream — nový už běží, nerušit
  if (e instanceof AplikacniChyba) {
    // Server odpověděl, ale odmítl — nefrontovat, jen ohlásit.
    hlaska = 'server error - try again'
    nastav('saved', true)
    window.setTimeout(() => { if (rezim === 'saved') nastav('ready') }, 2500)
    return
  }
  online = false
  if (wav) frontaCeka = wav    // frontujeme jen skutečnou nahrávku
  hlaska = wav ? 'note saved - will send later' : 'connection lost'
  nastav('offline', true)
}

// Odložené nahrávky — zkoušíme, dokud se spojení nevrátí.
let retryBezi = false
window.setInterval(async () => {
  if (!sparovano() || retryBezi || !frontaCeka) return
  if (rezim !== 'ready' && rezim !== 'offline') return  // nikdy nerušit práci
  retryBezi = true
  try {
    if (!(await jeOnline())) return
    const wav = frontaCeka
    frontaCeka = null
    if (!wav) return
    logLine('sys', 'Spojení je zpátky, posílám odloženou nahrávku.')
    generace++
    otazka = ''; odpoved = ''
    nastav('thinking', true)
    await odesliWav(generace, wav)
  } finally { retryBezi = false }
}, 15000)

// Kontrola spojení
async function zkontrolujSpojeni() {
  if (!sparovano()) return
  const byl = online
  online = await jeOnline()
  if (byl !== online) {
    logLine(online ? 'ok' : 'err', online ? 'Server je dostupný.' : 'Server nedostupný.')
    prekresli()
  }
  naTelefon()
}
void zkontrolujSpojeni()
window.setInterval(() => void zkontrolujSpojeni(), 20000)

// ── Události ──────────────────────────────────────────────────
// KLIK má číslo 0 a protokol nulové hodnoty vypouští — výchozí hodnotu
// dosazujeme až UVNITŘ kontroly obálky, jinak by každý rámec zvuku
// vypadal jako klik. Swipe neřešíme — tělo skroluje nativně firmware.
function typUdalosti(obalka?: { eventType?: number }): number | null {
  if (!obalka) return null
  return obalka.eventType ?? 0
}

let ukliznuto = false
function uklid() {
  if (ukliznuto) return
  ukliznuto = true
  bridge.audioControl(false)
  zrusStrop()
  prepisovac?.zavri()
  odhlasit()
  logLine('sys', 'Aplikace končí, uklizeno.')
}

const odhlasit = bridge.onEvenHubEvent((event: any) => {
  const pcm = event.audioEvent?.audioPcm
  if (pcm) {
    if (rezim === 'listening') {
      const data = pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm)
      pridejRamec(data)
      prepisovac?.posliZvuk(data)
    }
    return
  }

  const sysTyp = typUdalosti(event.sysEvent)
  const textTyp = typUdalosti(event.textEvent)
  const typ = sysTyp ?? textTyp
  const zdroj = event.sysEvent?.eventSource ?? event.textEvent?.eventSource
  if (typ === null) return

  if (typ === DVOJKLIK) { uklid(); bridge.shutDownPageContainer(1); return }
  if (rezim === 'setup') {
    if (typ === UKONCENI || typ === PAD) uklid()
    return
  }

  if (typ === PODRZENI) {
    if (zdroj === undefined || zdroj === ZDROJ_PRSTEN || zdroj === 1 || zdroj === 3) zacniNahravat()
    return
  }
  if (typ === PUSTENI) { void ukonciNahravani(); return }

  if (typ === KLIK) {
    if (rezim === 'thinking') {
      // nouzový únik: zrušit čekání na odpověď
      generace++
      logLine('sys', 'Dotaz zrušen klikem.')
      nastav('ready', true)
      return
    }
    if (rezim === 'listening') {
      // klik při poslechu = zrušit
      bridge.audioControl(false)
      zrusStrop()
      if (tikTimer !== null) { clearInterval(tikTimer); tikTimer = null }
      prepisovac?.zavri(); prepisovac = null
      logLine('sys', 'Nahrávání zrušeno.')
      nastav('ready', true)
      return
    }
    if (rezim === 'answer' || rezim === 'saved' || rezim === 'offline') { nastav('ready', true); return }
    if (rezim === 'ready' && posledniOdpoved) {
      // klik v klidu = vrátit poslední odpověď
      otazka = posledniOtazka
      odpoved = posledniOdpoved
      nastav('answer', true)
    }
    return
  }
  if (typ === UKONCENI || typ === PAD) { uklid(); return }
})

window.addEventListener('beforeunload', uklid)

if (sparovano()) {
  logLine('ok', `Spárováno se serverem ${server()}.`)
  void nactiNastaveni().then(() => {
    logLine(sonioxKlic() ? 'ok' : 'sys',
      sonioxKlic() ? 'Živý přepis povolen serverem.' : 'Živý přepis nedostupný — pojede záloha.')
  })
  logLine('ok', 'Připraveno. Podrž prsten a mluv.')
  nastav('ready', true)
} else {
  logLine('sys', 'Nespárováno — zadej adresu serveru a token výše.')
  nastav('setup', true)
}
void obrazkyPripraveny.then(() => { aktualizujLoga(); logLine('ok', 'Logo vykresleno.') })
