#!/usr/bin/env bash
# Run in a separate terminal after deploy — NOT part of deploy.sh.
# Prints backend pods, node disk pressure, recent events, and log tail from running backend pod.
set -euo pipefail
KEY="${AWS_KEY_PATH:-$HOME/.ssh/santkripa.pem}"
HOST="${REMOTE_HOST:-ubuntu@3.6.49.120}"
NS="${K8S_NAMESPACE:-rice}"

if [ ! -f "$KEY" ]; then
  echo "SSH key not found: $KEY (set AWS_KEY_PATH)"
  exit 1
fi

ssh -o StrictHostKeyChecking=no -i "$KEY" "$HOST" bash -s <<REMOTE
set -e
echo "========== Node disk / pressure =========="
df -h / 2>/dev/null || true
sudo kubectl get node -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{range .status.conditions[*]}{.type}={.status} {.reason}{"\n"}{end}{end}' 2>/dev/null || true
echo
echo "========== Pods app=backend ($NS) =========="
sudo kubectl -n "$NS" get pods -l app=backend -o wide 2>/dev/null || true
echo
echo "========== Recent events ($NS) =========="
sudo kubectl -n "$NS" get events --sort-by='.lastTimestamp' 2>/dev/null | tail -n 25 || true
echo
POD=\$(sudo kubectl -n "$NS" get pods -l app=backend --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
if [ -n "\${POD:-}" ]; then
  echo "========== Logs: \$POD (last 150 lines) =========="
  sudo kubectl -n "$NS" logs "\$POD" --tail=150 2>&1 || true
else
  echo "No Running backend pod — trying last non-evicted pod with logs..."
  POD=\$(sudo kubectl -n "$NS" get pods -l app=backend --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1].metadata.name}' 2>/dev/null || true)
  if [ -n "\${POD:-}" ]; then
    echo "========== describe \$POD =========="
    sudo kubectl -n "$NS" describe pod "\$POD" 2>&1 | tail -n 35
  fi
fi
echo
echo "========== migrate job (if any) =========="
sudo kubectl -n "$NS" get job migrate -o wide 2>/dev/null || true
sudo kubectl -n "$NS" logs job/migrate --all-containers --tail=80 2>/dev/null || echo "(no migrate job logs)"
REMOTE
