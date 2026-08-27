#!/bin/bash
# ============================================================
#  Plan B Assistant — server installer
#  Run as root on a fresh Ubuntu 22.04/24.04 or Debian 12 VPS:
#      bash install.sh
# ============================================================
set -e

UZIVATEL=asistent
SLOZKA=/home/$UZIVATEL/agent
ZDROJ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

nadpis() { echo ""; echo "=== $1 ==="; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this as root:  sudo bash install.sh"
  exit 1
fi

# ---------- 1. system packages ----------
nadpis "1/7  System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y python3 curl ca-certificates gnupg debian-keyring \
  debian-archive-keyring apt-transport-https ufw >/dev/null
echo "Installed."

# ---------- 2. user ----------
nadpis "2/7  User account"
if id "$UZIVATEL" >/dev/null 2>&1; then
  echo "User '$UZIVATEL' already exists."
else
  adduser --disabled-password --gecos "" "$UZIVATEL" >/dev/null
  echo "User '$UZIVATEL' created."
fi
mkdir -p "$SLOZKA/pamet"

# ---------- 3. Node.js + Claude Code ----------
nadpis "3/7  Node.js and Claude Code"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y nodejs >/dev/null
  echo "Node.js installed."
else
  echo "Node.js already present ($(node -v))."
fi
if ! command -v claude >/dev/null 2>&1; then
  npm install -g @anthropic-ai/claude-code >/dev/null 2>&1
  echo "Claude Code installed."
else
  echo "Claude Code already present."
fi

# ---------- 4. application files ----------
nadpis "4/7  Bridge files"
cp "$ZDROJ/mostek.py" "$ZDROJ/prepis.py" "$SLOZKA/"
[ -f "$SLOZKA/CLAUDE.md" ] || cp "$ZDROJ/CLAUDE.md.example" "$SLOZKA/CLAUDE.md"
for f in "$ZDROJ"/pamet/*.md; do
  jmeno=$(basename "$f")
  [ -f "$SLOZKA/pamet/$jmeno" ] || cp "$f" "$SLOZKA/pamet/$jmeno"
done
[ -f "$SLOZKA/slovnik.txt" ] || printf '' > "$SLOZKA/slovnik.txt"
chown -R "$UZIVATEL:$UZIVATEL" "/home/$UZIVATEL"
chmod 644 "$SLOZKA/mostek.py" "$SLOZKA/prepis.py"
echo "Copied to $SLOZKA."

# ---------- 5. access token ----------
nadpis "5/7  Access token"
if [ -f "$SLOZKA/token.txt" ]; then
  TOKEN=$(cat "$SLOZKA/token.txt")
  echo "Existing token kept."
else
  TOKEN=$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 32)
  echo "$TOKEN" > "$SLOZKA/token.txt"
  chown "$UZIVATEL:$UZIVATEL" "$SLOZKA/token.txt"
  chmod 600 "$SLOZKA/token.txt"
  echo "New token generated."
fi

# ---------- 6. HTTPS gateway (Caddy) ----------
nadpis "6/7  HTTPS gateway"
IP=$(curl -s --max-time 10 https://api.ipify.org || true)
if [ -z "$IP" ]; then
  read -rp "Could not detect the public IP. Enter it: " IP
fi
DOMENA="${IP}.sslip.io"
echo "Address will be: https://$DOMENA"

if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y caddy >/dev/null
  echo "Caddy installed."
fi

cat > /etc/caddy/Caddyfile << CADDY
${DOMENA} {
    # Browser preflight — must answer before the token check.
    @preflight method OPTIONS
    handle @preflight {
        header Access-Control-Allow-Origin "*"
        header Access-Control-Allow-Methods "GET, POST, OPTIONS"
        header Access-Control-Allow-Headers "Authorization, Content-Type, X-Format"
        header Access-Control-Max-Age "86400"
        respond "" 204
    }

    # Only requests carrying the token reach the bridge.
    @allowed header Authorization "Bearer ${TOKEN}"
    handle @allowed {
        header Access-Control-Allow-Origin "*"
        reverse_proxy 127.0.0.1:8080 {
            flush_interval -1
        }
    }

    handle {
        header Access-Control-Allow-Origin "*"
        respond "Unauthorized" 403
    }

    log {
        output file /var/log/caddy/access.log
        level ERROR
    }
}
CADDY
mkdir -p /var/log/caddy && chown caddy:caddy /var/log/caddy
ufw allow 80/tcp >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
systemctl enable caddy >/dev/null 2>&1
systemctl restart caddy
echo "Gateway configured."

# ---------- 7. service ----------
nadpis "7/7  Bridge service"
cat > /etc/systemd/system/mostek.service << UNIT
[Unit]
Description=Plan B Assistant bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${UZIVATEL}
WorkingDirectory=${SLOZKA}
ExecStart=/usr/bin/python3 ${SLOZKA}/mostek.py
Restart=always
RestartSec=10
Environment=PATH=/home/${UZIVATEL}/.local/bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable mostek >/dev/null 2>&1
echo "Service installed (not started yet)."

# ---------- summary ----------
cat << SHRNUTI

============================================================
 INSTALLED — two manual steps remain
============================================================

STEP A — sign in to Claude (needs your browser, once)

    su - ${UZIVATEL}
    claude

  Follow the login link it prints, sign in with your Claude
  account, then type /exit.
  Optional, while you are there: connect Gmail and Google
  Calendar with  /mcp  so the assistant can reach them.
  Then return to root with  exit

STEP B — add a speech-to-text key (optional but recommended)

  Live word-by-word transcription — soniox.com, paid:
      echo "YOUR_SONIOX_KEY" > ${SLOZKA}/soniox.txt

  Fallback transcription — console.groq.com, free:
      echo "YOUR_GROQ_KEY" > ${SLOZKA}/groq.txt

  Then:
      chown ${UZIVATEL}:${UZIVATEL} ${SLOZKA}/*.txt
      chmod 600 ${SLOZKA}/*.txt

FINALLY — start it:

      systemctl start mostek
      sleep 40
      curl -s -H "Authorization: Bearer ${TOKEN}" https://${DOMENA}/stav

  You want to see  "pripraven": true

============================================================
 ENTER THESE TWO IN THE GLASSES APP
============================================================

 Server address:  ${DOMENA}
 Access token:    ${TOKEN}

 (also saved in ${SLOZKA}/token.txt)
============================================================

SHRNUTI
