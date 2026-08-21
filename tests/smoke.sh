#!/usr/bin/env bash
set -euo pipefail
npm run build >/dev/null
node dist/apps/legacy-core/src/server.js >/tmp/legacycore-smoke.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
sleep 0.5
curl -fsS http://localhost:4173/search | grep -q 'MEMBER MAINTENANCE'
curl -fsS http://localhost:4173/member/12345 | grep -q 'Alice Carter'
curl -fsS http://localhost:4173/not-found?memberId=99999 | grep -q 'RECORD NOT FOUND'
curl -fsS http://localhost:4173/member/20002/accounts | grep -q 'ACCOUNT ACTIONS RESTRICTED'
curl -fsS http://localhost:4173/member/30003/permission-check | grep -q 'PERMISSION DENIED: OVERRIDE REQUIRED'
echo 'LegacyCore smoke tests: PASS'
