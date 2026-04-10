# Shared helpers for bin/ scripts. Source this, don't run it.
#   source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

# Track PIDs for cleanup
PIDS=()

# Usage: register_cleanup "label"
# Sets up a trap that kills all PIDs in PIDS[] on EXIT.
register_cleanup() {
  local label="${1:-script}"
  cleanup() {
    echo ""
    echo "[$label] Cleaning up..."
    if [[ ${#PIDS[@]} -gt 0 ]]; then
      for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null && wait "$pid" 2>/dev/null || true
      done
    fi
    echo "[$label] Done."
  }
  trap cleanup EXIT
}

# Usage: wait_for "label" "service name" "url" [max_wait_seconds]
wait_for() {
  local label="$1" name="$2" url="$3" max_wait="${4:-30}"
  local waited=0
  echo -n "[$label] Waiting for $name at $url "
  while ! curl -so /dev/null --connect-timeout 2 --max-time 3 -w '%{http_code}' "$url" 2>/dev/null | grep -q '^[23]'; do
    sleep 1
    waited=$((waited + 1))
    echo -n "."
    if [[ $waited -ge $max_wait ]]; then
      echo " TIMEOUT"
      echo "[$label] ERROR: $name did not start within ${max_wait}s"
      exit 1
    fi
  done
  echo " OK"
}
