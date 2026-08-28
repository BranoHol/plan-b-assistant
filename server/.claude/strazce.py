#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Strazce klicu — druha pojistka k deny pravidlum v settings.json.

Claude Code posle na vstup JSON popisujici chystane volani nastroje.
Kdyz se v nem objevi cesta k souboru s klicem nebo k prihlaseni,
volani se zamitne. Deny pravidla hlidaji Read; tenhle strazce
hlida i Grep a Glob, kterymi by sel obsah precist oklikou.

Pri jakekoliv vlastni chybe se NEZAMITA (exit 0) — rozbity strazce
nesmi shodit celou asistentku.
"""
import json, os, sys

ZAKAZANE = (
    "token.txt",
    "soniox.txt",
    "groq.txt",
    "/.claude/",
    "/.ssh/",
    "/etc/caddy",
    ".credentials.json",
)


# Grep a Glob umi vypsat obsah souboru, aniz by je jmenovaly — staci
# hledat nad celou slozkou. Proto u nich povolujeme jen podstrom pameti,
# kde zadne klice nejsou. Read se ridi seznamem ZAKAZANE vyse.
HLEDACI_NASTROJE = ("grep", "glob")
PRACOVNI_SLOZKA = "/home/asistent/agent"
POVOLENY_PODSTROM = os.path.join(PRACOVNI_SLOZKA, "pamet")


def _zamitni(duvod):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": duvod,
        },
    }))


def _je_v_pameti(cesta, pracovni):
    """Lezi cesta OPRAVDU uvnitr pamet/?

    Drive to byla kontrola podretezcem ("pamet" in cesta) a mela tri diry:
      * "pamet/.." to slovo obsahuje, ale vede o patro vys — k token.txt
      * "/tmp/pamet" ho obsahuje taky, a s nasi pameti nema nic spolecneho
      * "pamet_jine" zacina stejne, ale je to jina slozka
    Proto se cesta nejdriv rozresi na skutecnou (realpath rozbali "..",
    "." i symlinky — vcetne odkazu z pamet/ ven) a teprve pak se porovna,
    jestli ZACINA slozkou pameti.

    Nerozresitelna cesta (napr. s nulovym bajtem) neni cesta do pameti,
    takze se zamitne. Neni to "chyba strazce" — strazce se nerozbil,
    jen dostal neco, co do pameti nevede. Vlastni chybu resi az main().
    """
    if not cesta:
        return False           # prazdna cesta = pracovni slozka, a v te klice lezi
    try:
        koren = os.path.realpath(POVOLENY_PODSTROM)
        if not os.path.isabs(cesta):
            cesta = os.path.join(pracovni, cesta)
        cil = os.path.realpath(cesta)
    except Exception:
        return False
    return cil == koren or cil.startswith(koren + os.sep)


def main():
    try:
        vstup = json.load(sys.stdin)
    except Exception:
        return 0

    try:
        vstupni = vstup.get("tool_input") or {}
        text = json.dumps(vstupni, ensure_ascii=False).lower()
        nastroj = str(vstup.get("tool_name") or "").lower()
        pracovni = vstup.get("cwd")
        if not isinstance(pracovni, str) or not pracovni:
            pracovni = PRACOVNI_SLOZKA
    except Exception:
        return 0

    for vzor in ZAKAZANE:
        if vzor in text:
            _zamitni("This path holds access keys or the sign-in. "
                     "Reading it is blocked by the server owner.")
            return 0

    if nastroj in HLEDACI_NASTROJE:
        try:
            cesta = str(vstupni.get("path") or "")
            povoleno = _je_v_pameti(cesta, pracovni)
        except Exception:
            return 0          # vlastni chyba strazce se NEZAMITA
        if not povoleno:
            _zamitni("Searching outside the memory folder is blocked by the "
                     "server owner, because access keys live there. "
                     "Use Read on a specific file, or search under pamet/.")
            return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
