# Roadmap

## Done
- [x] Telegram relay (real bot API), webhook relay, dispatcher wiring
- [x] Android background Web Push (VAPID, service worker, device registry)
- [x] Cyber module: server security headers (CSP/HSTS/nosniff/referrer/permissions),
      runtime audit + hardening screen `/security`, idle auto-lock, secret scan
- [x] Encrypted secret vault (AES-GCM passphrase vault) + agent/model performance scoring
- [x] Video Studio + house band: `/studio`, AI shooting scripts, SRT + storyboard export

- [x] Email relay (Resend) + WhatsApp relay (Meta Cloud API, Twilio fallback);
      dispatcher reports sent/failed only — never "queued" as success
- [x] Bracket protection amend hits Alpaca legs (`PATCH /orders/{id}/protection`);
      UI marks the change unconfirmed when the broker rejects it
- [x] Automated failure-scenario tests (`src/lib/__tests__/failureScenarios.test.ts`)
- [x] Video render package: browser narration preview + ffmpeg manifest/render.sh export

## Open (need real credentials or an external run)
- [ ] Live Alpaca E2E with real keys (submit / amend / cancel observed at the broker)
- [ ] Live email + WhatsApp send once RESEND_* / WHATSAPP_* or TWILIO_* secrets are set
- [ ] Actual video encode: run the exported `render.sh` with ffmpeg outside the app
- [ ] Real market WebSocket verification against Polygon / Alpaca IEX under load
