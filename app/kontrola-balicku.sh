#!/bin/bash
# Bezpecnostni kontrola pred nahranim na hub:
# v zabalene aplikaci (dist/) nesmi byt zadne tajemstvi.
cd "$(dirname "${BASH_SOURCE[0]}")"
CHYBA=0
# Vzory tajemstvi. Doplnte si vlastni (napr. zacatek sveho tokenu).
for vzor in snx_ gsk_ sk-ant; do
  if grep -rq "$vzor" dist/ 2>/dev/null; then
    echo "!!! NALEZENO TAJEMSTVI (vzor: $vzor) - NENAHRAVAT !!!"
    CHYBA=1
  fi
done
if [ "$CHYBA" -eq 0 ]; then
  echo "CISTO - balicek neobsahuje zadna tajemstvi, muzes nahrat."
else
  exit 1
fi
