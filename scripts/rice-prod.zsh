# Rice Soft production helpers
# Source from ~/.zshrc:  source ~/Rice-soft-Backend/scripts/rice-prod.zsh

export RICE_SSH_KEY="${RICE_SSH_KEY:-$HOME/.ssh/santkripa.pem}"
export RICE_SSH_HOST="${RICE_SSH_HOST:-ubuntu@3.6.49.120}"
export RICE_REMOTE_DIR="${RICE_REMOTE_DIR:-~/Rice-soft-Backend}"
export RICE_K8S_NS="${RICE_K8S_NS:-rice}"

_rice_ssh() {
  ssh -o StrictHostKeyChecking=no -i "$RICE_SSH_KEY" "$RICE_SSH_HOST" "$@"
}

# Interactive SSH (needed for nano / psql)
_rice_ssh_tty() {
  ssh -t -o StrictHostKeyChecking=no -i "$RICE_SSH_KEY" "$RICE_SSH_HOST" "$@"
}

_rice_kubectl() {
  _rice_ssh "sudo kubectl -n $RICE_K8S_NS $*"
}

# SSH into the production box
alias rice-ssh='_rice_ssh'

# Repo path on the server
alias rice-cd='_rice_ssh "cd $RICE_REMOTE_DIR && pwd && ls"'

# View k8s backend env secret (decoded key=value). Careful: secrets on screen.
rice-env() {
  _rice_ssh "sudo kubectl -n $RICE_K8S_NS get secret backend-env -o go-template='{{range \$k,\$v := .data}}{{printf \"%s=%s\\n\" \$k (\$v | base64decode)}}{{end}}'"
}

# List a single env key (safer than dumping everything)
# Usage: rice-env-get CASHFREE_CLIENT_ID
rice-env-get() {
  if [ -z "${1:-}" ]; then
    echo "Usage: rice-env-get KEY_NAME" >&2
    return 1
  fi
  _rice_ssh "sudo kubectl -n $RICE_K8S_NS get secret backend-env -o jsonpath='{.data.$1}' | base64 -d; echo"
}

# Edit prod env with nano on the server (~/backend-env.prod).
# Creates the file from the live secret if missing.
rice-env-edit() {
  _rice_ssh_tty 'set -e
    if [ ! -f "$HOME/backend-env.prod" ]; then
      echo "Creating ~/backend-env.prod from live backend-env secret..."
      sudo kubectl -n rice get secret backend-env -o go-template='"'"'{{range $k,$v := .data}}{{printf "%s=%s\n" $k ($v | base64decode)}}{{end}}'"'"' > "$HOME/backend-env.prod"
      chmod 600 "$HOME/backend-env.prod"
    fi
    nano "$HOME/backend-env.prod"
    echo
    echo "Edited ~/backend-env.prod — run rice-env-apply to push to k8s + restart backend."
  '
}
alias rice-env-nano='rice-env-edit'

# Apply ~/backend-env.prod → secret backend-env, then restart backend
rice-env-apply() {
  _rice_ssh 'set -euo pipefail
    if [ ! -f "$HOME/backend-env.prod" ]; then
      echo "Missing ~/backend-env.prod — run rice-env-edit first." >&2
      exit 1
    fi
    cp "$HOME/backend-env.prod" "$HOME/backend-env.prod.bak"
    sudo kubectl -n rice create secret generic backend-env \
      --from-env-file="$HOME/backend-env.prod" \
      --dry-run=client -o yaml | sudo kubectl apply -f -
    cp "$HOME/backend-env.prod" "$HOME/Rice-soft-Backend/.env" 2>/dev/null || true
    sudo kubectl -n rice rollout restart deploy/backend
    sudo kubectl -n rice rollout status deploy/backend --timeout=180s
    echo "✓ backend-env applied and backend restarted"
  '
}

# Interactive psql into prod Postgres
rice-db() {
  _rice_ssh_tty 'POD=$(sudo kubectl -n rice get pods -l app=postgres -o jsonpath="{.items[0].metadata.name}")
    if [ -z "$POD" ]; then
      echo "No postgres pod found" >&2
      exit 1
    fi
    DB=$(sudo kubectl -n rice get secret postgres-secret -o jsonpath="{.data.POSTGRES_DB}" | base64 -d)
    USER=$(sudo kubectl -n rice get secret postgres-secret -o jsonpath="{.data.POSTGRES_USER}" | base64 -d)
    echo "Connecting to $POD → $USER@$DB"
    sudo kubectl -n rice exec -it "$POD" -- psql -U "$USER" -d "$DB"
  '
}

# One-shot SQL (non-interactive)
# Usage: rice-db-query "SELECT count(*) FROM sales_saudas;"
rice-db-query() {
  if [ -z "${1:-}" ]; then
    echo 'Usage: rice-db-query "SELECT ..."' >&2
    return 1
  fi
  local sql="$1"
  _rice_ssh "POD=\$(sudo kubectl -n rice get pods -l app=postgres -o jsonpath='{.items[0].metadata.name}'); \
    DB=\$(sudo kubectl -n rice get secret postgres-secret -o jsonpath='{.data.POSTGRES_DB}' | base64 -d); \
    USER=\$(sudo kubectl -n rice get secret postgres-secret -o jsonpath='{.data.POSTGRES_USER}' | base64 -d); \
    sudo kubectl -n rice exec \"\$POD\" -- psql -U \"\$USER\" -d \"\$DB\" -c $(printf '%q' "$sql")"
}

# Pods overview
alias rice-pods='_rice_kubectl "get pods -o wide"'

# Backend deployment pods only
alias rice-backend='_rice_kubectl "get pods -l app=backend -o wide"'

# Follow backend app logs
alias rice-logs='_rice_kubectl "logs -f deploy/backend --tail=100"'

# Recent backend logs (no follow)
alias rice-logs-tail='_rice_kubectl "logs deploy/backend --tail=200 --timestamps"'

# Migration job status
alias rice-migrate-status='_rice_kubectl "get pods -l job-name=migrate -o wide; echo; sudo kubectl -n '"$RICE_K8S_NS"' get job migrate -o wide 2>/dev/null || true"'

# Follow migration logs
alias rice-migrate-logs='_rice_kubectl "logs -f job/migrate --all-containers=true --timestamps"'

# Last migration logs (no follow) + describe if Error
rice-migrate-debug() {
  _rice_ssh "sudo kubectl -n $RICE_K8S_NS get pods -l job-name=migrate -o wide; echo '==== LOGS ===='; sudo kubectl -n $RICE_K8S_NS logs job/migrate --all-containers=true --timestamps --tail=100 2>&1; echo '==== DESCRIBE ===='; sudo kubectl -n $RICE_K8S_NS describe pod -l job-name=migrate 2>&1 | tail -n 60"
}

# Rollout status
alias rice-rollout='_rice_kubectl "rollout status deploy/backend --timeout=120s; get pods -l app=backend"'

# Deploy from local repo (run from anywhere)
alias rice-deploy='(cd ~/Rice-soft-Backend && ./deploy.sh)'

# Print available shortcuts
rice-help() {
  cat <<'EOF'
Rice Soft prod shortcuts:
  rice-ssh              SSH into prod box
  rice-pods             All pods in rice namespace
  rice-backend          Backend pods only
  rice-logs             Follow backend logs
  rice-logs-tail        Last 200 backend log lines
  rice-migrate-status   Migration job/pod status
  rice-migrate-logs     Follow migration logs
  rice-migrate-debug    Status + logs + describe (for failed migrate)
  rice-env              Dump backend-env secret (sensitive)
  rice-env-get KEY      Print one env var
  rice-env-edit         nano ~/backend-env.prod on server (alias: rice-env-nano)
  rice-env-apply        Apply that file → k8s secret + restart backend
  rice-db               Interactive psql into prod Postgres
  rice-db-query "SQL"   Run one SQL statement
  rice-rollout          Backend rollout status
  rice-deploy           Run ./deploy.sh from ~/Rice-soft-Backend
  rice-help             This help
EOF
}
