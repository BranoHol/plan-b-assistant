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
import json, sys

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
POVOLENY_PODSTROM = "pamet"


def _zamitni(duvod):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": duvod,
        },
    }))


def main():
    try:
        vstup = json.load(sys.stdin)
    except Exception:
        return 0

    try:
        vstupni = vstup.get("tool_input") or {}
        text = json.dumps(vstupni, ensure_ascii=False).lower()
        nastroj = str(vstup.get("tool_name") or "").lower()
    except Exception:
        return 0

    for vzor in ZAKAZANE:
        if vzor in text:
            _zamitni("This path holds access keys or the sign-in. "
                     "Reading it is blocked by the server owner.")
            return 0

    if nastroj in HLEDACI_NASTROJE:
        cesta = str(vstupni.get("path") or "").lower()
        # Prazdna cesta = pracovni slozka, a v te klice lezi.
        if POVOLENY_PODSTROM not in cesta:
            _zamitni("Searching outside the memory folder is blocked by the "
                     "server owner, because access keys live there. "
                     "Use Read on a specific file, or search under pamet/.")
            return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
