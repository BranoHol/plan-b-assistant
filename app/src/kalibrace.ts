// Kalibrační obrazovka: změří, kolik znaků a řádků se REÁLNĚ vejde
// do rámečku prémiového layoutu (border 2, padding 10).
import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  RebuildPageContainer,
} from '@evenrealities/even_hub_sdk'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div style="padding:24px;font:15px/1.5 -apple-system,sans-serif;color:#E5E5E5;background:#232323;min-height:100vh">
    <h1 style="font-size:17px">Kalibrace displeje</h1>
    <p>V brýlích teď vidíš pravítko. Přečti mi dvě čísla:</p>
    <p><b>1)</b> Jaký je ÚPLNĚ POSLEDNÍ znak na PRVNÍM řádku, než text přeteče
    na další? Písmena značí desítky: A=10, B=20, C=30, D=40, E=50.
    Např. „C a za ním 1 2 3" = 33.</p>
    <p><b>2)</b> BEZ posouvání: poslední R-číslo, které je celé vidět (R2–R16).</p>
  </div>`

const bridge = await waitForEvenAppBridge()

// Horni pravitko: desitky + jednotky, pak ocislovane radky
// Jedno dlouhe pravitko bez mezer: pismeno = konec desitky.
// A=10, B=20, C=30, D=40, E=50, F=60, G=70.
const radky = [
  '123456789A123456789B123456789C123456789D123456789E123456789F123456789G',
]
for (let i = 2; i <= 16; i++) radky.push(`R${i}`)

const kontejner = new TextContainerProperty({
  xPosition: 0, yPosition: 0, width: 576, height: 288,
  borderWidth: 2, borderColor: 5, borderRadius: 8, paddingLength: 10,
  containerID: 1, containerName: 'kal',
  content: radky.join('\n'),
  isEventCapture: 1,
})

const v = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({ containerTotalNum: 1, textObject: [kontejner] }),
)
if (v !== 0) {
  await new Promise(r => setTimeout(r, 600))
  try {
    await bridge.rebuildPageContainer(
      new RebuildPageContainer({ containerTotalNum: 1, textObject: [kontejner] }),
    )
  } catch { /* nic */ }
}
