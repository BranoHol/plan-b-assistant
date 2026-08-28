#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
mostek.py — drží jeden teplý Claude proces a zpřístupňuje ho přes HTTP.
Přepracováno po noční revizi (zámky, otrava fronty, restarty, limity).

Endpointy (poslouchá jen na 127.0.0.1:8080; auth a CORS řeší Caddy):
  POST /dotaz    tělo = text dotazu           -> streamuje odpověď (chunked)
  POST /hlas     tělo = WAV                   -> 1. řádek JSON {prepis}, pak odpověď
  POST /prepis   tělo = WAV                   -> JSON {prepis} (jen přepis)
  GET  /stav     -> JSON
  POST /restart  -> restart Claude procesu

Vnitrni hlasky pro uzivatele jsou ANGLICKY a v hranatych zavorkach —
aplikace v brylich je podle toho pozna a vykresli je jinak nez odpoved.
Starsi ceske varianty aplikace porad zna, takze starsi server nerozbije.
"""
import json, os, queue, subprocess, sys, threading, time, signal, unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import prepis
except Exception as _e:
    prepis = None
    print("varovani: prepis.py se nenacetl:", _e)

PRACOVNI = "/home/asistent/agent"
PORT = 8080
LOG = "/home/asistent/agent/mostek.log"
MAX_TELO = 30_000_000        # 30 MB strop na tělo požadavku
MAX_LOG = 5_000_000
# Jak dlouho po odpadnutí klienta cekame, nez turn dobehne. Zamek
# drzime az do te doby, takze dalsi dotaz ceka — proto strop.
# Dvacet vteřin: bezna odpoved dobehne za jednotky vterin, a horsi
# pripad tim zustane pod tim, co stal restart s nactenim pameti driv.
# Kdyz to nestihne, radeji restart nez blokovat uzivatele.
DOCTENI_S = 20

NASTROJE = ",".join([
    "Read", "Glob", "Grep", "Write", "Edit",
    "WebSearch", "WebFetch",
    "mcp__claude_ai_Gmail__search_threads",
    "mcp__claude_ai_Gmail__get_thread",
    "mcp__claude_ai_Gmail__get_message",
    "mcp__claude_ai_Gmail__list_labels",
    "mcp__claude_ai_Google_Calendar__list_events",
    "mcp__claude_ai_Google_Calendar__list_calendars",
    "mcp__claude_ai_Google_Calendar__search_events",
    "mcp__claude_ai_Exa__web_search_exa",
    "mcp__claude_ai_Exa__web_fetch_exa",
    # Akce, které něco mění — smí až po výslovném potvrzení (viz CLAUDE.md).
    "mcp__claude_ai_Gmail__create_draft",
    "mcp__claude_ai_Google_Calendar__create_event",
    "mcp__claude_ai_Google_Calendar__update_event",
])

NAKRMENI = (
    "Startujes jako hlasova sluzba pro bryle. Precti si ted CELOU pamet: "
    "soubory v ~/agent/pamet/ vcetne podslozky projekty/. "
    "Drz si to v hlave pro dalsi dotazy — uz je nebudes cist znovu. "
    "Az to budes mit, odpovez jen: PRIPRAVEN."
)


def _cti_soubor(cesta):
    try:
        with open(cesta) as f:
            return f.read().strip()
    except OSError:
        return ""


def log(*a):
    zprava = f"[{time.strftime('%H:%M:%S')}] " + " ".join(str(x) for x in a)
    print(zprava, flush=True)
    try:
        if os.path.exists(LOG) and os.path.getsize(LOG) > MAX_LOG:
            os.replace(LOG, LOG + ".1")
        with open(LOG, "a") as f:
            f.write(zprava + "\n")
    except Exception:
        pass


class Claude:
    """Jeden dlouhoběžící Claude proces. Všechna práce s ním jde přes zámek."""

    def __init__(self):
        self.zamek = threading.Lock()
        self.p = None
        self.fronta = None
        self.gen = 0                 # generace procesu
        self.nakrmeno = False
        self.start_cas = 0
        self.pocet_dotazu = 0
        with self.zamek:
            self._nastartuj_nolock()

    # ---------- životní cyklus (jen pod zámkem) ----------
    def _nastartuj_nolock(self):
        self._ukonci_nolock()
        cmd = ["claude", "-p",
               "--input-format", "stream-json",
               "--output-format", "stream-json",
               "--include-partial-messages",
               "--verbose",
               "--allowedTools", NASTROJE]
        log(f"startuji Claude (gen {self.gen + 1})")
        self.gen += 1
        self.p = subprocess.Popen(
            cmd, cwd=PRACOVNI, text=True, bufsize=1,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.fronta = queue.Queue()
        self.nakrmeno = False
        self.start_cas = time.time()
        self.pocet_dotazu = 0

        # Čtecí vlákna si frontu i proces ZACHYTÍ lokálně — stará vlákna
        # po restartu nikdy nesypou do nové fronty.
        p, fronta = self.p, self.fronta

        def cti():
            try:
                for radek in p.stdout:
                    fronta.put(radek)
            except Exception:
                pass
            fronta.put(None)

        def cti_chyby():
            try:
                for radek in p.stderr:
                    if radek.strip():
                        log("stderr:", radek.strip()[:200])
            except Exception:
                pass

        threading.Thread(target=cti, daemon=True).start()
        threading.Thread(target=cti_chyby, daemon=True).start()

    def _ukonci_nolock(self):
        if self.p and self.p.poll() is None:
            try:
                self.p.stdin.close()
                self.p.terminate()
                self.p.wait(timeout=5)
            except Exception:
                try:
                    self.p.kill()
                except Exception:
                    pass
        self.p = None

    def restart(self):
        with self.zamek:
            self._nastartuj_nolock()

    def zije(self):
        return self.p is not None and self.p.poll() is None

    # ---------- dotaz (drží zámek přes celou konzumaci generátoru) ----------
    def zeptej_se(self, text, limit=120):
        with self.zamek:
            rozbito = False        # opravdová porucha -> restart procesu
            klient_odpadl = False  # jen jsme přestali poslouchat -> dočíst a nechat žít
            try:
                if not self.zije():
                    log("proces nežije, startuji nový")
                    self._nastartuj_nolock()

                # Nakrmit pamětí, pokud ještě nebyl (spotřebuje se tiše).
                if not self.nakrmeno:
                    log("krmim pameti...")
                    kusy, ok = [], False
                    for k, hotovo in self._query(NAKRMENI, 180):
                        kusy.append(k)
                        ok = hotovo
                    odp = "".join(kusy)
                    bez_hacku = "".join(c for c in unicodedata.normalize("NFD", odp.upper()) if not unicodedata.combining(c))
                    self.nakrmeno = ok and "PRIPRAVEN" in bez_hacku
                    log("nakrmeno" if self.nakrmeno else f"krmeni selhalo: {odp[:80]}")
                    if not self.nakrmeno:
                        rozbito = True
                        yield "[assistant is still starting]"
                        return

                self.pocet_dotazu += 1
                dostal_result = False
                for kus, hotovo in self._query(text, limit):
                    if hotovo:
                        dostal_result = True
                    elif kus:
                        yield kus
                if not dostal_result:
                    rozbito = True     # timeout/úmrtí → nevěřit frontě
                    yield "\n[server timed out]"
            except GeneratorExit:
                # Klient odpadl uprostřed odpovědi — vypadla mu síť, zhasl
                # telefon, nebo dotaz zrušil. NENÍ to porucha asistentky.
                # Dřív se tady proces preventivně restartoval a asistentka
                # zapomněla celý rozhovor; teď jen dočteme zbytek odpovědi
                # do prázdna a necháme ji žít i s kontextem.
                klient_odpadl = True
                raise
            finally:
                if klient_odpadl and not rozbito:
                    try:
                        docteno = self._docti_zbytek(DOCTENI_S)
                    except Exception as e:
                        docteno = False
                        log("dočítání selhalo:", e)
                    if docteno:
                        log("klient odpadl — zbytek odpovědi zahozen, proces žije dál")
                    else:
                        rozbito = True   # nedočetli jsme -> fronta je nejistá
                        log(f"klient odpadl a turn nedoběhl do {DOCTENI_S} s — restartuji")
                if rozbito:
                    log("turn nedokončen — preventivní restart procesu")
                    try:
                        self._nastartuj_nolock()
                    except Exception as e:
                        log("restart selhal:", e)

    def _docti_zbytek(self, limit):
        """Dočte rozjetý turn do konce a zahodí ho. Volat jen pod zámkem.

        Zámek držíme celou dobu, takže další dotaz počká — ale počká si
        na doběhnutí odpovědi (vteřiny), ne na restart s načtením paměti
        (desítky vteřin). Vrací True, když turn doběhl čistě.
        """
        t0 = time.time()
        while time.time() - t0 < limit:
            try:
                radek = self.fronta.get(timeout=1)
            except queue.Empty:
                continue
            if radek is None:
                return False          # proces skončil
            try:
                d = json.loads(radek)
            except Exception:
                continue
            if d.get("type") == "result":
                return True
        return False

    def _query(self, text, limit):
        """Nízká úroveň: pošli zprávu, čti tokeny. Volat jen pod zámkem.
        Vrací dvojice (kus_textu, je_result)."""
        # vyprázdnit zbytky (po čistém turnu by tam nic být nemělo)
        while not self.fronta.empty():
            try:
                self.fronta.get_nowait()
            except queue.Empty:
                break

        zprava = {"type": "user",
                  "message": {"role": "user",
                              "content": [{"type": "text", "text": text}]}}
        try:
            self.p.stdin.write(json.dumps(zprava, ensure_ascii=False) + "\n")
            self.p.stdin.flush()
        except Exception as e:
            log("nelze zapsat do Clauda:", e)
            yield ("[assistant unreachable]", False)
            return

        t0 = time.time()
        vydano = False
        while time.time() - t0 < limit:
            try:
                radek = self.fronta.get(timeout=1)
            except queue.Empty:
                continue
            if radek is None:
                yield ("[assistant stopped]", False)
                return
            try:
                d = json.loads(radek)
            except Exception:
                continue
            typ = d.get("type")
            if typ == "stream_event":
                delta = (d.get("event") or {}).get("delta") or {}
                txt = delta.get("text")
                if txt:
                    vydano = True
                    yield (txt, False)
            elif typ == "result":
                vysl = d.get("result") or ""
                if vysl and not vydano:
                    yield (vysl, False)   # odpověď bez stream delt
                yield ("", True)
                return
        # limit vypršel — volající to pozná podle chybějícího resultu


claude = Claude()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    timeout = 30      # zaseknutý klient nesmí držet zámek navždy

    def log_message(self, *a):
        pass

    # ---------- pomůcky ----------
    def _posli_text(self, telo, kod=200, typ="text/plain; charset=utf-8"):
        data = telo.encode("utf-8") if isinstance(telo, str) else telo
        self.send_response(kod)
        self.send_header("Content-Type", typ)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _delka_tela(self):
        try:
            delka = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if delka < 0 or delka > MAX_TELO:
            return None
        return delka

    def _posli_kus(self, text):
        data = text.encode("utf-8")
        self.wfile.write(f"{len(data):X}\r\n".encode())
        self.wfile.write(data + b"\r\n")
        self.wfile.flush()

    def _zacni_stream(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Transfer-Encoding", "chunked")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

    def _streamuj(self, gen, t0, popis):
        prvni = None
        try:
            for kus in gen:
                if prvni is None:
                    prvni = time.time() - t0
                self._posli_kus(kus)
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
            log(f"{popis} ({time.time()-t0:.1f} s, prvni "
                f"{(prvni or 0):.1f} s)")
        except (BrokenPipeError, ConnectionResetError, TimeoutError, OSError):
            log(f"{popis}: klient odpadl")
        finally:
            gen.close()

    # ---------- HTTP ----------
    def do_GET(self):
        if self.path == "/stav":
            data = {
                "zije": claude.zije(),
                "pripraven": claude.zije() and claude.nakrmeno,
                "gen": claude.gen,
                "bezi_sekund": int(time.time() - claude.start_cas),
                "pocet_dotazu": claude.pocet_dotazu,
                "prepis_pripraven": bool(prepis and prepis.nacti_klic()),
            }
            self._posli_text(json.dumps(data, ensure_ascii=False),
                             typ="application/json; charset=utf-8")
        elif self.path == "/nastaveni":
            # Vydá spárované aplikaci klíč živého přepisu a slovník jmen.
            # Autorizaci hlídá Caddy (Bearer token) stejně jako u všeho ostatního.
            data = {
                "soniox": _cti_soubor(PRACOVNI + "/soniox.txt"),
                "slovnik": [r.strip() for r in
                            _cti_soubor(PRACOVNI + "/slovnik.txt").splitlines()
                            if r.strip()],
            }
            self._posli_text(json.dumps(data, ensure_ascii=False),
                             typ="application/json; charset=utf-8")
        else:
            self._posli_text("nenalezeno", 404)

    def do_POST(self):
        delka = self._delka_tela()
        if delka is None:
            self._posli_text("neplatna velikost tela", 400)
            return

        if self.path == "/restart":
            threading.Thread(target=claude.restart, daemon=True).start()
            self._posli_text("restartuji\n")
            return

        if self.path == "/prepis":
            audio = self.rfile.read(delka) if delka else b""
            if prepis is None:
                vysledek = {"chyba": "transcription unavailable"}
            else:
                text, chyba = prepis.prepis(audio, self.headers.get("X-Format") or "nahravka.wav")
                vysledek = {"chyba": chyba} if chyba else {"prepis": text}
            self._posli_text(json.dumps(vysledek, ensure_ascii=False),
                             typ="application/json; charset=utf-8")
            return

        if self.path == "/hlas":
            audio = self.rfile.read(delka) if delka else b""
            t0 = time.time()
            self._zacni_stream()
            try:
                if prepis is None:
                    self._posli_kus(json.dumps({"chyba": "transcription unavailable"},
                                               ensure_ascii=False) + "\n")
                    self.wfile.write(b"0\r\n\r\n")
                    return
                text, chyba = prepis.prepis(audio, self.headers.get("X-Format") or "nahravka.wav")
                if chyba:
                    self._posli_kus(json.dumps({"chyba": chyba}, ensure_ascii=False) + "\n")
                    self.wfile.write(b"0\r\n\r\n")
                    log("hlas CHYBA prepisu:", chyba)
                    return
                self._posli_kus(json.dumps({"prepis": text}, ensure_ascii=False) + "\n")
                if not text:
                    self._posli_kus("[nothing heard]")
                    self.wfile.write(b"0\r\n\r\n")
                    return
            except (BrokenPipeError, ConnectionResetError, TimeoutError, OSError):
                return
            self._streamuj(claude.zeptej_se(text), t0, f"hlas | {text[:60]}")
            return

        if self.path == "/dotaz":
            telo = self.rfile.read(delka).decode("utf-8", "replace") if delka else ""
            if not telo.strip():
                self._posli_text("prazdny dotaz\n", 400)
                return
            t0 = time.time()
            self._zacni_stream()
            self._streamuj(claude.zeptej_se(telo.strip()), t0, f"dotaz | {telo.strip()[:60]}")
            return

        self._posli_text("nenalezeno", 404)


def main():
    log("=== mostek v2 startuje na portu", PORT, "===")
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)

    def konec(*a):
        log("koncim")
        with claude.zamek:
            claude._ukonci_nolock()
        sys.exit(0)
    signal.signal(signal.SIGTERM, konec)
    signal.signal(signal.SIGINT, konec)

    # Zahřátí: nakrmit paměť hned po startu (mimo požadavky).
    def zahrej():
        try:
            for _ in claude.zeptej_se("Rekni jen: ok"):
                pass
        except Exception as e:
            log("zahrati selhalo:", e)
    threading.Thread(target=zahrej, daemon=True).start()

    # Hlídač: mrtvý proces nastartovat, po 3 h obnovit — ale nikdy
    # nesahat na proces, který právě obsluhuje dotaz.
    def hlidac():
        while True:
            time.sleep(300)
            if not claude.zamek.acquire(blocking=False):
                continue                      # něco běží — počkáme na další tik
            try:
                if not claude.zije():
                    log("proces umrel, restartuji")
                    claude._nastartuj_nolock()
                elif time.time() - claude.start_cas > 3 * 3600:
                    log("bezi pres 3 h, obnovuji kvuli kontextu")
                    claude._nastartuj_nolock()
            finally:
                claude.zamek.release()
    threading.Thread(target=hlidac, daemon=True).start()

    server.serve_forever()


if __name__ == "__main__":
    main()
