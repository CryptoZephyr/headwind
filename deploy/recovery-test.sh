set -e
cd /opt/headwind
H="sudo -u headwind env $(sudo cat /etc/headwind/env | grep -v '^#' | xargs) HEADWIND_DB=/var/lib/headwind/recovery-test.db"
echo "== prep"; AG=$(sudo -u headwind env $(sudo cat /etc/headwind/env | grep -v '^#' | xargs) npx tsx scripts/recovery-test/prep.ts)
echo "agency $AG"
echo "== cfo setup"; $H npx tsx scripts/cfo-setup.ts $AG 2>&1 | grep -v neatlogs | tail -4
echo "== reply"; $H npx tsx scripts/recovery-test/reply.ts 2>&1 | grep -v '^\[neatlogs' | tail -2
echo "== worker 1 (crash after assess)"; set +e; $H HEADWIND_FAULTS=crash_after_assess npx tsx worker/index.ts --once 2>&1 | grep -v '^\[neatlogs' | tail -4; echo "exit ${PIPESTATUS[0]}"; set -e
$H npx tsx scripts/recovery-test/state.ts 2>&1 | grep -v '^\[neatlogs'
echo "== waiting for lease expiry"; sleep 125
echo "== worker 2 (cfo answers lost after write)"; $H HEADWIND_FAULTS=cfo_timeout_after_write npx tsx worker/index.ts --once 2>&1 | grep -v '^\[neatlogs' | tail -4
$H npx tsx scripts/recovery-test/state.ts 2>&1 | grep -v '^\[neatlogs'
sleep 12
echo "== worker 3 (no faults)"; $H npx tsx worker/index.ts --once 2>&1 | grep -v '^\[neatlogs' | tail -4
$H npx tsx scripts/recovery-test/state.ts cfo 2>&1 | grep -v '^\[neatlogs'
