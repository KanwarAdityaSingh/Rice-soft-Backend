# Production Environment Variables

How production config is wired, how to inspect it, and how to add or change variables **without losing existing keys**.

## Overview

| Location | Purpose |
|----------|---------|
| **Local `.env`** (your Mac) | Local development only (`npm run dev`) |
| **K8s secret `backend-env`** (namespace `rice`) | **Source of truth** for production |
| **Server `~/Rice-soft-Backend/.env`** | Convenience copy on EC2; should match the secret after updates |
| **Running pod env** | What the Node app actually reads at runtime |

`deploy.sh` uploads code and restarts the deployment. It does **not** update environment variables. Env changes are a separate, manual step on the server.

## How the pod gets its env

From `k8s/backend-deployment.yaml`:

1. **`envFrom`** — loads almost everything from secret `backend-env`
2. **Inline `env`** — hardcoded overrides:
   - `HOST=0.0.0.0`
   - `DB_HOST=postgres`
   - `DB_PORT=5432`

The migrate job and create-admin job also use `backend-env`.

```
┌─────────────────────┐
│  secret backend-env │  ← you update this
└──────────┬──────────┘
           │ envFrom
           ▼
┌─────────────────────┐     ┌──────────────────┐
│  backend pod        │     │  migrate job     │
│  + HOST/DB_HOST     │     │  (same secret)   │
└─────────────────────┘     └──────────────────┘
```

Reference: [`env.template`](../env.template) lists all supported variables (with dev defaults). Production typically has **more** keys than a local `.env` (Surepass, AWS, Kaleyra, MastersIndia, etc.).

---

## Inspect production env

SSH to the server:

```bash
ssh -i ~/aws_keys/santkripa.pem ubuntu@3.6.49.120
```

### Effective runtime env (what the app sees)

```bash
sudo kubectl -n rice exec deploy/backend -- env | sort
```

Filter out Kubernetes noise:

```bash
sudo kubectl -n rice exec deploy/backend -- env | sort | \
  grep -vE '^(KUBERNETES_|PATH=|HOME=|HOSTNAME=|NODE_VERSION=|YARN_|npm_)'
```

Coupon / payout related only:

```bash
sudo kubectl -n rice exec deploy/backend -- env | sort | \
  grep -E '^(COUPON_|RAZORPAY_|CORS_|JWT_|KALEYRA_|SUREPASS_|NODE_ENV|DB_)'
```

One variable:

```bash
sudo kubectl -n rice exec deploy/backend -- printenv COUPON_PAYOUT_ENABLED
```

### Secret keys only (safe — no values)

```bash
sudo kubectl -n rice get secret backend-env -o json | jq -r '.data | keys[]' | sort
```

### Decode one secret value

```bash
sudo kubectl -n rice get secret backend-env -o jsonpath='{.data.JWT_SECRET}' | base64 -d; echo
```

### One-liner from your Mac (read-only)

```bash
ssh -i ~/aws_keys/santkripa.pem ubuntu@3.6.49.120 \
  'sudo kubectl -n rice exec deploy/backend -- env | sort | grep COUPON'
```

---

## Why variables went missing

This command **replaces the entire secret** with only what is in the file:

```bash
kubectl create secret generic backend-env --from-env-file=.env ...
```

If `.env` is:

- your **local dev** file (incomplete), or
- an **outdated** server copy,

every key **not** in that file is **deleted** from production.

**Never** apply production secrets from your laptop `.env`.

---

## Safe workflow: add or change variables

Always start from **current production**, then add only what you need.

### 1. Export current production config

On the server:

```bash
ssh -i ~/aws_keys/santkripa.pem ubuntu@3.6.49.120
```

**Option A — from running pod** (recommended; matches effective runtime):

```bash
sudo kubectl -n rice exec deploy/backend -- env | sort | \
  grep -vE '^(KUBERNETES_|PATH=|HOME=|HOSTNAME=|NODE_VERSION=|YARN_|npm_)' \
  > ~/backend-env.prod
```

**Option B — from secret**:

```bash
sudo kubectl -n rice get secret backend-env -o json | \
  jq -r '.data | to_entries[] | "\(.key)=\(.value | @base64d)"' | sort \
  > ~/backend-env.prod
```

### 2. Edit the export (not local `.env`)

```bash
nano ~/backend-env.prod
```

Add or change only the lines you need. Example coupon additions:

```env
COUPON_PUBLIC_SMS_ENABLED=true
COUPON_PAYOUT_ENABLED=false
COUPON_EXPIRY_CRON_ENABLED=true
COUPON_PAYOUT_WORKER_INTERVAL_MS=300000
CORS_ORIGIN=https://your-redeem-site.com,https://riceops.adhraamrit.com
```

**Production rules:**

- Set `COUPON_PUBLIC_SMS_ENABLED=true` for real OTP SMS (requires Kaleyra vars).
- Razorpay vars only needed if `COUPON_PAYOUT_ENABLED=true`.
- Prefer no fixed OTP in production. If UAT needs it, set both `COUPON_PUBLIC_FIXED_OTP` (6 digits) and `COUPON_PUBLIC_FIXED_OTP_PHONES` (comma-separated 10-digit testers) — startup fails without the allowlist.

Do **not** paste your whole local `.env` over this file.

### 3. Apply secret and restart

```bash
sudo kubectl -n rice create secret generic backend-env \
  --from-env-file=$HOME/backend-env.prod \
  --dry-run=client -o yaml | \
  sudo kubectl -n rice apply -f -

sudo kubectl -n rice rollout restart deploy/backend
sudo kubectl -n rice rollout status deploy/backend --timeout=300s
```

### 4. Verify nothing was dropped

```bash
# Re-export and compare line counts or diff against backup
cp ~/backend-env.prod ~/backend-env.prod.bak   # before apply
# after apply, re-run export and diff

# Spot-check critical keys
sudo kubectl -n rice exec deploy/backend -- printenv \
  JWT_SECRET SUREPASS_API_TOKEN AWS_ACCESS_KEY_ID KALEYRA_API_KEY COUPON_PAYOUT_ENABLED
```

### 5. Sync server `.env` for next time

```bash
cp ~/backend-env.prod ~/Rice-soft-Backend/.env
chmod 600 ~/Rice-soft-Backend/.env
```

Future updates can start from this file **only if** it was produced by exporting prod (step 1), not copied from your Mac.

---

## Quick reference: one-liner apply (after editing on server)

```bash
ssh -i ~/aws_keys/santkripa.pem ubuntu@3.6.49.120 <<'EOF'
sudo kubectl -n rice create secret generic backend-env \
  --from-env-file=$HOME/backend-env.prod \
  --dry-run=client -o yaml | \
  sudo kubectl -n rice apply -f -
sudo kubectl -n rice rollout restart deploy/backend
sudo kubectl -n rice rollout status deploy/backend --timeout=300s
EOF
```

---

## Local vs production

| Topic | Local | Production |
|-------|-------|------------|
| Config file | `.env` on your Mac | K8s secret `backend-env` |
| `NODE_ENV` | `development` | `production` |
| `COUPON_PUBLIC_SMS_ENABLED` | often `false` (OTP logged in console) | `true` when going live |
| `DB_HOST` | `localhost` | `postgres` (from deployment YAML, not secret) |
| `CORS_ORIGIN` | localhost ports | real frontend URLs |

`env.template` is the checklist of variable **names**; use prod export for **values**.

---

## Coupon module variables (checklist)

See [`env.template`](../env.template) and [`COUPON_MODULE.md`](./COUPON_MODULE.md) for full detail.

| Variable | Prod notes |
|----------|------------|
| `JWT_SECRET` | Required; shared by admin auth and coupon public JWT |
| `CORS_ORIGIN` | Include redeem portal + admin frontend origins |
| `COUPON_PUBLIC_SMS_ENABLED` | `true` for real OTP |
| `KALEYRA_*` | Required when public SMS enabled |
| `SUREPASS_API_TOKEN` | Required for bank KYC at redeem |
| `COUPON_PAYOUT_ENABLED` | `false` until Razorpay is configured |
| `RAZORPAY_*` | Required when payout enabled |
| `COUPON_EXPIRY_CRON_ENABLED` | Optional background expiry job |
| `COUPON_PAYOUT_WORKER_INTERVAL_MS` | Payout worker poll interval |

---

## Troubleshooting

### Pod crashloops after env change

```bash
sudo kubectl -n rice logs deploy/backend --tail=100
```

Common causes:

- Invalid JSON or special characters in values (quote carefully in `.env` format)
- Missing required secret (e.g. `JWT_SECRET`, `DB_PASSWORD`)

### Roll back secret

If you kept `~/backend-env.prod.bak`:

```bash
sudo kubectl -n rice create secret generic backend-env \
  --from-env-file=$HOME/backend-env.prod.bak \
  --dry-run=client -o yaml | \
  sudo kubectl -n rice apply -f -
sudo kubectl -n rice rollout restart deploy/backend
```

### Env unchanged after edit

Secret updates require a pod restart. `deploy.sh` alone does not reload env if the secret was not updated.

---

## Related docs

- [DEPLOYMENT.md](../DEPLOYMENT.md) — deploy script and k8s operations
- [env.template](../env.template) — all variable names and dev defaults
- [COUPON_MODULE.md](./COUPON_MODULE.md) — coupon-specific behavior and APIs
