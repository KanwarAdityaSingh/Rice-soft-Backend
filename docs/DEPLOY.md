# Deploy and verify (sales branch)

## 1. Deploy

Set your SSH key and run the deploy script. Migrations run automatically in Step 4.

```bash
# Optional: set if your key is not at ~/aws_keys/santkripa.pem or ~/.ssh/santkripa.pem
export AWS_KEY_PATH="$HOME/.ssh/your-actual-key.pem"

# Optional overrides
export REMOTE_HOST="ubuntu@3.6.49.120"
export REMOTE_DIR="~/Rice-soft-Backend"

./deploy.sh
```

**What deploy does:** Uploads code → builds Docker image → imports to k3s → **runs DB migrations** (Job `migrate`). The script runs `kubectl wait` in the background and **`kubectl logs -f` in the foreground** so init + migrate output streams in real time over SSH (background log-follow often buffers). Max wait is 15 minutes → restarts backend deployment → verifies health.

## 2. Verify deployment and migrations

From your machine (no SSH needed):

```bash
./scripts/test-deployment.sh
```

This hits the production API: health + sales-saudas, invoice-dispatches, inventory-ledger. If those routes respond (200 or 401), the app and migrations are live.

## 3. If SSH key is missing

Place your PEM key at `~/aws_keys/santkripa.pem` or `~/.ssh/santkripa.pem`, or set `AWS_KEY_PATH` to its path before running `./deploy.sh`.

## 4. Troubleshooting: `ErrImagePull` / `docker.io/library/rice-soft-backend`

The backend image is **built on the server and imported into k3s**, not pulled from Docker Hub. If the local image is missing, `imagePullPolicy: IfNotPresent` causes kubelet to try **Docker Hub** (`docker.io/library/rice-soft-backend:latest`), which fails.

Manifests use **`imagePullPolicy: Never`** for `rice-soft-backend:latest`. Deploy also **must not** run `crictl rmi --prune` immediately after import: the new image is unused until pods start, so prune was deleting it. Prune runs **before** import in `deploy.sh`.
