#!/bin/bash
set -euo pipefail

# Configuration
KEY_PATH="${AWS_KEY_PATH:-$HOME/aws_keys/santkripa.pem}"
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
    echo_error "SSH key not found at: $KEY_PATH"
    echo "Set AWS_KEY_PATH environment variable or place key at ~/aws_keys/santkripa.pem"
    exit 1
fi

echo_info "Starting deployment to $REMOTE_HOST"
echo_info "Using SSH key: $KEY_PATH"

# Step 1: Upload code
echo_info "Step 1/5: Uploading code to server..."
TAR_EXCLUDES=(--exclude='./node_modules' --exclude='./logs' --exclude='./.git' --exclude='./.DS_Store' --exclude='./.cursor' --exclude='./dist')

tar -czf - "${TAR_EXCLUDES[@]}" . | ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" "$REMOTE_HOST" \
    "set -euo pipefail; mkdir -p $REMOTE_DIR && cd $REMOTE_DIR && tar xzf -"

if [ $? -eq 0 ]; then
    echo_info "Code uploaded successfully"
else
    echo_error "Failed to upload code"
    exit 1
fi

# Step 1.5: Fix critical environment variables
echo_info "Step 1.5/5: Ensuring critical env vars are set..."
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" "$REMOTE_HOST" <<'EOS'
set -euo pipefail
cd ~/Rice-soft-Backend

# Ensure DB credentials are correct
sed -i 's/^DB_HOST=.*/DB_HOST=postgres/' .env || echo 'DB_HOST=postgres' >> .env
sed -i 's/^DB_PORT=.*/DB_PORT=5432/' .env || echo 'DB_PORT=5432' >> .env
sed -i 's/^DB_NAME=.*/DB_NAME=rice_soft_db/' .env || echo 'DB_NAME=rice_soft_db' >> .env
sed -i 's/^DB_USER=.*/DB_USER=postgres/' .env || echo 'DB_USER=postgres' >> .env
sed -i 's/^DB_PASSWORD=.*/DB_PASSWORD=postgres/' .env || echo 'DB_PASSWORD=postgres' >> .env

# Ensure CORS is set to production frontend
sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://riceops.adhraamrit.com|' .env || echo 'CORS_ORIGIN=https://riceops.adhraamrit.com' >> .env

echo "✓ DB credentials and CORS updated in .env"
EOS

# Step 2: Build Docker image
echo_info "Step 2/5: Building Docker image..."
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" "$REMOTE_HOST" <<'EOS'
set -euo pipefail
cd ~/Rice-soft-Backend

echo "Building Docker image..."
if sudo docker build -t rice-soft-backend:latest . 2>&1 | grep -E "(Step|Successfully|error|ERROR)" | tail -n 15; then
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
echo_info "Step 3/5: Importing image to k3s..."
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" "$REMOTE_HOST" <<'EOS'
set -euo pipefail
cd ~/Rice-soft-Backend

echo "Saving Docker image..."
sudo docker save rice-soft-backend:latest > backend.tar

echo "Importing to k3s..."
sudo k3s ctr images import backend.tar

echo "Cleaning up..."
rm -f backend.tar

echo "✓ Image imported to k3s"
EOS

# Step 4: Run database migrations
echo_info "Step 4/5: Running database migrations..."
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

echo "Waiting for migration to complete (45s)..."
sleep 45

echo "Checking migration job status..."
sudo kubectl -n rice get jobs --sort-by=.metadata.creationTimestamp | grep -E "migrate|NAME" | tail -n 4 || true

# Check if migration job completed
MIGRATE_JOB=$(sudo kubectl -n rice get jobs -o jsonpath='{.items[?(@.metadata.name=="migrate")].metadata.name}' 2>/dev/null || echo "")
if [ -n "$MIGRATE_JOB" ]; then
    SUCCEEDED=$(sudo kubectl -n rice get job migrate -o jsonpath='{.status.succeeded}' 2>/dev/null || echo "0")
    if [ "$SUCCEEDED" = "1" ]; then
        echo "✓ Migration completed successfully"
    else
        echo_warn "Migration job exists but may not have completed. Check logs if needed."
    fi
else
    echo_warn "Migration job not found. Migrations may need to be run manually."
fi
EOS

# Step 5: Update secret and restart backend deployment
echo_info "Step 5/5: Updating secret and restarting backend deployment..."
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" "$REMOTE_HOST" <<'EOS'
set -euo pipefail
cd ~/Rice-soft-Backend

echo "Updating Kubernetes secret with latest .env..."
sudo kubectl -n rice create secret generic backend-env \
  --from-env-file=.env \
  --dry-run=client -o yaml | \
  sudo kubectl -n rice apply -f -

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
echo_info "Verifying deployment..."
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

