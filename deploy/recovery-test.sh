set -euo pipefail
cd /opt/headwind
TEST_DB=/var/lib/headwind/recovery-test.db
trap 'sudo rm -f "$TEST_DB" "$TEST_DB-shm" "$TEST_DB-wal"' EXIT
ENV="sudo -u headwind env $(sudo cat /etc/headwind/env | grep -v '^#' | xargs)"
H="$ENV HEADWIND_DB=$TEST_DB"
quiet() { grep -v '^\[neatlogs' | tail -"$1" || true; }
echo "== prep"; AG=$($ENV npx tsx scripts/recovery-test/prep.ts)
echo "agency $AG"
echo "== cfo setup"; $H npx tsx scripts/cfo-setup.ts "$AG" 2>&1 | quiet 4
echo "== reply"; $H npx tsx scripts/recovery-test/reply.ts 2>&1 | quiet 2
echo "== worker 1 (crash after assess)"
set +e; $H HEADWIND_FAULTS=crash_after_assess npx tsx worker/index.ts --once 2>&1 | quiet 4; code=${PIPESTATUS[0]}; set -e
echo "exit $code"; [ "$code" -eq 75 ] || { echo "worker 1 should exit 75 after the simulated crash"; exit 1; }
$H npx tsx scripts/recovery-test/state.ts 2>&1 | quiet 20
echo "== waiting for lease expiry"; sleep 125
echo "== worker 2 (cfo answers lost after write)"; $H HEADWIND_FAULTS=cfo_timeout_after_write npx tsx worker/index.ts --once 2>&1 | quiet 4
$H npx tsx scripts/recovery-test/state.ts 2>&1 | quiet 20
sleep 12
echo "== worker 3 (no faults)"; $H npx tsx worker/index.ts --once 2>&1 | quiet 4
$H npx tsx scripts/recovery-test/state.ts cfo 2>&1 | quiet 40
