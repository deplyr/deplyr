#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# End-to-end smoke test against a real, dedicated test server: registers (or
# reuses) two throwaway projects — backend + frontend — a Postgres and a
# Redis, deploys both, and checks health/logs/external reachability. Meant
# to be run by hand after changes to the deploy pipeline, the agent, or
# anything database/domain related, since that's the stuff a unit test can't
# catch — it only breaks against a real box. See docs from the session that
# wrote this: it mirrors exactly what got tested by hand against
# abhilaksh-arora/deplyr-test-backend + deplyr-test-frontend.
#
# Usage:
#   cp scripts/e2e-test.env.example scripts/e2e-test.env   # once, then fill in
#   scripts/e2e-smoke-test.sh                       # rebuild agent, deploy, check
#   scripts/e2e-smoke-test.sh --skip-agent-build    # reuse the agent already running
#   scripts/e2e-smoke-test.sh --teardown            # delete the test projects + Redis
#
# Needs: your local API + worker running (apps/api/.env's DATABASE_URL is
# reused directly), jq, ssh, rsync, docker on the test box.
# ---------------------------------------------------------------------------

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  awk 'NR==1{next} /^set -euo/{exit} {sub(/^# ?/,""); print}' "${BASH_SOURCE[0]}"
  exit 0
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."
REPO_ROOT="$PWD"

CONFIG="$REPO_ROOT/scripts/e2e-test.env"
if [ ! -f "$CONFIG" ]; then
  echo "Missing $CONFIG — copy scripts/e2e-test.env.example and fill it in first." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$CONFIG"
[ -f "$REPO_ROOT/apps/api/.env" ] && source "$REPO_ROOT/apps/api/.env"
set +a

: "${TEST_SERVER_ID:?set in scripts/e2e-test.env}"
: "${TEST_USER_EMAIL:?set in scripts/e2e-test.env}"
: "${DEPLYR_SESSION_SECRET:?not found in apps/api/.env — is it set up?}"
: "${DATABASE_URL:?not found in apps/api/.env — is it set up?}"
DEPLYR_API_URL="${DEPLYR_API_URL:-http://localhost:4000}"
TEST_BACKEND_REPO="${TEST_BACKEND_REPO:-abhilaksh-arora/deplyr-test-backend}"
TEST_BACKEND_BRANCH="${TEST_BACKEND_BRANCH:-master}"
TEST_FRONTEND_REPO="${TEST_FRONTEND_REPO:-abhilaksh-arora/deplyr-test-frontend}"
TEST_FRONTEND_BRANCH="${TEST_FRONTEND_BRANCH:-master}"

SKIP_AGENT_BUILD=0
TEARDOWN=0
for arg in "$@"; do
  case "$arg" in
    --skip-agent-build) SKIP_AGENT_BUILD=1 ;;
    --teardown) TEARDOWN=1 ;;
    *) echo "unknown flag: $arg (try --help)" >&2; exit 1 ;;
  esac
done

PASS=()
FAIL=()
# stderr, not stdout: several helpers below (ensure_project, wait_deploy) are
# called via $(...) to capture a return value — anything they print to
# stdout would silently end up glued onto that value instead of the screen.
pass() { PASS+=("$1"); echo "  OK  $1" >&2; }
fail() { FAIL+=("$1"); echo "FAIL  $1" >&2; }
step() { echo >&2; echo "== $1 ==" >&2; }

api() {
  # api METHOD PATH [JSON_BODY]
  if [ -n "${3:-}" ]; then
    curl -sS -b "deplyr_session=$SESSION" -X "$1" "$DEPLYR_API_URL$2" -H "Content-Type: application/json" -d "$3"
  else
    curl -sS -b "deplyr_session=$SESSION" -X "$1" "$DEPLYR_API_URL$2"
  fi
}

# --- session ---------------------------------------------------------------
step "Minting a session for $TEST_USER_EMAIL"
MINT_SCRIPT="$REPO_ROOT/apps/api/.e2e-mint-session.ts"
trap 'rm -f "$MINT_SCRIPT"' EXIT
cat > "$MINT_SCRIPT" <<'TS'
import { db, users } from "@deplyr/db";
import { eq } from "drizzle-orm";
import { createSessionToken } from "./src/lib/session";
const email = process.argv[2];
const [user] = await db.select().from(users).where(eq(users.email, email));
if (!user) { console.error(`no user with email ${email}`); process.exit(1); }
console.log(await createSessionToken(user.id));
process.exit(0);
TS
SESSION=$(cd "$REPO_ROOT/apps/api" && bun run .e2e-mint-session.ts "$TEST_USER_EMAIL")
if [ -z "$SESSION" ]; then
  echo "could not mint a session — check TEST_USER_EMAIL, and that the local API/DB are up" >&2
  exit 1
fi
pass "session minted"

# --- server ------------------------------------------------------------------
step "Looking up test server"
SERVER_JSON=$(api GET "/servers/$TEST_SERVER_ID")
SERVER_IP=$(echo "$SERVER_JSON" | jq -r '.ipAddress // empty')
SERVER_STATUS=$(echo "$SERVER_JSON" | jq -r '.status // empty')
if [ -z "$SERVER_IP" ]; then
  fail "server $TEST_SERVER_ID not found (check TEST_SERVER_ID, and that TEST_USER_EMAIL owns it)"
  echo; echo "${#FAIL[@]} failed — stopping."; exit 1
fi
pass "server found: $SERVER_IP ($SERVER_STATUS)"
if [ "$SERVER_STATUS" != "connected" ]; then
  echo "server isn't connected — nothing else here will work" >&2
  exit 1
fi

# --- teardown, if asked ------------------------------------------------------
if [ "$TEARDOWN" = "1" ]; then
  step "Tearing down test projects"
  for repo in "$TEST_BACKEND_REPO" "$TEST_FRONTEND_REPO"; do
    id=$(api GET "/projects" | jq -r --arg r "$repo" '.[] | select(.githubRepo==$r) | .id')
    if [ -n "$id" ]; then
      api DELETE "/projects/$id" >/dev/null
      pass "deleted project for $repo"
    else
      echo "  (no project for $repo)"
    fi
  done
  DBID=$(api GET "/servers/$TEST_SERVER_ID/databases" | jq -r '.[] | select(.name=="test-redis") | .id')
  if [ -n "$DBID" ]; then
    api DELETE "/databases/$DBID" >/dev/null
    pass "deleted test-redis"
  fi
  echo; echo "Torn down."
  exit 0
fi

# --- agent rebuild (the "every time I push" part) ---------------------------
if [ "$SKIP_AGENT_BUILD" = "0" ]; then
  step "Rebuilding the agent from local source and swapping it in on $SERVER_IP"
  : "${TEST_SERVER_SSH_KEY:?set in scripts/e2e-test.env (or pass --skip-agent-build)}"
  KEY="${TEST_SERVER_SSH_KEY/#\~/$HOME}"
  SSH_OPTS=(-o StrictHostKeyChecking=no -o ConnectTimeout=10 -i "$KEY")

  ssh "${SSH_OPTS[@]}" "root@$SERVER_IP" "mkdir -p /root/deplyr-agent-build"
  rsync -azR --delete -e "ssh ${SSH_OPTS[*]}" \
    --exclude 'node_modules' --exclude '.git' --exclude '.next' --exclude 'dist' \
    package.json bun.lock apps/agent packages/config packages/shared-types infra/docker/agent.Dockerfile \
    "root@$SERVER_IP:/root/deplyr-agent-build/"

  if ssh "${SSH_OPTS[@]}" "root@$SERVER_IP" \
    "cd /root/deplyr-agent-build && docker build -q -f infra/docker/agent.Dockerfile -t deplyr-agent:e2e-test ." >/dev/null; then
    pass "agent image built"
  else
    fail "agent image build"
  fi

  AGENT_ENV=$(ssh "${SSH_OPTS[@]}" "root@$SERVER_IP" \
    "docker inspect deplyr-agent --format '{{range .Config.Env}}{{println .}}{{end}}'" \
    | grep -E '^DEPLYR_(TOKEN|SERVER_ID|CONTROL_PLANE_WS)=')
  ssh "${SSH_OPTS[@]}" "root@$SERVER_IP" "docker rm -f deplyr-agent >/dev/null 2>&1 || true"

  ENV_FLAGS=()
  while IFS= read -r line; do [ -n "$line" ] && ENV_FLAGS+=(-e "$line"); done <<< "$AGENT_ENV"
  ssh "${SSH_OPTS[@]}" "root@$SERVER_IP" "docker run -d --name deplyr-agent --restart unless-stopped --network host \
    -v /var/run/docker.sock:/var/run/docker.sock -v /var/lib/deplyr:/var/lib/deplyr \
    $(printf '%q ' "${ENV_FLAGS[@]}") deplyr-agent:e2e-test" >/dev/null

  sleep 4
  RECONNECTED=$(api GET "/servers/$TEST_SERVER_ID" | jq -r '.status')
  if [ "$RECONNECTED" = "connected" ]; then pass "agent rebuilt and reconnected"; else fail "agent didn't reconnect after rebuild (status: $RECONNECTED)"; fi
else
  step "Skipping agent rebuild (--skip-agent-build)"
fi

# --- projects ----------------------------------------------------------------
# Prints "id|created" or "id|reused" — nothing else — so it's safe to call
# via $(...). pass()/fail() happen back in the main shell (below), not in
# here: this runs in a subshell (command substitution), and array mutations
# made in a subshell never reach the parent, which would silently drop a
# real failure from the final tally.
ensure_project() {
  local repo="$1" branch="$2" name="$3" id
  id=$(api GET "/projects" | jq -r --arg r "$repo" '.[] | select(.githubRepo==$r) | .id')
  if [ -z "$id" ]; then
    id=$(api POST "/projects" "{\"serverId\":\"$TEST_SERVER_ID\",\"name\":\"$name\",\"githubRepo\":\"$repo\",\"githubBranch\":\"$branch\"}" | jq -r '.id')
    echo "$id|created"
  else
    echo "$id|reused"
  fi
}

step "Ensuring test projects exist"
IFS='|' read -r BACKEND_ID BACKEND_STATE <<< "$(ensure_project "$TEST_BACKEND_REPO" "$TEST_BACKEND_BRANCH" "test-backend")"
IFS='|' read -r FRONTEND_ID FRONTEND_STATE <<< "$(ensure_project "$TEST_FRONTEND_REPO" "$TEST_FRONTEND_BRANCH" "test-frontend")"
[ -n "$BACKEND_ID" ] && [ "$BACKEND_ID" != "null" ] && pass "backend project $BACKEND_STATE ($TEST_BACKEND_REPO)" || fail "could not register/find backend project"
[ -n "$FRONTEND_ID" ] && [ "$FRONTEND_ID" != "null" ] && pass "frontend project $FRONTEND_STATE ($TEST_FRONTEND_REPO)" || fail "could not register/find frontend project"

# --- databases -----------------------------------------------------------
step "Ensuring Postgres is attached to the backend"
HAS_DB=$(api GET "/projects/$BACKEND_ID/databases" | jq 'length')
if [ "$HAS_DB" = "0" ]; then
  api POST "/projects/$BACKEND_ID/databases" >/dev/null
  pass "created backend's Postgres"
else
  pass "backend already has a database"
fi

step "Ensuring a standalone Redis exists on the server"
REDIS_ID=$(api GET "/servers/$TEST_SERVER_ID/databases" | jq -r '.[] | select(.name=="test-redis") | .id')
if [ -z "$REDIS_ID" ]; then
  REDIS_ID=$(api POST "/servers/$TEST_SERVER_ID/databases" '{"type":"redis","name":"test-redis","version":"7"}' | jq -r '.id')
  pass "created test-redis"
else
  pass "reusing existing test-redis"
fi

step "Waiting for databases to come up"
PSTATUS="" RSTATUS=""
for _ in $(seq 1 20); do
  PSTATUS=$(api GET "/projects/$BACKEND_ID/databases" | jq -r '.[0].status // "missing"')
  RSTATUS=$(api GET "/databases/$REDIS_ID" | jq -r '.status // "missing"')
  [ "$PSTATUS" = "running" ] && [ "$RSTATUS" = "running" ] && break
  sleep 3
done
[ "$PSTATUS" = "running" ] && pass "postgres running" || fail "postgres stuck: $PSTATUS"
[ "$RSTATUS" = "running" ] && pass "redis running" || fail "redis stuck: $RSTATUS"

# --- wire secrets + deploy backend -------------------------------------------
step "Wiring REDIS_URL into the backend"
REDIS_CONN=$(api GET "/databases/$REDIS_ID/credentials" | jq -r '.connectionString')
api PUT "/projects/$BACKEND_ID/secrets" "{\"secrets\":[{\"key\":\"REDIS_URL\",\"value\":$(printf '%s' "$REDIS_CONN" | jq -Rs .)}]}" >/dev/null
pass "REDIS_URL set on backend"

wait_deploy() {
  # wait_deploy DEPLOY_ID LABEL PROJECT_ID
  local deploy_id="$1" label="$2" project_id="$3" status
  for _ in $(seq 1 40); do
    status=$(api GET "/projects/$project_id/deploys" | jq -r --arg id "$deploy_id" '.[] | select(.id==$id) | .status')
    if [ "$status" = "success" ]; then pass "$label deploy succeeded"; return 0; fi
    if [ "$status" = "failed" ]; then
      fail "$label deploy failed"
      api GET "/projects/$project_id/deploys" | jq -r --arg id "$deploy_id" \
        '.[] | select(.id==$id) | .steps[] | select(.status=="failed") | "  " + .name + ": " + .log'
      return 1
    fi
    sleep 5
  done
  fail "$label deploy timed out"
  return 1
}

step "Deploying backend"
BACKEND_DEPLOY=$(api POST "/projects/$BACKEND_ID/deploys" | jq -r '.id')
wait_deploy "$BACKEND_DEPLOY" "backend" "$BACKEND_ID" || true
BACKEND_PORT=$(api GET "/projects/$BACKEND_ID" | jq -r '.appPort')

# --- wire + deploy frontend --------------------------------------------------
step "Wiring BACKEND_URL (internal, same host network) into the frontend"
api PUT "/projects/$FRONTEND_ID/secrets" "{\"secrets\":[{\"key\":\"BACKEND_URL\",\"value\":\"http://127.0.0.1:$BACKEND_PORT\"}]}" >/dev/null
pass "BACKEND_URL set on frontend"

step "Deploying frontend"
FRONTEND_DEPLOY=$(api POST "/projects/$FRONTEND_ID/deploys" | jq -r '.id')
wait_deploy "$FRONTEND_DEPLOY" "frontend" "$FRONTEND_ID" || true
FRONTEND_PORT=$(api GET "/projects/$FRONTEND_ID" | jq -r '.appPort')

# --- reachability -------------------------------------------------------------
step "Checking each app directly on the box (bypasses the single bare-IP slot — see below)"
if [ -n "${TEST_SERVER_SSH_KEY:-}" ]; then
  KEY="${TEST_SERVER_SSH_KEY/#\~/$HOME}"
  SSH_OPTS=(-o StrictHostKeyChecking=no -o ConnectTimeout=10 -i "$KEY")
  BACKEND_HEALTH=$(ssh "${SSH_OPTS[@]}" "root@$SERVER_IP" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$BACKEND_PORT/health" || echo "000")
  FRONTEND_HEALTH=$(ssh "${SSH_OPTS[@]}" "root@$SERVER_IP" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$FRONTEND_PORT/health" || echo "000")
  [ "$BACKEND_HEALTH" = "200" ] && pass "backend /health (on-box) -> 200" || fail "backend /health (on-box) -> $BACKEND_HEALTH"
  [ "$FRONTEND_HEALTH" = "200" ] && pass "frontend /health (on-box) -> 200" || fail "frontend /health (on-box) -> $FRONTEND_HEALTH"
else
  echo "  (no TEST_SERVER_SSH_KEY — skipping on-box checks)"
fi

step "Checking external reachability (bare IP — no domain configured, so only one project holds it)"
EXTERNAL=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "http://$SERVER_IP/health" || echo "000")
if [ "$EXTERNAL" = "200" ]; then
  pass "http://$SERVER_IP/health -> 200 (whichever project deployed last — frontend, in this run)"
else
  fail "http://$SERVER_IP/health -> $EXTERNAL"
fi
echo "  Note: this is a known limitation, not a bug to chase — with no domain configured, nginx"
echo "  can only route bare-IP traffic to one project at a time (last deployed wins)."

# --- summary -------------------------------------------------------------------
echo
echo "======================================================================"
echo "  ${#PASS[@]} passed, ${#FAIL[@]} failed"
if [ "${#FAIL[@]}" -gt 0 ]; then
  printf '  FAILED: %s\n' "${FAIL[@]}"
  echo "======================================================================"
  exit 1
fi
echo "======================================================================"
