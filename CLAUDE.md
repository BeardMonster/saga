# Saga — read before working here

Full project memory: `C:\Users\lostlegend\.claude\projects\C--Users-lostlegend\memory\Saga\MEMORY.md` (read it and what it links to).

## Non-negotiables
- **Saga has no login yet. One MUST be added before launch, remote access, or the Android app is called done.** The API must enforce it. Remind Brandon when work heads toward the Android app or remote access.
- Android plan: wrap the web app with Capacitor; reached over Tailscale; wants native notifications/reminders.
- UI standards: Material Design 3 (visual reference), shadcn/ui (components, adopted in stages), Nielsen's 10 usability heuristics (review checklist). No hover-only controls, 48px tap targets, phone-first.
- Deleting: confirmation dialog + Undo message + Trash (all three).
- Local AI first; Claude API strictly opt-in. Brandon has a dairy allergy (hard exclusion in food features).
- Server: Proxmox LXC 192.168.11.10 (`ssh -i ~/.ssh/saga_proxmox lostlegend@192.168.11.10`), code in `~/saga`, containers `saga-api-dev`, `saga-web-dev`, `saga-grocery-scanner`, `saga-whisper-dev`, `saga-postgres-dev`, `saga-ntfy`. Edit locally, `scp` to the server; verify with `npx tsc --noEmit` in the containers.
