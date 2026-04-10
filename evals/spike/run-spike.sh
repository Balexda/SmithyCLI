#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Spike Validation Script for Headless Execution Assumptions
#
# Validates three assumptions about `claude -p` headless mode:
#   A) Deployed .claude/ files are loaded (skill loading)
#   B) Sub-agent dispatch works (plan, reconcile, clarify)
#   C) Skill output is captured on stdout
#
# Usage: bash evals/spike/run-spike.sh
# =============================================================================

# -- Resolve paths -----------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SPIKE_DIR="$REPO_ROOT/evals/spike"
OUTPUT_FILE="$SPIKE_DIR/output-strike.txt"
STDERR_FILE="$SPIKE_DIR/output-strike.stderr.txt"

# -- Color support ------------------------------------------------------------

if [ -t 1 ]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[0;33m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  GREEN=''
  RED=''
  YELLOW=''
  BOLD=''
  RESET=''
fi

pass() { echo -e "  ${GREEN}PASS${RESET}: $1"; }
fail() { echo -e "  ${RED}FAIL${RESET}: $1"; ALL_PASSED=false; }
info() { echo -e "${BOLD}$1${RESET}"; }
warn() { echo -e "  ${YELLOW}NOTE${RESET}: $1"; }

# -- Track overall result -----------------------------------------------------

ALL_PASSED=true
SPIKE_TMPDIR=""

# -- Cleanup trap -------------------------------------------------------------

cleanup() {
  if [ -z "$SPIKE_TMPDIR" ] || [ ! -d "$SPIKE_TMPDIR" ]; then
    return
  fi

  if [ "$ALL_PASSED" = true ]; then
    echo ""
    info "All assumptions passed. Cleaning up temp directory."
    rm -rf "$SPIKE_TMPDIR"
  else
    echo ""
    info "One or more assumptions failed. Retaining temp directory for investigation:"
    echo "  $SPIKE_TMPDIR"
    echo ""
    echo "You can manually test fallback approaches against the deployed .claude/ files."
    echo "For example:"
    echo "  cd $SPIKE_TMPDIR"
    echo "  claude -p \"\$(cat .claude/commands/smithy.strike.md) add a health check endpoint\""
    echo ""
    echo "Clean up manually when done: rm -rf $SPIKE_TMPDIR"
  fi
}

trap cleanup EXIT

# =============================================================================
# Step 1: Pre-flight checks
# =============================================================================

info "Step 1: Pre-flight checks"

if ! command -v claude &>/dev/null; then
  echo "ERROR: 'claude' CLI not found in PATH."
  echo "Install Claude Code: https://docs.anthropic.com/en/docs/claude-code"
  exit 1
fi
pass "'claude' CLI found in PATH"

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  warn "ANTHROPIC_API_KEY not set — assuming OAuth authentication (claude login)"
else
  pass "ANTHROPIC_API_KEY is set"
fi

# =============================================================================
# Step 2: Build CLI
# =============================================================================

echo ""
info "Step 2: Building CLI"

(cd "$REPO_ROOT" && npm run build)
if [ ! -f "$REPO_ROOT/dist/cli.js" ]; then
  echo "ERROR: Build failed — dist/cli.js not found."
  exit 1
fi
pass "CLI built successfully (dist/cli.js exists)"

# =============================================================================
# Step 3: Create temp directory
# =============================================================================

echo ""
info "Step 3: Creating temp directory"

SPIKE_TMPDIR="$(mktemp -d)"
pass "Temp directory created: $SPIKE_TMPDIR"

# =============================================================================
# Step 4: Deploy skills
# =============================================================================

echo ""
info "Step 4: Deploying Smithy skills into temp directory"

node "$REPO_ROOT/dist/cli.js" init -a claude -y -d "$SPIKE_TMPDIR"
pass "smithy init completed"

# =============================================================================
# Step 5: Verify deployment
# =============================================================================

echo ""
info "Step 5: Verifying deployment"

DEPLOY_OK=true
for expected_file in \
  ".claude/commands/smithy.strike.md" \
  ".claude/prompts/smithy.guidance.md" \
  ".claude/agents/smithy.plan.md" \
  ".claude/agents/smithy.clarify.md" \
  ".claude/agents/smithy.reconcile.md"; do
  if [ -f "$SPIKE_TMPDIR/$expected_file" ]; then
    pass "Found $expected_file"
  else
    fail "Missing $expected_file"
    DEPLOY_OK=false
  fi
done

if [ "$DEPLOY_OK" = false ]; then
  echo ""
  echo "ERROR: Deployment verification failed. Cannot proceed with headless execution test."
  echo "Check the temp directory: $SPIKE_TMPDIR"
  exit 1
fi

# =============================================================================
# Step 6: Run strike headlessly
# =============================================================================

echo ""
info "Step 6: Running strike headlessly (300s timeout)"

# Determine the timeout command (GNU coreutils on Linux, gtimeout on macOS)
TIMEOUT_CMD=""
if command -v timeout &>/dev/null; then
  TIMEOUT_CMD="timeout"
elif command -v gtimeout &>/dev/null; then
  TIMEOUT_CMD="gtimeout"
else
  echo "ERROR: Neither 'timeout' (GNU coreutils) nor 'gtimeout' found."
  echo "On macOS, install with: brew install coreutils"
  exit 1
fi
pass "Using timeout command: $TIMEOUT_CMD"

echo "  Invoking: $TIMEOUT_CMD 300 claude -p \"/smithy.strike 'add a health check endpoint'\""
echo "  CWD: $SPIKE_TMPDIR"
echo "  Stdout -> $OUTPUT_FILE"
echo "  Stderr -> $STDERR_FILE"
echo ""

# Run the command; do not exit on failure (set +e) so we can inspect results
set +e
(cd "$SPIKE_TMPDIR" && $TIMEOUT_CMD 300 claude -p "/smithy.strike 'add a health check endpoint'" \
  >"$OUTPUT_FILE" 2>"$STDERR_FILE")
STRIKE_EXIT=$?
set -e

if [ $STRIKE_EXIT -eq 124 ]; then
  warn "Strike command timed out after 300 seconds"
elif [ $STRIKE_EXIT -ne 0 ]; then
  warn "Strike command exited with code $STRIKE_EXIT"
fi

echo "  Output file size: $(wc -c < "$OUTPUT_FILE") bytes"
echo "  Stderr file size: $(wc -c < "$STDERR_FILE") bytes"

# =============================================================================
# Step 7: Check Assumption A (skill loading)
# =============================================================================

echo ""
info "Step 7: Checking Assumption A — Skill Loading"

ASSUMPTION_A=true

# Check for strike-specific structural markers
if grep -q "# Strike:" "$OUTPUT_FILE"; then
  pass "Found '# Strike:' heading"
else
  fail "Missing '# Strike:' heading"
  ASSUMPTION_A=false
fi

if grep -qE "## (Requirements|Summary|Tasks)" "$OUTPUT_FILE"; then
  pass "Found structural section (Requirements/Summary/Tasks)"
else
  fail "Missing structural sections (Requirements/Summary/Tasks)"
  ASSUMPTION_A=false
fi

# Check for absence of generic refusal patterns (these suggest skill was NOT loaded)
if grep -qi "I'd be happy to help" "$OUTPUT_FILE"; then
  fail "Found generic refusal pattern: \"I'd be happy to help\""
  ASSUMPTION_A=false
else
  pass "No generic refusal pattern: \"I'd be happy to help\""
fi

if grep -qi "Sure, here's" "$OUTPUT_FILE"; then
  fail "Found generic refusal pattern: \"Sure, here's\""
  ASSUMPTION_A=false
else
  pass "No generic refusal pattern: \"Sure, here's\""
fi

if [ "$ASSUMPTION_A" = false ]; then
  ALL_PASSED=false
fi

# =============================================================================
# Step 8: Check Assumption B (sub-agent dispatch)
# =============================================================================

echo ""
info "Step 8: Checking Assumption B — Sub-Agent Dispatch"

ASSUMPTION_B=true

# smithy-plan: look for lens labels
if grep -qE "(Simplification|Separation of Concerns|Robustness)" "$OUTPUT_FILE"; then
  pass "smithy-plan: found lens labels"
else
  fail "smithy-plan: no lens labels found (Simplification, Separation of Concerns, Robustness)"
  ASSUMPTION_B=false
fi

# smithy-reconcile: look for reconciliation markers
if grep -qEi "(reconcil|merged|\[via)" "$OUTPUT_FILE"; then
  pass "smithy-reconcile: found reconciliation markers"
else
  fail "smithy-reconcile: no reconciliation markers found"
  ASSUMPTION_B=false
fi

# smithy-clarify: look for clarification markers
if grep -qEi "(clarif|assumption)" "$OUTPUT_FILE"; then
  pass "smithy-clarify: found clarification markers"
else
  fail "smithy-clarify: no clarification markers found"
  ASSUMPTION_B=false
fi

# smithy-scout: expected absent (strike does not dispatch scout)
if grep -qEi "([Ss]cout|consistency)" "$OUTPUT_FILE"; then
  warn "smithy-scout: UNEXPECTED — found scout markers (strike should not dispatch scout)"
else
  warn "smithy-scout: EXPECTED-ABSENT — no scout markers (strike does not dispatch scout)"
fi
echo "  (scout excluded from Assumption B verdict — known spec gap)"

if [ "$ASSUMPTION_B" = false ]; then
  ALL_PASSED=false
fi

# =============================================================================
# Step 9: Check Assumption C (stdout capture)
# =============================================================================

echo ""
info "Step 9: Checking Assumption C — Stdout Capture"

ASSUMPTION_C=true

# Check output file is non-empty
if [ -s "$OUTPUT_FILE" ]; then
  pass "Output file is non-empty"
else
  fail "Output file is empty"
  ASSUMPTION_C=false
fi

# Check for valid Markdown (at least one # heading)
if grep -q "^#" "$OUTPUT_FILE"; then
  pass "Output contains Markdown headings"
else
  fail "Output contains no Markdown headings"
  ASSUMPTION_C=false
fi

# Check it does not consist solely of error messages
ERROR_LINES=$(grep -ciE "(error|exception|traceback|fatal)" "$OUTPUT_FILE" || true)
TOTAL_LINES=$(wc -l < "$OUTPUT_FILE")
if [ "$TOTAL_LINES" -gt 0 ] && [ "$ERROR_LINES" -eq "$TOTAL_LINES" ]; then
  fail "Output consists entirely of error messages"
  ASSUMPTION_C=false
else
  pass "Output is not solely error messages ($ERROR_LINES error-like lines out of $TOTAL_LINES total)"
fi

if [ "$ASSUMPTION_C" = false ]; then
  ALL_PASSED=false
fi

# =============================================================================
# Step 10: Summary
# =============================================================================

echo ""
echo "============================================================================="
info "SPIKE VALIDATION SUMMARY"
echo "============================================================================="

if [ "$ASSUMPTION_A" = true ]; then
  echo -e "  Assumption A (Skill Loading):      ${GREEN}PASS${RESET}"
else
  echo -e "  Assumption A (Skill Loading):      ${RED}FAIL${RESET}"
fi

if [ "$ASSUMPTION_B" = true ]; then
  echo -e "  Assumption B (Sub-Agent Dispatch): ${GREEN}PASS${RESET}"
else
  echo -e "  Assumption B (Sub-Agent Dispatch): ${RED}FAIL${RESET}"
fi

if [ "$ASSUMPTION_C" = true ]; then
  echo -e "  Assumption C (Stdout Capture):     ${GREEN}PASS${RESET}"
else
  echo -e "  Assumption C (Stdout Capture):     ${RED}FAIL${RESET}"
fi

echo "============================================================================="

if [ "$ALL_PASSED" = true ]; then
  echo -e "${GREEN}All assumptions validated successfully.${RESET}"
  echo "Proceed with evals framework implementation (US2-US11)."
else
  echo -e "${RED}One or more assumptions failed.${RESET}"
  echo "Review output files for details:"
  echo "  Stdout: $OUTPUT_FILE"
  echo "  Stderr: $STDERR_FILE"
  echo "See FINDINGS.md for fallback approaches."
fi

echo ""
