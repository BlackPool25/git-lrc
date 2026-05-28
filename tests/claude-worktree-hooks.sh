#!/bin/bash
set -euo pipefail

PASS=0
FAIL=0

red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
bold()  { printf "\033[1m%s\033[0m\n" "$*"; }

assert_contains() {
	local desc="$1" needle="$2" haystack="$3"
	if [[ "$haystack" == *"$needle"* ]]; then
		green "  ✓ $desc"
		PASS=$((PASS + 1))
	else
		red "  ✗ $desc"
		red "    expected to contain: '$needle'"
		red "    got: '$haystack'"
		FAIL=$((FAIL + 1))
	fi
}

assert_not_contains() {
	local desc="$1" needle="$2" haystack="$3"
	if [[ "$haystack" != *"$needle"* ]]; then
		green "  ✓ $desc"
		PASS=$((PASS + 1))
	else
		red "  ✗ $desc"
		red "    did not expect to contain: '$needle'"
		red "    got: '$haystack'"
		FAIL=$((FAIL + 1))
	fi
}

assert_exit_code() {
	local desc="$1" want="$2" actual="$3"
	if [[ "$want" == "$actual" ]]; then
		green "  ✓ $desc"
		PASS=$((PASS + 1))
	else
		red "  ✗ $desc"
		red "    expected exit code: $want"
		red "    actual exit code:   $actual"
		FAIL=$((FAIL + 1))
	fi
}

assert_path_exists() {
	local desc="$1" path="$2"
	if [[ -e "$path" ]]; then
		green "  ✓ $desc"
		PASS=$((PASS + 1))
	else
		red "  ✗ $desc"
		red "    missing path: $path"
		FAIL=$((FAIL + 1))
	fi
}

cleanup() {
	cd /tmp
	rm -rf "${TMP_ROOT:-}" "${TEST_HOME:-}"
}
trap cleanup EXIT

build_payload() {
	local cwd="$1"
	local command="$2"
	python3 - "$cwd" "$command" <<'PY'
import json
import sys

print(json.dumps({
    "tool_input": {
        "command": sys.argv[2],
        "cwd": sys.argv[1],
    }
}))
PY
}

extract_rewritten_command() {
	local payload="$1"
	local validator_output
	validator_output="$(HOME="$TEST_HOME" CLAUDE_PROJECT_DIR="$REPO_DIR" "$VALIDATOR_PATH" <<<"$payload")"
	LAST_VALIDATOR_OUTPUT="$validator_output"
	LAST_REWRITTEN_COMMAND="$(VALIDATOR_OUTPUT="$validator_output" python3 - <<'PY'
import json
import os
import sys

payload = json.loads(os.environ["VALIDATOR_OUTPUT"])
hook_output = payload["hookSpecificOutput"]
if hook_output["permissionDecision"] != "allow":
    raise SystemExit("validator did not allow git commit")
print(hook_output["updatedInput"]["command"], end="")
PY
)"
}

run_wrapped_commit() {
	local invocation_cwd="$1"
	local git_command="$2"
	local output_file="$3"
	local payload rewritten_command

	payload="$(build_payload "$invocation_cwd" "$git_command")"
	extract_rewritten_command "$payload"
	assert_contains "validator allows managed git commit" '"permissionDecision": "allow"' "$LAST_VALIDATOR_OUTPUT"
	assert_contains "validator rewrites command with invocation cwd" 'LRC_CLAUDE_INVOCATION_CWD=' "$LAST_VALIDATOR_OUTPUT"
	rewritten_command="$LAST_REWRITTEN_COMMAND"

	set +e
	(
		cd "$REPO_DIR"
		HOME="$TEST_HOME" CLAUDE_PROJECT_DIR="$REPO_DIR" timeout 30s bash -c "$rewritten_command"
	) >"$output_file" 2>&1
	LAST_STATUS=$?
	set -e
	LAST_OUTPUT_FILE="$output_file"
	LAST_REWRITTEN_COMMAND="$rewritten_command"
}

LRC="${LRC_TEST_BIN:-$(command -v lrc)}"
if [[ -z "$LRC" ]]; then
	red "ERROR: lrc not found in PATH. Build and install first."
	exit 1
fi

PATH="$(dirname "$LRC"):$PATH"
export PATH

TEST_HOME="$(mktemp -d /tmp/lrc-claude-home.XXXXXX)"
TMP_ROOT="$(mktemp -d /tmp/lrc-claude-worktree.XXXXXX)"
REPO_DIR="$TMP_ROOT/main"
WT_DIR="$TMP_ROOT/wt"
ATTEST_OUTPUT="$TMP_ROOT/claude-worktree-attested.out"
DISABLED_OUTPUT="$TMP_ROOT/claude-worktree-disabled.out"
EMPTY_HOOKS_DIR="$TMP_ROOT/empty-hooks"

bold "Using lrc: $LRC"
bold "Temp home: $TEST_HOME"
bold "Temp root: $TMP_ROOT"

mkdir -p "$REPO_DIR"
mkdir -p "$EMPTY_HOOKS_DIR"
cd "$REPO_DIR"
git init --initial-branch=main . >/dev/null
git config user.email test@example.com
git config user.name "Test User"
printf 'a\n' > a.txt
git add a.txt
git -c core.hooksPath="$EMPTY_HOOKS_DIR" commit -m "init" >/dev/null

HOME="$TEST_HOME" "$LRC" hooks install --surface claude >/dev/null

VALIDATOR_PATH="$TEST_HOME/.lrc/claude/hooks/blocking-review-git-commit.sh"
WRAPPER_PATH="$TEST_HOME/.lrc/claude/hooks/run-blocking-review-git-commit.sh"
SETTINGS_PATH="$TEST_HOME/.claude/settings.json"

assert_path_exists "Claude validator installed under temp home" "$VALIDATOR_PATH"
assert_path_exists "Claude wrapper installed under temp home" "$WRAPPER_PATH"
assert_path_exists "Claude settings installed under temp home" "$SETTINGS_PATH"

git worktree add "$WT_DIR" -b feature-claude >/dev/null

bold ""
bold "══ Linked Worktree Attestation Reuse Through Claude Wrapper ═"

cd "$WT_DIR"
printf 'b\n' > b.txt
git add b.txt
HOME="$TEST_HOME" "$LRC" review --staged --vouch >/dev/null
WT_GIT_DIR="$(git rev-parse --git-dir)"
WT_TREE="$(git write-tree)"
WT_ATTEST="$WT_GIT_DIR/lrc/attestations/$WT_TREE.json"

assert_path_exists "worktree attestation written under per-worktree git-dir" "$WT_ATTEST"

run_wrapped_commit "$WT_DIR" "git commit -m 'claude worktree attested'" "$ATTEST_OUTPUT"
assert_exit_code "Claude wrapper commit succeeds from worktree attestation" "0" "$LAST_STATUS"

ATTEST_TEXT="$(cat "$ATTEST_OUTPUT")"
assert_contains "Claude wrapper reuses worktree attestation" "current tree is already reviewed; proceeding with git commit" "$ATTEST_TEXT"
assert_not_contains "Claude wrapper does not inspect main checkout diff" "no diff content collected" "$ATTEST_TEXT"

WT_SUBJECT="$(git -C "$WT_DIR" log -1 --format=%s)"
MAIN_SUBJECT="$(git -C "$REPO_DIR" log -1 --format=%s)"
assert_contains "worktree branch receives Claude-triggered commit" "claude worktree attested" "$WT_SUBJECT"
assert_contains "main branch remains unchanged" "init" "$MAIN_SUBJECT"

bold ""
bold "══ Linked Worktree Claude Disable Marker ═══════════════════"

cd "$WT_DIR"
printf 'c\n' > c.txt
git add c.txt
HOME="$TEST_HOME" "$LRC" hooks disable --surface claude >/dev/null
DISABLED_MARKER="$WT_GIT_DIR/lrc/disabled-claude"

assert_path_exists "Claude disabled marker written under per-worktree git-dir" "$DISABLED_MARKER"

run_wrapped_commit "$WT_DIR" "git commit -m 'claude worktree disabled'" "$DISABLED_OUTPUT"
assert_exit_code "Claude wrapper bypasses review when worktree Claude marker is set" "0" "$LAST_STATUS"

DISABLED_TEXT="$(cat "$DISABLED_OUTPUT")"
assert_contains "Claude wrapper reports worktree disable marker" "Claude review hook disabled for this repository; proceeding with git commit." "$DISABLED_TEXT"
assert_not_contains "disabled Claude flow does not run blocking review" "no diff content collected" "$DISABLED_TEXT"

WT_DISABLED_SUBJECT="$(git -C "$WT_DIR" log -1 --format=%s)"
MAIN_DISABLED_SUBJECT="$(git -C "$REPO_DIR" log -1 --format=%s)"
assert_contains "disabled Claude commit still lands in worktree branch" "claude worktree disabled" "$WT_DISABLED_SUBJECT"
assert_contains "main branch still remains unchanged" "init" "$MAIN_DISABLED_SUBJECT"

bold ""
bold "══ Results ═══════════════════════════════════════════════════"
TOTAL=$((PASS + FAIL))
if [[ $FAIL -eq 0 ]]; then
	green "All $TOTAL tests passed."
	exit 0
else
	red "$FAIL of $TOTAL tests failed."
	exit 1
fi