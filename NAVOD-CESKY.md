# Plan B Assistant — česky, pro netechnické

Tenhle soubor je pro tebe. Anglické `README.md` je pro ostatní.

## Co je v téhle složce

- `README.md` — hlavní návod, který uvidí lidé na GitHubu (anglicky)
- `LICENSE` — licence MIT: kdokoli si to smí použít i upravit, ale bez záruk
- `server/` — všechno, co běží na serveru
  - `install.sh` — instalační skript, jeden příkaz na čistém serveru
  - `mostek.py` — most mezi brýlemi a Claudem
  - `prepis.py` — přepis hlasu přes Groq
  - `CLAUDE.md.example` — vzorové instrukce pro asistenta (bez tvých dat)
  - `pamet/` — prázdné šablony paměti (bez tvých dat)
- `app/` — zdrojový kód aplikace do brýlí
- `docs/` — zásady soukromí a podmínky užití jako webové stránky

## Co tady NENÍ a nikdy nesmí být

- tvoje paměť (projekty, lidé, kontext) — ta žije jen na tvém serveru
- tokeny a API klíče
- soubor `KLICE-A-ADRESY.txt`
- `slovnik.txt` se jmény tvojí rodiny a kolegů

Tahle složka, kterou spolu nahráváme na GitHub, žádné z těchhle věcí neobsahuje — je to prověřeno. Soubor `.gitignore` navíc hlídá budoucnost: když si na serveru přes `git` budeš stahovat aktualizace, zůstanou tvoje vlastní soubory (token, klíče, paměť) nedotčené a nikdy se samy nenahrají zpátky.

## Jak se to dostane na GitHub

Repozitář `plan-b-assistant` sis už založil. Samotné nahrání souborů (přesně
ve správné struktuře složek, nic navíc, nic chybí) za tebe udělám já — potřebuju
k tomu jen dočasný přístupový klíč (token), který mi vytvoříš a vložíš do okna.
Postup ti dám krok po kroku přímo v konverzaci. Po nahrání ten klíč hned zrušíš
(taky ti řeknu jak) — dál už ho nikdo nepotřebuje.

Až budou soubory nahrané, zapneme ještě webové stránky pro právní dokumenty
(zásady soukromí a podmínky užití), aby měly svoji stálou adresu:

1. V repozitáři **Settings** → vlevo **Pages**.
2. U „Source" vyber **Deploy from a branch**, větev `main`, složka `/docs`.
3. **Save**. Za pár minut budou stránky na adrese:
   `https://branohol.github.io/plan-b-assistant/privacy.html`
   `https://branohol.github.io/plan-b-assistant/terms.html`

Tyhle dvě adresy pak dáme do obchodu i do aplikace místo těch dočasných.

## Až budeš chtít něco změnit

Soubory se dají editovat přímo na GitHubu — otevřeš soubor, klikneš na tužku,
upravíš, dole **Commit changes**. Nebo mi řekni a připravím ti novou verzi.
