// Rozhraní na telefonu — párování se serverem, stav a diagnostika.
// Produktové texty anglicky (obchod), diagnostika je skrytá sekce.

export interface UiVolby {
  sparovano: boolean
  server: string
  onPair: (adresa: string, token: string) => Promise<string | null>
  onUnpair: () => void
}

let logEl: HTMLDivElement
let stateEl: HTMLDivElement
let parovaniEl: HTMLDivElement
let volby: UiVolby

export function mountUi(v: UiVolby) {
  volby = v
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = `
    <div class="wrap">
      <h1>Plan B Assistant</h1>
      <div id="pairing"></div>
      <div id="state" class="state">Starting…</div>
      <div class="hint">
        <b>Hold the ring</b> and talk, <b>release</b> to send.
        <b>Swipe</b> scrolls the answer, <b>tap</b> closes it,
        double-tap quits the app.
      </div>
      <details class="diag">
        <summary>Diagnostics</summary>
        <div id="log" class="log"></div>
      </details>
    </div>
  `
  stateEl = app.querySelector<HTMLDivElement>('#state')!
  logEl = app.querySelector<HTMLDivElement>('#log')!
  parovaniEl = app.querySelector<HTMLDivElement>('#pairing')!
  injectStyles()
  vykresliParovani(v.sparovano, v.server)
}

/** Překreslí kartu párování podle stavu. */
export function vykresliParovani(sparovano: boolean, server: string) {
  if (!parovaniEl) return
  if (sparovano) {
    parovaniEl.innerHTML = `
      <div class="card paired">
        <div class="row2">
          <span class="ok-dot"></span>
          <span class="srv"></span>
          <button id="unpair" class="ghost">Unpair</button>
        </div>
      </div>
    `
    parovaniEl.querySelector<HTMLSpanElement>('.srv')!.textContent =
      server.replace(/^https?:\/\//, '')
    const btn = parovaniEl.querySelector<HTMLButtonElement>('#unpair')!
    let potvrzeni = false
    btn.addEventListener('click', () => {
      if (!potvrzeni) { potvrzeni = true; btn.textContent = 'Tap again to unpair'; return }
      volby.onUnpair()
    })
    return
  }
  parovaniEl.innerHTML = `
    <div class="card notice">
      <div class="card-title">Before you start</div>
      <ul class="rules">
        <li>The microphone runs only while you hold the ring. Recording other
          people without their knowledge is illegal in many places — this app
          is for your own questions.</li>
        <li>Do not read the display while driving or cycling.</li>
        <li>Answers can be wrong. Do not rely on them for medical, legal or
          financial decisions.</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-title">Pair with your server</div>
      <div class="card-sub">Enter the address and access token of your
        Plan&nbsp;B server. You get both when you install the server —
        see the project page for setup instructions.</div>
      <label>Server address
        <input id="in-server" type="url" inputmode="url" autocapitalize="none"
               autocorrect="off" spellcheck="false" placeholder="your-ip.sslip.io">
        <span class="field-note">Only enter a server you control. Whoever runs
          it can read everything you send.</span>
      </label>
      <label>Access token
        <input id="in-token" type="password" autocapitalize="none"
               autocorrect="off" spellcheck="false" placeholder="paste your token">
      </label>
      <label class="check">
        <input id="in-agree" type="checkbox">
        <span>I have read the points above and accept the
          <a href="https://claude.ai/code/artifact/008755e2-f10e-41d3-b345-53b3df588564" target="_blank" rel="noopener">Terms of Use</a>
          and <a href="https://claude.ai/code/artifact/ba7fa941-8aac-4ec1-97f0-edcde2149d9f" target="_blank" rel="noopener">Privacy Policy</a>.</span>
      </label>
      <button id="pair" class="primary" disabled>Pair</button>
      <div id="pair-err" class="err-msg"></div>
    </div>
  `
  const btn = parovaniEl.querySelector<HTMLButtonElement>('#pair')!
  const chybaEl = parovaniEl.querySelector<HTMLDivElement>('#pair-err')!
  const souhlas = parovaniEl.querySelector<HTMLInputElement>('#in-agree')!
  souhlas.addEventListener('change', () => { btn.disabled = !souhlas.checked })
  btn.addEventListener('click', async () => {
    if (!souhlas.checked) return
    const adresa = parovaniEl.querySelector<HTMLInputElement>('#in-server')!.value
    const token = parovaniEl.querySelector<HTMLInputElement>('#in-token')!.value
    btn.disabled = true
    btn.textContent = 'Checking…'
    chybaEl.textContent = ''
    const chyba = await volby.onPair(adresa, token)
    if (chyba) {
      btn.disabled = !souhlas.checked
      btn.textContent = 'Pair'
      chybaEl.textContent = chyba
    }
  })
}

export function setState(text: string) {
  if (stateEl) stateEl.textContent = text
}

export function logLine(kind: 'ev' | 'sys' | 'err' | 'ok', text: string) {
  if (!logEl) return
  const row = document.createElement('div')
  row.className = `row ${kind}`
  const t = new Date().toLocaleTimeString('cs-CZ', { hour12: false })
  row.innerHTML = `<span class="t">${t}</span><span class="m"></span>`
  row.querySelector<HTMLSpanElement>('.m')!.textContent = text
  logEl.prepend(row)
  while (logEl.childElementCount > 300) logEl.lastElementChild!.remove()
}

function injectStyles() {
  const css = `
    :root { color-scheme: dark; }
    html, body { margin:0; height:100%; background:#232323; color:#E5E5E5;
      font:15px/1.45 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      touch-action:manipulation; -webkit-text-size-adjust:100%; overscroll-behavior:none; }
    .wrap { padding:20px 16px 40px; max-width:640px; margin:0 auto; }
    h1 { font-size:17px; font-weight:600; margin:0 0 12px; letter-spacing:.02em; }
    .card { background:#2E2E2E; border:1px solid #3E3E3E; border-radius:10px;
      padding:14px; margin:0 0 12px; }
    .card-title { font-size:15px; font-weight:600; margin-bottom:4px; }
    .card-sub { font-size:13px; color:#9A9A9A; line-height:1.5; margin-bottom:12px; }
    label { display:block; font-size:13px; color:#9A9A9A; margin:0 0 10px; }
    input { display:block; width:100%; box-sizing:border-box; margin-top:4px;
      background:#232323; color:#E5E5E5; border:1px solid #3E3E3E; border-radius:8px;
      padding:10px 12px; font-size:15px;
      font-family:ui-monospace,'SF Mono',Menlo,monospace; }
    input:focus { outline:none; border-color:#7B7B7B; }
    button.primary { width:100%; background:#E5E5E5; color:#232323; border:none;
      border-radius:8px; padding:11px; font-size:15px; font-weight:600; margin-top:2px; }
    button.primary:disabled { opacity:.6; }
    button.ghost { background:none; border:1px solid #3E3E3E; color:#9A9A9A;
      border-radius:8px; padding:6px 10px; font-size:13px; margin-left:auto; }
    .card.notice { background:none; border-color:#3E3E3E; }
    ul.rules { margin:0; padding-left:1.1rem; display:flex; flex-direction:column;
      gap:8px; font-size:13px; color:#9A9A9A; line-height:1.5; }
    .field-note { display:block; margin-top:6px; font-size:12px; color:#7B7B7B;
      line-height:1.45; }
    label.check { display:flex; gap:10px; align-items:flex-start; font-size:13px;
      color:#9A9A9A; margin-bottom:14px; }
    label.check input { width:20px; height:20px; margin:1px 0 0; flex:none; accent-color:#E5E5E5; }
    label.check a { color:#E5E5E5; }
    .err-msg { color:#FF453A; font-size:13px; margin-top:8px; min-height:1em; }
    .card.paired { padding:10px 14px; }
    .row2 { display:flex; align-items:center; gap:8px; }
    .ok-dot { width:8px; height:8px; border-radius:50%; background:#3CFA44; flex:none; }
    .srv { font-size:13.5px; font-family:ui-monospace,'SF Mono',Menlo,monospace;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .state { background:#2E2E2E; border:1px solid #3E3E3E; border-radius:10px;
      padding:12px 14px; font-size:14px; white-space:pre-wrap; line-height:1.5;
      font-family:ui-monospace,'SF Mono',Menlo,monospace; }
    .hint { font-size:13px; color:#9A9A9A; margin:12px 0 16px; line-height:1.5; }
    .hint b { color:#E5E5E5; font-weight:600; }
    .diag summary { font-size:13px; color:#7B7B7B; cursor:pointer; margin-bottom:8px; }
    .log { display:flex; flex-direction:column; gap:1px; background:#3E3E3E;
      border:1px solid #3E3E3E; border-radius:10px; overflow:hidden; }
    .row { display:grid; grid-template-columns:74px 1fr; gap:10px;
      background:#232323; padding:7px 12px; font-size:12.5px;
      font-family:ui-monospace,'SF Mono',Menlo,monospace; }
    .row .t { color:#7B7B7B; }
    .row .m { white-space:pre-wrap; word-break:break-word; }
    .row.ev  .m { color:#3CFA44; }
    .row.sys .m { color:#7FB0FF; }
    .row.err .m { color:#FF453A; }
    .row.ok  .m { color:#E5E5E5; }
  `
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
}
