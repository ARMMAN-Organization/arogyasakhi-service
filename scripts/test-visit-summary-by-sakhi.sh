#!/usr/bin/env bash
# Smoke-test for GET /visits/by-sakhi/:sakhiId/summary against a running
# supervisor-operations-service. Mirrors test-stale-sakhis.sh's approach — no
# e2e test convention exists in this repo yet (no supertest, no e2e project),
# so this curls the real HTTP route directly, runnable ad hoc.
#
# Requires: a running supervisor-operations-service
# (`npx nx serve supervisor-operations-service`) reachable at BASE_URL, and a
# running visit-form-service (`npx nx serve visit-form-service`) reachable at
# VISIT_FORM_BASE_URL — this route proxies to it.
#
# SAKHI_ID must be a real Sakhi already in TOKEN/USER_ID's Supervisor roster
# for the happy-path/roster checks to actually pass — override it via env var.
#
#   SAKHI_ID=... TOKEN=... ./test-visit-summary-by-sakhi.sh

set -u

BASE_URL="${BASE_URL:-http://localhost:3016}"
VISIT_FORM_BASE_URL="${VISIT_FORM_BASE_URL:-http://localhost:3006}"
TOKEN="${TOKEN:-eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJiY2QwYjk2YS1jOTUxLTQwNTItYjMyOC1kMGY1NjI5Y2YzMGQiLCJyb2xlcyI6WyJTVVBFUlZJU09SIl0sInByb2plY3RJZCI6IjRiNDA4NGNmLWQ1NzItNDAyMC05NDM4LWM4MjY0MDI3NTIwMSIsImdlb2dyYXBoeVVuaXRJZCI6IjczMzdmZThkLWM1YjQtNDE4ZC04MWYyLTgwNDdlM2FiODg1ZCIsImlhdCI6MTc4NzI4ODM3NH0.aPUrBwoPNPAPkm2qbOTtB1jklpcTIvbjesypoBm0Y8mNm8DD1WbYyWN9llzHiQKTL6BKj9YtJxZwhCIGjNXMEd_2v_xx77-3Gws27iSL70QrUQtSUb8jWJORKoEgf0eDxIJv1J_6kj9LKnA5WIAmKeVBentKm_Uww74Tche9zGrbNIru2eiNjWdUdZv25tmEXKfAMfCvp2nxrbHYakeLfUCT-xBjqvKVVL84T4qrP011ZB-DdHL7TQX51K9c7h2__si8EIJcXKrTLk4lXsKRdWXvpxL3L80-oFK8bEsMkH2Z9ErjznTFw1VxuRp_fzqoJFg37NMQ6MPa7eqt2M1BJg}"
USER_ID="${USER_ID:-bcd0b96a-c951-4052-b328-d0f5629cf30d}"
PROJECT_ID="${PROJECT_ID:-4b4084cf-d572-4020-9438-c82640275201}"
GEOGRAPHY_UNIT_ID="${GEOGRAPHY_UNIT_ID:-7337fe8d-c5b4-418d-81f2-8047e3ab885d}"
SAKHI_ID="${SAKHI_ID:-00000000-0000-0000-0000-000000000000}"
OUTSIDE_ROSTER_SAKHI_ID="${OUTSIDE_ROSTER_SAKHI_ID:-11111111-1111-1111-1111-111111111111}"

PASS=0
FAIL=0

# Issues a request and asserts the response status code.
# args: name method path expected_status [extra curl args...]
assert_status() {
  local name="$1" method="$2" path="$3" expected="$4"
  shift 4
  local body status
  body="$(curl -s -o /tmp/visit-summary-by-sakhi-body.$$ -w '%{http_code}' -X "$method" "$BASE_URL$path" "$@")"
  status="$body"
  if [ "$status" = "$expected" ]; then
    echo "PASS  $name (got $status)"
    PASS=$((PASS + 1))
  else
    echo "FAIL  $name (expected $expected, got $status)"
    echo "      body: $(cat /tmp/visit-summary-by-sakhi-body.$$)"
    FAIL=$((FAIL + 1))
  fi
  rm -f /tmp/visit-summary-by-sakhi-body.$$
}

AUTH=(-H "Authorization: Bearer $TOKEN")
SUPERVISOR_HEADERS=(
  -H "x-armman-user-id: $USER_ID"
  -H "x-armman-roles: SUPERVISOR"
  -H "x-armman-project-id: $PROJECT_ID"
  -H "x-armman-geography-unit-id: $GEOGRAPHY_UNIT_ID"
)
MANAGER_HEADERS=(
  -H "x-armman-user-id: $USER_ID"
  -H "x-armman-roles: MANAGER"
  -H "x-armman-project-id: $PROJECT_ID"
)
SAKHI_HEADERS=(
  -H "x-armman-user-id: $USER_ID"
  -H "x-armman-roles: SAKHI"
  -H "x-armman-project-id: $PROJECT_ID"
)

echo "Testing GET /visits/by-sakhi/:sakhiId/summary against $BASE_URL"
echo "(requires visit-form-service reachable at $VISIT_FORM_BASE_URL through the same gateway config)"
echo

assert_status "happy path (Supervisor, sakhi in roster)" GET \
  "/api/v1/visits/by-sakhi/$SAKHI_ID/summary" 200 "${AUTH[@]}" "${SUPERVISOR_HEADERS[@]}"

assert_status "happy path with fromDate/toDate" GET \
  "/api/v1/visits/by-sakhi/$SAKHI_ID/summary?fromDate=2026-08-01&toDate=2026-08-21" 200 \
  "${AUTH[@]}" "${SUPERVISOR_HEADERS[@]}"

assert_status "MANAGER unrestricted" GET \
  "/api/v1/visits/by-sakhi/$SAKHI_ID/summary" 200 "${AUTH[@]}" "${MANAGER_HEADERS[@]}"

assert_status "invalid sakhiId (not a UUID) -> 400" GET \
  "/api/v1/visits/by-sakhi/not-a-uuid/summary" 400 "${AUTH[@]}" "${SUPERVISOR_HEADERS[@]}"

assert_status "invalid fromDate format -> 400" GET \
  "/api/v1/visits/by-sakhi/$SAKHI_ID/summary?fromDate=08-01-2026" 400 \
  "${AUTH[@]}" "${SUPERVISOR_HEADERS[@]}"

assert_status "unknown query param rejected (.strict()) -> 400" GET \
  "/api/v1/visits/by-sakhi/$SAKHI_ID/summary?foo=bar" 400 "${AUTH[@]}" "${SUPERVISOR_HEADERS[@]}"

assert_status "sakhi outside Supervisor's roster -> 403 (from visit-form-service)" GET \
  "/api/v1/visits/by-sakhi/$OUTSIDE_ROSTER_SAKHI_ID/summary" 403 "${AUTH[@]}" "${SUPERVISOR_HEADERS[@]}"

assert_status "SAKHI role not permitted on this route -> 403" GET \
  "/api/v1/visits/by-sakhi/$SAKHI_ID/summary" 403 "${AUTH[@]}" "${SAKHI_HEADERS[@]}"

assert_status "missing Authorization header -> 401" GET \
  "/api/v1/visits/by-sakhi/$SAKHI_ID/summary" 401 "${SUPERVISOR_HEADERS[@]}"

assert_status "missing gateway identity headers -> 401" GET \
  "/api/v1/visits/by-sakhi/$SAKHI_ID/summary" 401 "${AUTH[@]}"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
