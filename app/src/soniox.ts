// Živý český přepis přes Soniox — slova přicházejí, jak mluvíš.
import { sonioxKlic, slovnik } from './sparovani'

export type NaZivaSlova = (finalni: string, rozpracovane: string) => void

export class ZivyPrepis {
  private ws: WebSocket | null = null
  private finalni = ''
  private nefinalni = ''
  private naSlova: NaZivaSlova
  private hotovoResolve: ((text: string) => void) | null = null
  private zavreno = false
  pripojeno = false

  constructor(naSlova: NaZivaSlova) {
    this.naSlova = naSlova
  }

  /** Otevře spojení a pošle konfiguraci. Selže-li, voláme záložní cestu. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!sonioxKlic()) { reject(new Error('bez klíče živého přepisu')); return }
      let otevreno = false
      try {
        this.ws = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket')
      } catch (e) { reject(e); return }
      this.ws.binaryType = 'arraybuffer'

      const budik = setTimeout(() => {
        if (!otevreno) { try { this.ws?.close() } catch { /* nic */ } ; reject(new Error('soniox timeout')) }
      }, 4000)

      this.ws.addEventListener('open', () => {
        otevreno = true
        clearTimeout(budik)
        this.ws!.send(JSON.stringify({
          api_key: sonioxKlic(),
          model: 'stt-rt-v5',
          audio_format: 'pcm_s16le',
          sample_rate: 16000,
          num_channels: 1,
          language_hints: ['cs'],
          ...(slovnik().length ? { context: { terms: slovnik() } } : {}),
        }))
        this.pripojeno = true
        resolve()
      })
      this.ws.addEventListener('message', (ev) => this.zprava(ev))
      this.ws.addEventListener('error', () => {
        this.pripojeno = false
        if (!otevreno) { clearTimeout(budik); reject(new Error('soniox spojení selhalo')) }
      })
      this.ws.addEventListener('close', () => { this.pripojeno = false })
    })
  }

  private zprava(ev: MessageEvent) {
    if (this.zavreno) return
    let d: any
    try { d = JSON.parse(typeof ev.data === 'string' ? ev.data : '') } catch { return }
    if (!d) return
    if (d.error_code) { this.pripojeno = false; return }
    if (d.tokens?.length) {
      // Nefinální hypotézy se každou zprávou nahrazují; finální přibývají.
      this.nefinalni = ''
      for (const t of d.tokens) {
        if (t.is_final) this.finalni += t.text
        else this.nefinalni += t.text
      }
      this.naSlova(this.finalni, this.nefinalni)
    }
    if (d.finished && this.hotovoResolve) {
      this.hotovoResolve((this.finalni + this.nefinalni).trim())
      this.hotovoResolve = null
    }
  }

  posliZvuk(pcm: Uint8Array) {
    if (this.zavreno) return
    if (this.pripojeno && this.ws?.readyState === WebSocket.OPEN) {
      try { this.ws.send(pcm) } catch { this.pripojeno = false }
    }
  }

  /** Oznámí konec zvuku a vrátí finální přepis (s pojistkou 3 s). */
  ukonci(): Promise<string> {
    return new Promise((resolve) => {
      const dosavadni = () => (this.finalni + this.nefinalni).trim()
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { resolve(dosavadni()); return }
      this.hotovoResolve = resolve
      try { this.ws.send(new Uint8Array(0)) } catch {
        this.hotovoResolve = null; resolve(dosavadni()); return
      }
      setTimeout(() => {
        if (this.hotovoResolve) { this.hotovoResolve = null; resolve(dosavadni()) }
      }, 3000)
    })
  }

  zavri() {
    this.zavreno = true
    try { this.ws?.close() } catch { /* nic */ }
    this.ws = null
    this.pripojeno = false
  }
}
