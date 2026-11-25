# Putting DocuChain online

Everything (Fabric, Postgres, MeiliSearch, the API and the website) runs on **one Linux server** with Docker. Caddy serves the site on your domain with a free Let's Encrypt HTTPS certificate.

```
Browser ──HTTPS──▶ Caddy (React app) ──/api──▶ Express API ──▶ Postgres, MeiliSearch, Fabric peer
```

Only ports 22 (SSH), 80 and 443 are open to the internet. Fabric, Postgres and MeiliSearch are reachable only from inside the server.

## 1. Get a server

- **Size:** at least **4 GB RAM / 2 vCPU**, **Ubuntu 24.04 LTS**, 50 GB disk.
- **Free with the GitHub Student Developer Pack** (education.github.com/pack):
  - **DigitalOcean**: student credit covers a 4 GB "Basic" Droplet for the whole defense period.
  - **Azure for Students**: credit without a credit card; pick a `B2s` VM (4 GB) with Ubuntu 24.04.
- When creating it, add your SSH key (or set a strong root password) and note the server's **public IPv4 address**.

## 2. Get a domain and point it at the server

- **Free with the Student Pack:** a `.me` domain from Namecheap or a `.tech` domain from get.tech (1 year each). A school subdomain (e.g. `docuchain.dnsc.edu.ph`) also works if the IT office can add a DNS record.
- In the domain's DNS settings add two records:

  | Type | Name  | Value              |
  |------|-------|--------------------|
  | A    | `@`   | your server's IPv4 |
  | A    | `www` | your server's IPv4 |

- DNS can take a few minutes to an hour. Check with `ping yourdomain.me`.

## 3. Push the code to GitHub

On your PC, commit and push the project (the `.gitignore` already keeps `.env`, `uploads/`, `fabric-samples/` and Fabric keys out of Git):

```bash
git add -A
git commit -m "Add online deployment setup"
git push
```

If the repo is private, create a GitHub token or deploy key so the server can clone it.

## 4. Run the setup on the server

```bash
ssh root@YOUR_SERVER_IP
git clone https://github.com/Edrianl1m/DocuChain.git docuchain
cd docuchain
sudo bash deploy/setup-server.sh
```

It asks for your **domain**, an **email** (for certificate notices) and a **password for the `admin` account**, then:

1. installs Docker, Node.js and the firewall, and adds swap,
2. downloads the Linux Fabric tools and creates the Fabric network and channel,
3. deploys the DocuChain chaincode,
4. builds and starts Postgres, MeiliSearch, the API and Caddy.

The first run takes about 10 to 15 minutes. When it finishes, open **https://yourdomain** and log in as `admin`.

The secrets it generated are in `~/docuchain/.env`. Keep a private copy; never commit it.

## Everyday commands (run inside `~/docuchain`)

| What | Command |
|---|---|
| See status | `docker compose -f docker-compose.prod.yml ps` |
| API logs | `docker compose -f docker-compose.prod.yml logs -f backend` |
| HTTPS / Caddy logs | `docker compose -f docker-compose.prod.yml logs -f caddy` |
| Deploy new code after `git push` | `sudo bash deploy/update.sh` |
| Back up everything | `sudo bash deploy/backup.sh` then copy `backups/*.tar.gz` to your PC with `scp` |

Everything restarts by itself after a server reboot.

## What changed for online use

- **No demo accounts online.** Only `admin` is created, with the password you chose. `admin123` / `user1` exist only in the local LAN setup, and the login page no longer shows them in the online build.
- **Secrets are not in code.** JWT secret, database and MeiliSearch keys are random per server (in `.env`). The API refuses to start online with a weak JWT secret.
- **Uploaded files are only served through logged-in API routes.** The old `/files` folder link had no login check, so it is turned off online.
- **Login is rate-limited** (20 tries per 15 minutes per IP) and so is public verification (10 per minute).
- **Upload limit:** 50 MB per file (`MAX_FILE_SIZE_MB` in `.env`).
- **Security headers and HTTPS-only** are set by Caddy (HSTS, nosniff, frame protection).

## Notes

- **The online ledger starts empty.** The server creates its own Fabric network, so documents from your PC are not copied over. Upload the demo resolutions again after going live.
- **If the HTTPS certificate fails:** DNS is not pointing at the server yet. Fix the A records; Caddy retries by itself (check the caddy logs).
- **If the chaincode step failed on the first run:** run `sudo bash fabric-network/scripts/network-down.sh`, then `sudo bash deploy/setup-server.sh` again. This wipes the (still empty) ledger and starts over.
- **Never run `network-down.sh` once real documents are on the ledger.** It deletes the ledger and the Fabric keys.
