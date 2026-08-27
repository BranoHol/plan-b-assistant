// Skládání textu pro displej brýlí (576 × 288, jedno písmo, zarovnání vlevo).
import { ZNAKU_NA_RADEK } from './config'

/** Zalomí text na řádky dané šířky (po slovech). */
export function zalom(text: string): string[] {
  const radky: string[] = []
  for (const odstavec of text.split('\n')) {
    if (!odstavec.trim()) { radky.push(''); continue }
    let radek = ''
    for (const slovo of odstavec.split(/\s+/)) {
      if (!radek) { radek = slovo; continue }
      if ((radek + ' ' + slovo).length <= ZNAKU_NA_RADEK) {
        radek += ' ' + slovo
      } else {
        radky.push(radek)
        radek = slovo
      }
    }
    if (radek) radky.push(radek)
  }
  return radky
}

/** Odsadí text mezerami zhruba na optický střed řádku. */
export function vycentruj(s: string): string {
  return ' '.repeat(Math.max(0, Math.floor((ZNAKU_NA_RADEK - s.length) / 2))) + s
}
