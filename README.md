# Plan B Assistant

A full AI assistant on [Even Realities G2](https://www.evenrealities.com) glasses,
running on a server **you** own.

Hold the ring, speak, and your words appear on the display as you say them.
Release, and the answer streams back in seconds. The phone stays in your pocket.

There is no service behind this project — no accounts, no shared cloud, no
telemetry. The app is a display for a small server you run yourself, and this
repository is everything you need to build one.

---

## How it works

```
   ring + microphone          your VPS                    your account
   ┌───────────────┐      ┌──────────────────┐      ┌───────────────────┐
   │  G2 glasses   │─────▶│  bridge (Python) │─────▶│  Claude Code CLI  │
   │  + phone app  │◀─────│  HTTPS + token   │◀─────│  + your memory    │
   └───────────────┘      └──────────────────┘      └───────────────────┘
            │
            └──▶ live transcription service (optional, your key)
```

The glasses app holds no credentials of its own. On first launch you pair it
with your server by entering the server address and an access token; both are
stored on your phone and nowhere else. Every request carries that token, and
the gateway rejects anything without it.

---

## What you need

| | |
|---|---|
| **Glasses** | Even Realities G2 and the R1 ring |
| **A server** | Any small VPS — 2 GB RAM is plenty. Roughly €5/month. Ubuntu 22.04/24.04 or Debian 12. |
| **A Claude account** | The assistant runs through the Claude Code CLI on your own subscription. No API key needed. |
| **A transcription key** *(optional)* | [Soniox](https://soniox.com) for live word-by-word transcription, and/or [Groq](https://console.groq.com) (free) as a fallback. Without either, the app still works — the fallback path just needs one of them, so add at least one. |

---

## Install the server

Log in to your fresh VPS as root and run:

```bash
git clone https://github.com/BranoHol/plan-b-assistant.git
cd plan-b-assistant/server
bash install.sh
```

The script installs Python, Node.js, the Claude Code CLI, the bridge, and a
Caddy gateway that terminates HTTPS (using [sslip.io](https://sslip.io), so you
do not need to buy a domain) and enforces the access token. It generates the
token for you and prints it at the end.

It then asks you to do two things by hand, because they need your browser and
your own keys:

**1. Sign in to Claude**

```bash
su - asistent
claude
```

Follow the login link, sign in, then `/exit`. While you are there, `/mcp` lets
you connect Gmail, Google Calendar and other tools if you want the assistant to
reach them. Return to root with `exit`.

**2. Add a transcription key**

```bash
echo "YOUR_SONIOX_KEY" > /home/asistent/agent/soniox.txt   # live transcription
echo "YOUR_GROQ_KEY"   > /home/asistent/agent/groq.txt     # fallback
chown asistent:asistent /home/asistent/agent/*.txt
chmod 600 /home/asistent/agent/*.txt
```

**Then start it:**

```bash
systemctl start mostek
sleep 40
curl -s -H "Authorization: Bearer $(cat /home/asistent/agent/token.txt)" \
     https://YOUR-IP.sslip.io/stav
```

You want `"pripraven": true`. That is the whole server.

---

## Set up the glasses

Install **Plan B Assistant** from the Even Hub store, open it once, and the
phone app will ask for two things:

- **Server address** — `your-ip.sslip.io`
- **Access token** — printed by the installer, also in `/home/asistent/agent/token.txt`

Tick the box, tap **Pair**, and you are done. The glasses app never asks again.

> **Only pair with a server you control.** Whoever runs the server you enter can
> read everything you send to it.

---

## Make it yours

Three files shape how the assistant behaves. All of them live in
`/home/asistent/agent/` on your server and none of them are in this repository —
your content stays yours.

**`CLAUDE.md`** — the assistant's standing instructions: how long answers should
be, what it may and may not do, and the confirmation protocol for anything that
sends or changes something. The shipped template is deliberately careful: the
assistant summarises an action, asks, and only acts after an explicit yes in your
*next* message. Keep that.

**`pamet/`** — a small knowledge base about your work: projects, people, context.
Written as plain Markdown, read at startup. The templates explain the one rule
that makes it useful rather than creepy: it is reference material, not a
personality profile, and nothing in it is ever a reason to refuse or reshape a
task.

**`slovnik.txt`** — one proper noun per line: names, project titles, words the
speech recogniser keeps getting wrong. Both transcription paths use it.

---

## Updating

Changes to the server take effect immediately — pull, copy the file, restart:

```bash
cd plan-b-assistant && git pull
cp server/mostek.py server/prepis.py /home/asistent/agent/
chown asistent:asistent /home/asistent/agent/*.py
systemctl restart mostek
```

Changes to the glasses app arrive as a store update.

---

## Building the glasses app yourself

Only needed if you want to modify it — the store version works as it is.

```bash
cd app
npm install
npm run build
npx evenhub pack app.json dist -o planb.ehpk
```

Upload the package at [hub.evenrealities.com](https://hub.evenrealities.com)
under your own developer account and package ID.

---

## What the app sends where

- **Your questions and answers** — only to the server address you paired with.
- **Your audio** — to the transcription service whose key your server holds
  (live path), or to your own server (fallback path). Nothing is stored by the
  app after the answer arrives.
- **Anything else** — nowhere. There is no analytics, no crash reporting, no
  developer backend.

Full detail in the [Privacy Policy](docs/privacy.html) and
[Terms of Use](docs/terms.html).

---

## Security notes

The gateway rejects every request that does not carry your token, and all
traffic is HTTPS. Keep the token secret, use SSH keys rather than a password on
the VPS, and turn on two-factor authentication at your hosting provider. If a
token ever leaks, generate a new one, write it to
`/home/asistent/agent/token.txt`, update the `Caddyfile`, restart Caddy, and
re-pair the app.

---

## Licence

MIT — see [LICENSE](LICENSE). Provided as is, without warranty. You are
responsible for how you use it, including the laws where you live about
recording other people.
