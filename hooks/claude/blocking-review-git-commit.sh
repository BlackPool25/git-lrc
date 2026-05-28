#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
helper_path="$script_dir/run-blocking-review-git-commit.sh"
payload_file=$(mktemp)

cleanup() {
  rm -f "$payload_file"
}

trap cleanup EXIT

cat >"$payload_file"

json_escape() {
  local value="$1"
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/\\r}
  value=${value//$'\t'/\\t}
  value=${value//$'\f'/\\f}
  value=${value//$'\b'/\\b}
  printf '%s' "$value"
}

emit_deny() {
  local reason="$1"
  local escaped_reason
  escaped_reason=$(json_escape "$reason")
  printf '%s\n' "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"$escaped_reason\"}}"
}

validate_supported_commit_command() {
  python3 - "$payload_file" <<'PY'
import json
import shlex
import sys

try:
  with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)
except Exception:
  print("Claude hook could not parse the git commit command payload", end="")
  raise SystemExit(1)

command = (payload.get("tool_input", {}).get("command") or "").strip()
if not command:
  print("Claude hook could not find the git commit command payload", end="")
  raise SystemExit(1)

lexer = shlex.shlex(command, posix=True, punctuation_chars=';&|()')
lexer.whitespace_split = True
try:
  tokens = list(lexer)
except ValueError:
  print("Claude LiveReview gate could not parse the shell command safely", end="")
  raise SystemExit(1)

operators = {"&&", "||", ";", "|", "&", "(", ")"}
if any(token in operators for token in tokens):
  print("Claude LiveReview gate currently supports a single git commit command only. Run staging or setup commands separately, then retry git commit.", end="")
  raise SystemExit(1)

if len(tokens) < 2 or tokens[0] != "git":
  print("Claude LiveReview gate currently supports a single git commit command only. Retry with git commit as a separate command.", end="")
  raise SystemExit(1)

if tokens[1] != "commit":
  print("Claude LiveReview gate currently supports a single git commit command only. Retry with git commit as a separate command.", end="")
  raise SystemExit(1)
PY
}

emit_allow_with_wrapper() {
  local reason="$1"
	if ! REVIEW_REASON="$reason" CLAUDE_HELPER_PATH="$helper_path" CLAUDE_PROJECT_DIR_VALUE="$CLAUDE_PROJECT_DIR" CLAUDE_HOOK_PWD_VALUE="$PWD" python3 - "$payload_file" <<'PY'
import json
import os
import shlex
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        payload = json.load(handle)
except Exception:
    raise SystemExit(1)

tool_input = dict(payload.get("tool_input", {}))
command = (tool_input.get("command") or "").strip()

if not command:
    raise SystemExit(1)

project_dir = os.environ["CLAUDE_PROJECT_DIR_VALUE"]
helper_path = os.environ["CLAUDE_HELPER_PATH"]
hook_pwd = os.environ.get("CLAUDE_HOOK_PWD_VALUE", "").strip()

invocation_cwd = ""
cwd_candidate = tool_input.get("cwd")
if isinstance(cwd_candidate, str):
	invocation_cwd = cwd_candidate.strip()

if not invocation_cwd:
	cwd_candidate = payload.get("cwd")
	if isinstance(cwd_candidate, str):
		invocation_cwd = cwd_candidate.strip()

if not invocation_cwd:
	invocation_cwd = hook_pwd

if not invocation_cwd:
	raise SystemExit(1)

tool_input["command"] = " ".join([
	f"LRC_CLAUDE_PROJECT_DIR={shlex.quote(project_dir)}",
	f"LRC_CLAUDE_INVOCATION_CWD={shlex.quote(invocation_cwd)}",
    f"LRC_ORIGINAL_GIT_COMMIT={shlex.quote(command)}",
    shlex.quote(helper_path),
])

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "allow",
        "permissionDecisionReason": os.environ["REVIEW_REASON"],
        "updatedInput": tool_input,
    }
}))
PY
  then
    emit_deny "Blocking review completed, but the Claude hook could not rewrite the git commit command safely"
    return 0
  fi
}

if ! command -v lrc >/dev/null 2>&1; then
  emit_deny "lrc is not available on PATH, so the blocking review gate cannot run"
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  emit_deny "python3 is required for the local Claude blocking-review hook"
  exit 0
fi

if [ ! -x "$helper_path" ]; then
  emit_deny "Claude blocking-review helper script is missing or not executable"
  exit 0
fi

if ! validation_reason=$(validate_supported_commit_command); then
  emit_deny "$validation_reason"
  exit 0
fi

emit_allow_with_wrapper "Blocking review wrapper installed; git commit will run after review resolves"