# Deploy and verify (sales branch)

## 1. Deploy

Set your SSH key and run the deploy script. Migrations run automatically in Step 4.

```bash
# Required: path to your SSH key for the server
export AWS_KEY_PATH="$HOME/.ssh/your-key.pem"   # or ~/aws_keys/santkripa.pem

# Optional overrides
export REMOTE_HOST="ubuntu@3.6.49.120"
export REMOTE_DIR="~/Rice-soft-Backend"

./deploy.sh
```

**What deploy does:** Uploads code → builds Docker image → imports to k3s → **runs DB migrations** (Job `migrate`) → restarts backend deployment → verifies health.

## 2. Verify deployment and migrations

From your machine (no SSH needed):

```bash
./scripts/test-deployment.sh
```

This hits the production API: health + sales-saudas, invoice-dispatches, inventory-ledger. If those routes respond (200 or 401), the app and migrations are live.

## 3. If SSH key is missing

Place your PEM key at `~/aws_keys/santkripa.pem` or set `AWS_KEY_PATH` before running `./deploy.sh`.
