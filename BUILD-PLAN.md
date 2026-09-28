# Saga — Build Plan

A linear, step-by-step walkthrough from a wiped m920q to a working Phase 1 app. Detailed through the end of Phase 1, since that's what we're building next; phases 2+ are one-line summaries for now — full detail for each already lives in [README.md](README.md), [DATA-MODEL.md](DATA-MODEL.md), and [STACK-FOUNDATION.md](STACK-FOUNDATION.md), and gets fleshed out further when we actually reach that phase.

This is the review copy. The living, actively-updated version of the infra steps is [SETUP-CHECKLIST.md](SETUP-CHECKLIST.md) — check that one for current status/checkboxes as we go.

---

## Part A — Physical setup: Proxmox on the m920q

Everything in this part happens on the physical box, mostly by you (a few things need hands-on-keyboard at the machine itself).

### A1. Download what you need

- **Proxmox VE 9.2 ISO installer** (current version as of this writing): https://www.proxmox.com/en/downloads/proxmox-virtual-environment/iso — grab the standard x86-64 ISO
- **Rufus** (to flash the ISO to a USB drive): https://rufus.ie/

### A2. Flash the installer USB

1. Plug in a USB drive (8GB+ — it will be completely wiped)
2. Open Rufus → select the Proxmox ISO as the boot selection → select the USB drive → click Start (default options are fine)

### A3. Wipe the m920q and install Proxmox

1. Plug the USB into the m920q and boot from it (you may need to hit a boot-menu key like F12 or Esc right at power-on — varies by BIOS; check Lenovo's docs for the M920q if it's not obvious)
2. Run the Proxmox installer: confirm the wipe of the internal disk, set a root password + an email (used for update notices), and when it asks for network configuration, give it a **static IP** on your LAN rather than DHCP — you need a fixed address to reliably reach it
3. Reboot. Proxmox's web UI is now at `https://<the-ip-you-set>:8006` (a self-signed certificate warning is expected and fine to click through)

### A4. First login and host update

1. Log into the web UI as `root` with the password from install
2. Open a shell (the web UI has a Shell button, or SSH to `root@<ip>`) and run:
   ```
   apt update && apt full-upgrade -y
   ```

### A5. NVIDIA driver on the Proxmox host

1. Download the current Linux driver for the RTX 3050 from https://www.nvidia.com/en-us/drivers/ (the 64-bit `.run` installer)
2. Blacklist the open-source `nouveau` driver, reboot, then run the NVIDIA `.run` installer directly on the Proxmox host
3. Verify with `nvidia-smi` on the host — note the exact driver version it reports (e.g. `550.xx`); you'll need to install this **same version** inside the LXC in step A7

*(This step and A7 below are the fiddliest part of the whole infra build — GPU-in-a-container setups are genuinely one of the more error-prone parts of homelab work. I'll be doing this over SSH once you hand off, so don't worry about getting every flag perfect here — just get to a wiped box with Proxmox reachable, and we'll work through the GPU passthrough together.)*

### A6. Create the `saga` LXC container

1. In the Proxmox web UI: Datacenter → your node → local storage → CT Templates → Templates, and download an **Ubuntu 24.04** template
2. Create a new CT using that template: hostname `saga`, a few CPU cores and several GB of RAM is plenty to start
3. **Important:** while creating it, paste **your SSH public key** into the "SSH public key" field so it's already installed on first boot
   - If you don't have an SSH keypair on this Windows PC yet, generate one first (PowerShell): `ssh-keygen -t ed25519 -C "brandon"`, then view the public key to copy with `Get-Content ~/.ssh/id_ed25519.pub`
4. Start the container

### A7. GPU passthrough into the LXC

1. On the Proxmox host: `ls -la /dev/nvidia*` to list the device nodes
2. Edit `/etc/pve/lxc/<CTID>.conf` on the host to allow and bind-mount each device node (`/dev/nvidia0`, `/dev/nvidiactl`, `/dev/nvidia-uvm`, `/dev/nvidia-uvm-tools`, and `/dev/nvidia-modeset` if present) — each needs a matching `lxc.cgroup2.devices.allow` line and `lxc.mount.entry` line
3. Inside the LXC, install **the same NVIDIA driver version** as the host, using the `.run` installer with the `--no-kernel-module` flag — the container shares the host's kernel module, so it only needs matching userspace libraries, not its own driver
4. Verify with `nvidia-smi` **inside the LXC**. If this prints the GPU, the hardest part of the infra build is done.

### A8. Base hardening inside the LXC

1. `apt update && apt full-upgrade -y`
2. Create your own non-root admin user: `adduser brandon`, then `usermod -aG sudo brandon`
3. Copy your SSH public key into that user's `~/.ssh/authorized_keys` too (not just root's)
4. `ufw allow 22 && ufw enable` (more ports get added as needed; LAN-only beyond SSH until Tailscale is up)

### A9. Tailscale

1. `curl -fsSL https://tailscale.com/install.sh | sh`
2. `sudo tailscale up` and authenticate — the LXC now shows up on your existing tailnet, reachable from your phone anywhere, no port forwarding needed

### A10. Docker Engine + NVIDIA Container Toolkit

1. Install Docker via the **official apt repo** (not the Ubuntu-packaged `docker.io`): follow https://docs.docker.com/engine/install/ubuntu/ exactly, then `usermod -aG docker brandon`
2. Install the NVIDIA Container Toolkit: follow https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html, then:
   ```
   sudo nvidia-ctk runtime configure --runtime=docker
   sudo systemctl restart docker
   ```
3. Verify: `docker run --rm --gpus all nvidia/cuda:12.5.0-base-ubuntu24.04 nvidia-smi` — should print the same GPU info as the bare-metal check

### A11. Ollama

1. `curl -fsSL https://ollama.com/install.sh | sh`
2. Pull a starter model sized for 6GB VRAM: `ollama pull llama3.1:8b`
3. Smoke-test: `ollama run llama3.1:8b "say hello"`

### A12. Hand off to Claude

Once A1-A11 are done and you can reach the box (`ssh brandon@<its-tailscale-or-lan-ip>`), give me that address. I'll connect directly over SSH and take it from there.

---

## Part B — Software Phase 0: Workspace + Database

*(Done by Claude over SSH once handed off. Full detail: [STACK-FOUNDATION.md](STACK-FOUNDATION.md) §2 and §9.)*

1. Create `local-data/postgres/` — a `docker-compose.yml` (Postgres 16, bind-mounted data directory, healthcheck) plus `.env`
2. `docker compose up -d`, then create the app role and database (`saga_api_user` / `saga_db`) using the SQL in STACK-FOUNDATION.md
3. Scaffold empty `saga-api/` and `saga-web/` folders with `.env.example` only — no application code yet

## Part C — Software Phase 1: API + Web skeleton + Core Organizer

*(Full entity detail: [DATA-MODEL.md](DATA-MODEL.md) "Phase 1 — Core organizer".)*

**API (`saga-api`):**

1. Fastify + TypeScript + Prisma scaffold; Dockerfile with a `dev` stage; `docker-compose.dev.yml`
2. `DATABASE_URL` wired to the app role via `host.docker.internal` (with the `extra_hosts: host-gateway` fix noted in STACK-FOUNDATION.md)
3. First Prisma migration: `User`, `Project`, `Checklist`, `ChecklistItem`, `Goal`
4. `GET /health` and `GET /ready` (a real DB ping, not just a static 200)
5. Routes/controllers/services for checklists, projects, and goals, using the `{status, message, code, data}` response envelope

**Web (`saga-web`):**

1. Vite + React + TypeScript + Tailwind + TanStack Query + Axios scaffold
2. Dev proxy to the API via `host.docker.internal`
3. Screens: checklist/todo view (including the grocery-list variant), a projects list, and a goals view (10yr → 3mo horizons)
4. Task-completion feedback (a sound + a small animation) built in from the start — not deferred to a later polish pass
5. Basic single-user login

**First real content, once it's running:** a project to inventory and list/sell Brandon's unused retro games and consoles.

**Definition of done for Phase 1:** you can log in, create a project, add a checklist to it, check items off (with the small payoff), and set a goal — all persisted in Postgres, all running in Docker on the `saga` LXC, reachable from your phone over Tailscale.

---

## Part D — Phases 2 onward (summary; full detail lives in README.md and gets expanded here as we build each one)

- **Phase 2 — Calendar, reminders & important dates:** 2-way Google/Apple sync, automatic reminder cascades, the native phone app can start once this backend exists
- **Phase 3 — People & gifts:** person profiles, private per-person gift-idea lists, a link to Brandon's MyRegistry.com wishlist, an SMS + Discord broadcast tool for event invites/updates
- **Phase 4 — Financial ingestion & insights:** bank/credit-card/Venmo/PayPal/Wise/Cash App statement parsing (fully local, Ollama-only, no Claude escalation for financial data), spending dashboards, 401k/Schwab net-worth tracking
- **Phase 5 — Grocery Deals AI:** built on Phase 4's real purchase history, dairy exclusion by default
- **Phase 6 — Price-watch alerts** for specific items
- **Phase 7 — Facebook monitor** (much later, deliberately narrow in scope)
- **Ongoing, not tied to a phase:** backup & recovery — nightly local backups to the Synology NAS, monthly encrypted offsite copy to Backblaze B2 via restic. Worth setting up once the box is stable (end of Part A / early Part B), not something to block any phase on.
