#!/bin/bash
set -euo pipefail

# Configuration: try AWS_KEY_PATH, then common key locations
if [ -n "${AWS_KEY_PATH:-}" ] && [ -f "${AWS_KEY_PATH}" ]; then
  KEY_PATH="$AWS_KEY_PATH"
elif [ -f "$HOME/aws_keys/santkripa.pem" ]; then
  KEY_PATH="$HOME/aws_keys/santkripa.pem"
elif [ -f "$HOME/.ssh/santkripa.pem" ]; then
  KEY_PATH="$HOME/.ssh/santkripa.pem"
else
  KEY_PATH="${AWS_KEY_PATH:-$HOME/aws_keys/santkripa.pem}"
fi
REMOTE_HOST="${REMOTE_HOST:-ubuntu@3.6.49.120}"
REMOTE_DIR="${REMOTE_DIR:-~/Rice-soft-Backend}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if key file exists
if [ ! -f "$KEY_PATH" ]; then
    echo_error "SSH key not found."
    echo "Set AWS_KEY_PATH to your PEM path, or place the key at:"
    echo "  ~/aws_keys/santkripa.pem  or  ~/.ssh/santkripa.pem"
    exit 1
fi

echo_info "Starting deployment to $REMOTE_HOST"
echo_info "Using SSH key: $KEY_PATH"

# Step 1: Upload code
echo_info "Step 1/6: Uploading code to server..."
TAR_EXCLUDES=(--exclude='./node_modules' --exclude='./logs' --exclude='./.git' --exclude='./.DS_Store' --exclude='./.cursor' --exclude='./dist')

# Wipe remote src/dist before extract. Plain `tar x` does not delete files removed locally
# (e.g. razorpay-*.ts), so stale sources kept breaking `tsc` while Docker still "succeeded".
# macOS: omit AppleDouble/xattrs from the stream so Linux tar/npm do not spam LIBARCHIVE.xattr warnings
COPYFILE_DISABLE=1 tar -czf - "${TAR_EXCLUDES[@]}" . | ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" "$REMOTE_HOST" \
    "set -euo pipefail; mkdir -p $REMOTE_DIR && cd $REMOTE_DIR && rm -rf src dist && tar xzf -"

if [ $? -eq 0 ]; then
    echo_info "Code uploaded successfully"
else
    echo_error "Failed to upload code"
    exit 1
fi

# Step 2: Build Docker image
echo_info "Step 2/6: Building Docker image..."
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" "$REMOTE_HOST" <<'EOS'
set -euo pipefail
cd ~/Rice-soft-Backend

echo "Building Docker image..."
if sudo docker build -t rice-soft-backend:latest .; then
    echo "✓ Docker image built successfully"
else
    echo "✗ Docker build failed"
    exit 1
fi
EOS

if [ $? -ne 0 ]; then
    echo_error "Docker build failed"
    exit 1
fi

# Step 3: Import image to k3s
echo_info "Step 3/6: Importing image to k3s..."
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" "$REMOTE_HOST" <<'EOS'
set -euo pipefail
cd ~/Rice-soft-Backend

# Prune BEFORE import only. crictl rmi --prune AFTER import deletes the image we just loaded:
# it is "unused" until a pod runs, so the migrate job would then pull docker.io/library/... and fail.
echo "Pruning Docker + old containerd images (before import; frees space without dropping new image)..."
sudo docker builder prune -f 2>/dev/null || true
sudo docker image prune -f 2>/dev/null || true
sudo k3s crictl rmi --prune 2>/dev/null || true

echo "Saving Docker image..."
sudo docker save rice-soft-backend:latest > backend.tar

echo "Importing to k3s..."
sudo k3s ctr images import backend.tar

echo "Cleaning up tarball..."
rm -f backend.tar

df -h / | tail -n 1
echo "✓ Image imported to k3s"
EOS

# Step 4: Run database migrations
echo_info "Step 4/6: Running database migrations..."
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" "$REMOTE_HOST" <<'EOS'
set -euo pipefail

JOB_NAME="migrate-$(date +%s)"

echo "Creating migration job..."
sudo kubectl -n rice delete job migrate 2>/dev/null || true

# Create migration job using the manifest
cd ~/Rice-soft-Backend
sudo kubectl -n rice apply -f k8s/migrate-job.yaml || {
    echo "Creating migration job manually..."
    sudo kubectl -n rice create job "$JOB_NAME" \
        --image=rice-soft-backend:latest \
        --env-from=secret/backend-env \
        -- node dist/database/migrations/run-migrations.js || true
}

echo "Waiting for migrate pod (up to 120s)..."
i=0
while [ "$i" -lt 120 ]; do
  if sudo kubectl -n rice get pods -l job-name=migrate -o name 2>/dev/null | grep -q .; then
    echo "Pod is up."
    break
  fi
  i=$((i + 1))
  sleep 1
done

# Run `kubectl wait` in the background and stream logs in the FOREGROUND.
# Background `kubectl logs -f &` often buffers over SSH, so you saw no output until wait ended.
echo "Starting job waiter (15m max) and streaming migration logs below..."
sudo kubectl -n rice wait --for=condition=complete job/migrate --timeout=900s &
WAITPID=$!

echo "========== LIVE MIGRATION LOGS (init + migrate) — foreground stream =========="
set +e
if sudo kubectl -n rice get pods -l job-name=migrate -o name 2>/dev/null | grep -q .; then
  sudo kubectl -n rice logs -f job/migrate --all-containers=true --timestamps 2>&1
else
  echo "[WARN] No migrate pod yet — polling pod status until job finishes..."
  while kill -0 "$WAITPID" 2>/dev/null; do
    sudo kubectl -n rice get pods -l job-name=migrate -o wide 2>/dev/null || true
    sleep 5
  done
fi

wait "$WAITPID"
WAIT_EXIT=$?
set -e
echo "========== END LIVE MIGRATION LOGS =========="

if [ "$WAIT_EXIT" -eq 0 ]; then
    echo "✓ Migration job completed successfully"
else
    echo "[ERROR] Migration job did not complete (timeout or failed)."
    echo "=== Pods for job migrate ==="
    sudo kubectl -n rice get pods -l job-name=migrate -o wide 2>/dev/null || true
    echo "=== Describe pods ==="
    sudo kubectl -n rice describe pod -l job-name=migrate 2>/dev/null || true
    echo "=== Job migrate logs (all containers) ==="
    sudo kubectl -n rice logs job/migrate --all-containers=true --tail=200 2>/dev/null || true
    echo "=== Job describe ==="
    sudo kubectl -n rice describe job migrate 2>/dev/null || true
    exit 1
fi

sudo kubectl -n rice get job migrate -o wide
EOS

# Step 5: Restart backend deployment
echo_info "Step 5/6: Restarting backend deployment..."
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" "$REMOTE_HOST" <<'EOS'
set -euo pipefail
cd ~/Rice-soft-Backend

echo "Applying backend manifest (imagePullPolicy, resources) from repo..."
sudo kubectl apply -f k8s/backend-deployment.yaml

echo "Restarting backend deployment..."
sudo kubectl -n rice rollout restart deploy/backend

echo "Waiting for rollout to complete (max 5 minutes)..."
if sudo kubectl -n rice rollout status deploy/backend --timeout=300s; then
    echo "✓ Deployment successful"
else
    echo "⚠ Deployment timeout or issue occurred"
    echo "Checking pod status..."
    sudo kubectl -n rice get pods -l app=backend
    exit 1
fi
EOS

if [ $? -ne 0 ]; then
    echo_error "Deployment failed"
    exit 1
fi

# Step 6: Verify deployment
echo_info "Step 6/6: Verifying deployment..."
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" "$REMOTE_HOST" <<'EOS'
set -euo pipefail

echo "Waiting for pods to be ready (10s)..."
sleep 10

echo "=== Pod Status ==="
sudo kubectl -n rice get pods -l app=backend | head -n 5

echo
echo "=== Testing API Health ==="
if curl -sk -o /dev/null -w "Health check: %{http_code}\n" https://api.adhraamrit.com/api/v1/health; then
    echo "✓ API is responding"
else
    echo "✗ API health check failed"
    exit 1
fi

echo
echo "=== Recent Pod Logs (last 10 lines) ==="
POD=$(sudo kubectl -n rice get pods -l app=backend --sort-by=.metadata.creationTimestamp | tail -n1 | awk '{print $1}')
if [ -n "$POD" ]; then
    sudo kubectl -n rice logs "$POD" --tail=10 || true
fi
EOS

echo
echo_info "Deployment completed successfully!"
echo_info "API URL: https://api.adhraamrit.com/api/v1"
echo_info "Frontend URL: https://riceops.adhraamrit.com"

