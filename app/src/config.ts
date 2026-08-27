// Nastavení aplikace. Žádná tajemství — adresa serveru a token se zadávají
// při párování na telefonu (viz sparovani.ts), klíč živého přepisu vydává server.

// Kolik znaků se vejde na řádek a kolik řádků na stránku.
export const ZNAKU_NA_RADEK = 47
export const RADKU_NA_STRANKU = 6

// Přírůstkové psaní odpovědi (experiment s firmwarem):
// 'bajty'  = posun v UTF-8 bajtech, 'znaky' = posun ve znacích,
// 'vypnuto' = vždy přepsat celý text (původní chování).
export const PRIRUSTKOVY_TEXT: 'bajty' | 'znaky' | 'vypnuto' = 'vypnuto'
