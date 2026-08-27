#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
prepis.py — cesky prepis reci pres Groq (whisper-large-v3-turbo).
Pouziva jen standardni knihovnu.
"""
import json, mimetypes, os, ssl, urllib.request, uuid

KLIC_SOUBOR = "/home/asistent/agent/groq.txt"
URL = "https://api.groq.com/openai/v1/audio/transcriptions"
MODEL = "whisper-large-v3-turbo"

# Slovnik vlastnich jmen — pomaha Whisperu trefit jmena a nazvy projektu.
# Cte se ze souboru slovnik.txt (jeden vyraz na radek), ktery si kazdy
# naplni sam. V kodu zadna osobni data nejsou.
SLOVNIK_SOUBOR = "/home/asistent/agent/slovnik.txt"
MAX_SLOVNIK = 700          # Groq povoluje ~224 tokenu, drzime rezervu


def nacti_slovnik():
    try:
        with open(SLOVNIK_SOUBOR) as f:
            vyrazy = [r.strip() for r in f if r.strip()]
    except OSError:
        return ""
    return ", ".join(vyrazy)[:MAX_SLOVNIK]


def nacti_klic():
    try:
        with open(KLIC_SOUBOR) as f:
            k = f.read().strip()
            return k or None
    except Exception:
        return None


def _multipart(pole, soubor_jmeno, soubor_data, soubor_typ):
    """Sestavi telo multipart/form-data. Vraci (telo, content_type)."""
    hranice = "----hranice" + uuid.uuid4().hex
    kusy = []
    for k, v in pole.items():
        kusy.append(f"--{hranice}\r\n".encode())
        kusy.append(f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode())
        kusy.append(str(v).encode("utf-8"))
        kusy.append(b"\r\n")
    kusy.append(f"--{hranice}\r\n".encode())
    kusy.append(
        f'Content-Disposition: form-data; name="file"; filename="{soubor_jmeno}"\r\n'
        f"Content-Type: {soubor_typ}\r\n\r\n".encode())
    kusy.append(soubor_data)
    kusy.append(f"\r\n--{hranice}--\r\n".encode())
    return b"".join(kusy), f"multipart/form-data; boundary={hranice}"


def prepis(audio_data, jmeno="nahravka.wav"):
    """Vrati (text, chyba). Pri uspechu chyba = None."""
    jmeno = "".join(z for z in (jmeno or "nahravka.wav") if z.isalnum() or z in "._-")[:64] or "nahravka.wav"
    klic = nacti_klic()
    if not klic:
        return None, "chybi klic ke Groqu"
    if not audio_data or len(audio_data) < 1000:
        return None, "nahravka je prazdna"

    typ = mimetypes.guess_type(jmeno)[0] or "audio/wav"
    pole = {
        "model": MODEL,
        "language": "cs",
        "response_format": "json",
        "temperature": "0",
        "prompt": nacti_slovnik(),
    }
    telo, ct = _multipart(pole, jmeno, audio_data, typ)

    req = urllib.request.Request(URL, data=telo, method="POST")
    req.add_header("Authorization", f"Bearer {klic}")
    req.add_header("Content-Type", ct)
    # Bez normalni hlavicky nas Cloudflare pred Groqem odmitne (chyba 1010).
    req.add_header("User-Agent",
                   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/128.0.0.0 Safari/537.36")
    req.add_header("Accept", "application/json")
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=120, context=ctx) as r:
            data = json.loads(r.read().decode("utf-8"))
            return (data.get("text") or "").strip(), None
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode("utf-8")[:300]
        except Exception:
            detail = ""
        return None, f"Groq odmitl ({e.code}): {detail}"
    except Exception as e:
        return None, f"chyba site: {e}"


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("pouziti: prepis.py nahravka.wav")
        sys.exit(1)
    with open(sys.argv[1], "rb") as f:
        t, ch = prepis(f.read(), os.path.basename(sys.argv[1]))
    print("CHYBA:", ch) if ch else print("PREPIS:", t)
