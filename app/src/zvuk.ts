// Sbírání zvuku z brýlí a jeho zabalení do WAV.
// Brýle posílají PCM 16 kHz, mono, 16 bitů.

const VZORKOVACI_FREKVENCE = 16000

let ramce: Uint8Array[] = []
let bajtu = 0

export function zacniSbirat() {
  ramce = []
  bajtu = 0
}

export function pridejRamec(pcm: any) {
  if (!pcm) return
  const data = pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm)
  ramce.push(data)
  bajtu += data.length
}

export function kolikBajtu() {
  return bajtu
}

export function delkaSekund() {
  // 16 bitů = 2 bajty na vzorek
  return bajtu / (VZORKOVACI_FREKVENCE * 2)
}

/** Slepí posbírané rámce a přidá hlavičku WAV. */
export function hotovyWav(): Blob {
  const zvuk = new Uint8Array(bajtu)
  let pozice = 0
  for (const r of ramce) {
    zvuk.set(r, pozice)
    pozice += r.length
  }

  const hlavicka = new ArrayBuffer(44)
  const v = new DataView(hlavicka)
  const zapisText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) v.setUint8(offset + i, text.charCodeAt(i))
  }

  zapisText(0, 'RIFF')
  v.setUint32(4, 36 + bajtu, true)
  zapisText(8, 'WAVE')
  zapisText(12, 'fmt ')
  v.setUint32(16, 16, true)          // délka fmt bloku
  v.setUint16(20, 1, true)           // PCM
  v.setUint16(22, 1, true)           // mono
  v.setUint32(24, VZORKOVACI_FREKVENCE, true)
  v.setUint32(28, VZORKOVACI_FREKVENCE * 2, true) // bajtů za sekundu
  v.setUint16(32, 2, true)           // zarovnání bloku
  v.setUint16(34, 16, true)          // bitů na vzorek
  zapisText(36, 'data')
  v.setUint32(40, bajtu, true)

  return new Blob([hlavicka, zvuk], { type: 'audio/wav' })
}
