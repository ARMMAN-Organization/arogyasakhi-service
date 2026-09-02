#!/usr/bin/env bash
# Smoke-test: triggers a CLOSURE_REVIEW_UPDATE notification for a Sakhi by
# creating a closure card and having a Supervisor reject it, then verifies
# the notification landed. Mirrors test-visit-summary-by-sakhi.sh's approach
# (no e2e convention in this repo yet) — curls the real HTTP routes directly
# through the API gateway, runnable ad hoc.
#
# Requires a running stack reachable through the gateway: api-gateway,
# auth-service, closure-reopen-service, beneficiary-service (for looking up
# a beneficiaryId), and notification-escalation-service.
#
# SAKHI_USERNAME/PASSWORD and SUPERVISOR_USERNAME/PASSWORD default to this
# repo's seeded local users (sakhi.test / supervisor.test, both Test@1234).
# Override with env vars to point at different accounts (e.g. test.sakhi),
# provided they're seeded via auth-service's SAKHI/SUPERVISOR env JSON first.
#
#   SAKHI_USERNAME=test.sakhi SAKHI_PASSWORD=Test@1234 \
#   SUPERVISOR_USERNAME=pemma.deshmukh SUPERVISOR_PASSWORD='Supervisor#2026' \
#   ./test-closure-reject-notification.sh

set -u

BASE_URL="${BASE_URL:-http://localhost:3000}"

SAKHI_USERNAME="${SAKHI_USERNAME:-sakhi.test}"
SAKHI_PASSWORD="${SAKHI_PASSWORD:-Test@1234}"
SUPERVISOR_USERNAME="${SUPERVISOR_USERNAME:-supervisor.test}"
SUPERVISOR_PASSWORD="${SUPERVISOR_PASSWORD:-Test@1234}"

CLOSURE_TYPE="${CLOSURE_TYPE:-NON_MEDICAL}"
CLOSURE_REASON_LOOKUP_VALUE_ID="${CLOSURE_REASON_LOOKUP_VALUE_ID:-}"

PASS=0
FAIL=0

step() { echo; echo "== $1 =="; }

check() {
  local name="$1" ok="$2"
  if [ "$ok" = "1" ]; then
    echo "PASS  $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL  $name"
    FAIL=$((FAIL + 1))
  fi
}

# Extracts a dotted JSON path from stdin via Node (no jq dependency).
# Prints "" if the path is missing/undefined.
json_get() {
  local path="$1"
  node -e '
    let input = "";
    process.stdin.on("data", d => input += d);
    process.stdin.on("end", () => {
      try {
        const data = JSON.parse(input);
        const val = process.argv[1].split(".").reduce((o, k) => (o == null ? o : o[k]), data);
        process.stdout.write(val === undefined || val === null ? "" : String(val));
      } catch {
        process.stdout.write("");
      }
    });
  ' "$path"
}

# base64url JWT payload decode (no signature verification — local smoke test only)
jwt_claim() {
  local token="$1" claim="$2"
  node -e '
    const [token, claim] = process.argv.slice(1);
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
      const val = payload[claim];
      process.stdout.write(val === undefined || val === null ? "" : String(val));
    } catch {
      process.stdout.write("");
    }
  ' "$token" "$claim"
}

login() {
  local username="$1" password="$2"
  curl -s -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$username\",\"password\":\"$password\"}"
}

step "Logging in as Sakhi ($SAKHI_USERNAME)"
SAKHI_LOGIN="$(login "$SAKHI_USERNAME" "$SAKHI_PASSWORD")"
SAKHI_TOKEN="$(echo "$SAKHI_LOGIN" | json_get data.accessToken)"
SAKHI_PROJECT_ID="$(echo "$SAKHI_LOGIN" | json_get data.projectId)"
check "Sakhi login succeeded" "$([ -n "$SAKHI_TOKEN" ] && echo 1 || echo 0)"
if [ -z "$SAKHI_TOKEN" ]; then
  echo "      response: $SAKHI_LOGIN"
  echo "Aborting: cannot continue without a Sakhi token."
  exit 1
fi
SAKHI_USER_ID="$(jwt_claim "$SAKHI_TOKEN" sub)"

step "Logging in as Supervisor ($SUPERVISOR_USERNAME)"
SUPERVISOR_LOGIN="$(login "$SUPERVISOR_USERNAME" "$SUPERVISOR_PASSWORD")"
SUPERVISOR_TOKEN="$(echo "$SUPERVISOR_LOGIN" | json_get data.accessToken)"
SUPERVISOR_PROJECT_ID="$(echo "$SUPERVISOR_LOGIN" | json_get data.projectId)"
check "Supervisor login succeeded" "$([ -n "$SUPERVISOR_TOKEN" ] && echo 1 || echo 0)"
if [ -z "$SUPERVISOR_TOKEN" ]; then
  echo "      response: $SUPERVISOR_LOGIN"
  echo "Aborting: cannot continue without a Supervisor token."
  exit 1
fi
SUPERVISOR_USER_ID="$(jwt_claim "$SUPERVISOR_TOKEN" sub)"

SAKHI_AUTH=(-H "Authorization: Bearer $SAKHI_TOKEN")
SAKHI_HEADERS=(
  -H "x-armman-user-id: $SAKHI_USER_ID"
  -H "x-armman-roles: SAKHI"
  -H "x-armman-project-id: $SAKHI_PROJECT_ID"
)
SUPERVISOR_AUTH=(-H "Authorization: Bearer $SUPERVISOR_TOKEN")
SUPERVISOR_HEADERS=(
  -H "x-armman-user-id: $SUPERVISOR_USER_ID"
  -H "x-armman-roles: SUPERVISOR"
  -H "x-armman-project-id: $SUPERVISOR_PROJECT_ID"
)

step "Looking up a beneficiary owned by the Sakhi"
BENEFICIARIES="$(curl -s "$BASE_URL/api/v1/beneficiaries?sakhiId=$SAKHI_USER_ID" \
  "${SAKHI_AUTH[@]}" "${SAKHI_HEADERS[@]}")"
BENEFICIARY_ID="$(echo "$BENEFICIARIES" | json_get data.0.id)"
check "Found a beneficiary for the Sakhi" "$([ -n "$BENEFICIARY_ID" ] && echo 1 || echo 0)"
if [ -z "$BENEFICIARY_ID" ]; then
  echo "      response: $BENEFICIARIES"
  echo "Aborting: no beneficiary found — register one via POST /api/v1/beneficiaries first."
  exit 1
fi

if [ -z "$CLOSURE_REASON_LOOKUP_VALUE_ID" ]; then
  step "Looking up a CLOSURE_REASON lookup value"
  LOOKUPS="$(curl -s "$BASE_URL/api/v1/lookups/CLOSURE_REASON" "${SAKHI_AUTH[@]}" "${SAKHI_HEADERS[@]}")"
  CLOSURE_REASON_LOOKUP_VALUE_ID="$(echo "$LOOKUPS" | json_get data.0.id)"
  check "Found a CLOSURE_REASON lookup value" "$([ -n "$CLOSURE_REASON_LOOKUP_VALUE_ID" ] && echo 1 || echo 0)"
  if [ -z "$CLOSURE_REASON_LOOKUP_VALUE_ID" ]; then
    echo "      response: $LOOKUPS"
    echo "Aborting: no CLOSURE_REASON lookup value found — pass CLOSURE_REASON_LOOKUP_VALUE_ID explicitly."
    exit 1
  fi
fi

step "Creating a closure card as the Sakhi"
LOCAL_UUID="test-closure-$(date +%s)"
CLOSURE_DATE="$(date +%F)"
CREATE_BODY="$(node -e '
  const [localClosureUuid, beneficiaryId, closureType, closureReasonLookupValueId, closureDate, submittedByUserId] = process.argv.slice(1);
  process.stdout.write(JSON.stringify({ localClosureUuid, beneficiaryId, closureType, closureReasonLookupValueId, closureDate, submittedByUserId }));
' "$LOCAL_UUID" "$BENEFICIARY_ID" "$CLOSURE_TYPE" "$CLOSURE_REASON_LOOKUP_VALUE_ID" "$CLOSURE_DATE" "$SAKHI_USER_ID")"
CREATE_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/closures" \
  -H "Content-Type: application/json" \
  "${SAKHI_AUTH[@]}" "${SAKHI_HEADERS[@]}" \
  -d "$CREATE_BODY")"
CLOSURE_ID="$(echo "$CREATE_RESPONSE" | json_get data.id)"
check "Closure card created (PENDING)" "$([ -n "$CLOSURE_ID" ] && echo 1 || echo 0)"
if [ -z "$CLOSURE_ID" ]; then
  echo "      response: $CREATE_RESPONSE"
  echo "Aborting: closure creation failed."
  exit 1
fi
echo "      closureId: $CLOSURE_ID"

step "Rejecting the closure card as the Supervisor"
DECISION_RESPONSE="$(curl -s -o /tmp/closure-decision-body.$$ -w '%{http_code}' \
  -X PATCH "$BASE_URL/api/v1/closures/$CLOSURE_ID/decision" \
  -H "Content-Type: application/json" \
  "${SUPERVISOR_AUTH[@]}" "${SUPERVISOR_HEADERS[@]}" \
  -d '{"decision":"REJECTED","supervisorNotes":"test rejection via smoke script"}')"
DECISION_BODY="$(cat /tmp/closure-decision-body.$$)"
rm -f /tmp/closure-decision-body.$$
check "Decision request returned 200" "$([ "$DECISION_RESPONSE" = "200" ] && echo 1 || echo 0)"
if [ "$DECISION_RESPONSE" != "200" ]; then
  echo "      status: $DECISION_RESPONSE, body: $DECISION_BODY"
fi

step "Verifying the CLOSURE_REVIEW_UPDATE notification for the Sakhi"
sleep 1
NOTIFICATIONS="$(curl -s "$BASE_URL/api/v1/notifications" "${SAKHI_AUTH[@]}" "${SAKHI_HEADERS[@]}")"
MATCH="$(echo "$NOTIFICATIONS" | node -e '
  let input = "";
  process.stdin.on("data", d => input += d);
  process.stdin.on("end", () => {
    const closureId = process.argv[1];
    try {
      const data = JSON.parse(input);
      const list = Array.isArray(data.data) ? data.data : [];
      const count = list.filter(n => n.notificationType === "CLOSURE_REVIEW_UPDATE" && n.linkedEntityId === closureId).length;
      process.stdout.write(String(count));
    } catch {
      process.stdout.write("0");
    }
  });
' "$CLOSURE_ID")"
check "Notification found for this closure" "$([ "${MATCH:-0}" -ge 1 ] && echo 1 || echo 0)"
if [ "${MATCH:-0}" -lt 1 ]; then
  echo "      response: $NOTIFICATIONS"
fi

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
