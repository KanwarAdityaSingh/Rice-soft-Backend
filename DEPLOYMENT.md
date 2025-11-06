# Deployment Guide

This guide explains how to deploy the Rice Soft Backend to production using k3s on EC2.

## Quick Deployment

Run the deployment script:

```bash
./deploy.sh
```

The script will:
1. Upload latest code to the server
2. Build Docker image
3. Import image to k3s
4. Run database migrations
5. Restart backend deployment
6. Verify deployment

## Prerequisites

1. **SSH Key**: Place your SSH key at `~/aws_keys/santkripa.pem` or set `AWS_KEY_PATH` environment variable
2. **Server Access**: SSH access to `ubuntu@3.6.49.120` (or set `REMOTE_HOST` environment variable)
3. **k3s**: Kubernetes (k3s) must be installed and running on the server
4. **PostgreSQL**: Database must be running in the `rice` namespace

## Configuration

You can customize the deployment by setting environment variables:

```bash
export AWS_KEY_PATH=/path/to/your/key.pem
export REMOTE_HOST=user@your-server.com
export REMOTE_DIR=~/Rice-soft-Backend
./deploy.sh
```

## Manual Deployment Steps

If you need to deploy manually:

### 1. Upload Code

```bash
tar -czf - --exclude='./node_modules' --exclude='./logs' --exclude='./.git' . | \
  ssh -i ~/aws_keys/santkripa.pem ubuntu@3.6.49.120 \
  'cd ~/Rice-soft-Backend && tar xzf -'
```

### 2. Build Docker Image

```bash
ssh -i ~/aws_keys/santkripa.pem ubuntu@3.6.49.120 <<'EOF'
cd ~/Rice-soft-Backend
sudo docker build -t rice-soft-backend:latest .
sudo docker save rice-soft-backend:latest > backend.tar
sudo k3s ctr images import backend.tar
rm backend.tar
EOF
```

### 3. Run Migrations

```bash
ssh -i ~/aws_keys/santkripa.pem ubuntu@3.6.49.120 <<'EOF'
cd ~/Rice-soft-Backend
sudo kubectl -n rice delete job migrate 2>/dev/null || true
sudo kubectl -n rice apply -f k8s/migrate-job.yaml
# Wait for completion
sudo kubectl -n rice wait --for=condition=complete job/migrate --timeout=300s
EOF
```

### 4. Restart Backend

```bash
ssh -i ~/aws_keys/santkripa.pem ubuntu@3.6.49.120 <<'EOF'
sudo kubectl -n rice rollout restart deploy/backend
sudo kubectl -n rice rollout status deploy/backend --timeout=300s
EOF
```

### 5. Verify

```bash
curl -sk https://api.adhraamrit.com/api/v1/health
```

## Updating Environment Variables

If you need to update environment variables:

1. Edit `.env` file on the server:
```bash
ssh -i ~/aws_keys/santkripa.pem ubuntu@3.6.49.120 'nano ~/Rice-soft-Backend/.env'
```

2. Update Kubernetes secret:
```bash
ssh -i ~/aws_keys/santkripa.pem ubuntu@3.6.49.120 <<'EOF'
cd ~/Rice-soft-Backend
sudo kubectl -n rice create secret generic backend-env \
  --from-env-file=.env \
  --dry-run=client -o yaml | \
  sudo kubectl -n rice apply -f -
sudo kubectl -n rice rollout restart deploy/backend
EOF
```

## Troubleshooting

### Check Pod Status

```bash
ssh -i ~/aws_keys/santkripa.pem ubuntu@3.6.49.120 \
  'sudo kubectl -n rice get pods -l app=backend'
```

### View Pod Logs

```bash
ssh -i ~/aws_keys/santkripa.pem ubuntu@3.6.49.120 <<'EOF'
POD=$(sudo kubectl -n rice get pods -l app=backend --sort-by=.metadata.creationTimestamp | tail -n1 | awk '{print $1}')
sudo kubectl -n rice logs "$POD" --tail=50
EOF
```

### Check Migration Status

```bash
ssh -i ~/aws_keys/santkripa.pem ubuntu@3.6.49.120 \
  'sudo kubectl -n rice get jobs migrate && sudo kubectl -n rice logs job/migrate'
```

### Restart Failed Pods

```bash
ssh -i ~/aws_keys/santkripa.pem ubuntu@3.6.49.120 \
  'sudo kubectl -n rice delete pods -l app=backend --force --grace-period=0'
```

## Production URLs

- **API**: https://api.adhraamrit.com/api/v1
- **Frontend**: https://riceops.adhraamrit.com
- **Health Check**: https://api.adhraamrit.com/api/v1/health

## Database Migrations

Migrations are automatically run during deployment. The migration job:
- Checks for new SQL files in `src/database/migrations/`
- Only runs migrations that haven't been executed
- Tracks executed migrations in the `schema_migrations` table

To manually run migrations:

```bash
ssh -i ~/aws_keys/santkripa.pem ubuntu@3.6.49.120 <<'EOF'
cd ~/Rice-soft-Backend
sudo kubectl -n rice delete job migrate 2>/dev/null || true
sudo kubectl -n rice apply -f k8s/migrate-job.yaml
EOF
```

## Notes

- The deployment script automatically excludes `node_modules`, `logs`, `.git`, and `.cursor` directories
- Docker images are built with multi-stage builds for optimal size
- Migrations are idempotent - safe to run multiple times
- The backend automatically restarts when the secret is updated

