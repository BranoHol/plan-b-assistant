// Logo „jiskra v prstenu" kreslené na canvas a balené do PNG.
// Brýle si PNG samy převedou do 16 odstínů zelené.

function kresli(size: number, jas: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, size, size)

  const barva = `rgb(${jas},${jas},${jas})`
  const s = size / 24 // měřítko vůči návrhu ve viewBoxu 24
  ctx.strokeStyle = barva
  ctx.fillStyle = barva
  ctx.lineWidth = Math.max(1.5, 1.8 * s)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Otevřený prsten: kruh r9 s mezerou vpravo nahoře (jako dasharray 43/13.5).
  // Obvod 56.5; mezera 13.5 => úhel mezery ~86°, střed mezery v -45°.
  const cx = 12 * s, cy = 12 * s, r = 9 * s
  const mezera = (13.5 / 56.5) * Math.PI * 2
  const stredMezery = -Math.PI / 4
  ctx.beginPath()
  ctx.arc(cx, cy, r, stredMezery + mezera / 2, stredMezery - mezera / 2 + Math.PI * 2)
  ctx.stroke()

  // Písmeno B uprostřed.
  ctx.font = `bold ${Math.round(12 * s)}px Menlo, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('B', cx, cy + 0.5 * s)

  // Jiskra v mezeře (čtyřcípá, střed 19.4/5.0, r 2.6).
  const jx = 19.4 * s, jy = 5.0 * s, jr = 2.6 * s, q = jr * 0.29
  ctx.beginPath()
  ctx.moveTo(jx, jy - jr)
  ctx.lineTo(jx + q, jy - q); ctx.lineTo(jx + jr, jy)
  ctx.lineTo(jx + q, jy + q); ctx.lineTo(jx, jy + jr)
  ctx.lineTo(jx - q, jy + q); ctx.lineTo(jx - jr, jy)
  ctx.lineTo(jx - q, jy - q); ctx.closePath()
  ctx.fill()
  return c
}

function doPng(c: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    c.toBlob(async (b) => {
      if (!b) { reject(new Error('toBlob selhal')); return }
      resolve(new Uint8Array(await b.arrayBuffer()))
    }, 'image/png')
  })
}

export function logoPng(size: number, jas = 255): Promise<Uint8Array> {
  return doPng(kresli(size, jas))
}

export function cernyPng(size: number): Promise<Uint8Array> {
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, size, size)
  return doPng(c)
}
