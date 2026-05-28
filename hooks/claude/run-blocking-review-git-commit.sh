#!/usr/bin/env bash
set -euo pipefail

invocation_cwd="${LRC_CLAUDE_INVOCATION_CWD:-}"
original_command="${LRC_ORIGINAL_GIT_COMMIT:-}"
blocking_timeout="${LRC_BLOCKING_REVIEW_TIMEOUT:-20m}"

if [[ -z "$invocation_cwd" ]]; then
	echo "LiveReview: missing invocation cwd for Claude wrapper" >&2
	exit 1
fi

if [[ -z "$original_command" ]]; then
  echo "LiveReview: missing original git commit command for Claude wrapper" >&2
  exit 1
fi

if ! command -v lrc >/dev/null 2>&1; then
  echo "LiveReview: lrc is not available on PATH, so the blocking review gate cannot run" >&2
  exit 1
fi

lrc_bin="$(command -v lrc)"

lrc_review_mode="$($lrc_bin version 2>/dev/null | awk -F': ' '/Review mode/ {print $2; exit}')"

if [[ "$lrc_review_mode" == "fake" ]]; then
  echo "LiveReview: refusing to use fake-review lrc binary at $lrc_bin" >&2
  echo "LiveReview: rebuild the real CLI with 'make build-local && lrc hooks install' before retrying git commit" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "LiveReview: python3 is required for the local Claude blocking-review helper" >&2
  exit 1
fi

if ! initial_message=$(LRC_ORIGINAL_GIT_COMMIT="$original_command" python3 - <<'PY'
import os
import re
import shlex

command = os.environ.get("LRC_ORIGINAL_GIT_COMMIT", "")

def extract_heredoc_command_substitution(value):
	if not value.startswith("$(") or not value.endswith(")"):
		return None

	body = value[2:-1]
	lines = body.splitlines()
	if not lines:
		return None

	first_line = lines[0].strip()
	match = re.fullmatch(r"cat\s+<<-?\s*(?:'([^']+)'|\"([^\"]+)\"|([A-Za-z_][A-Za-z0-9_]*))", first_line)
	if not match:
		return None

	marker = next(group for group in match.groups() if group is not None)
	if len(lines) < 2 or lines[-1].strip() != marker:
		return None

	return "\n".join(lines[1:-1])

try:
    tokens = shlex.split(command, posix=True)
except ValueError:
    print("", end="")
    raise SystemExit(0)

message = ""
i = 0
while i < len(tokens):
    token = tokens[i]
    if token in ("-m", "--message") and i + 1 < len(tokens):
        message = tokens[i + 1]
        break
    if token.startswith("--message="):
        message = token.split("=", 1)[1]
        break
    if token.startswith("-m") and token != "-m" and len(token) > 2:
        message = token[2:]
        break
    i += 1

resolved_message = extract_heredoc_command_substitution(message)
if resolved_message is not None:
	message = resolved_message

print(message, end="")
PY
); then
  echo "LiveReview: failed to parse the original git commit command" >&2
  exit 1
fi

cd "$invocation_cwd"

git_dir="$(git rev-parse --git-dir 2>/dev/null || echo .git)"
lrc_dir="$git_dir/lrc"
disabled_file="$lrc_dir/disabled"
disabled_claude_file="$lrc_dir/disabled-claude"

if [[ -f "$disabled_file" || -f "$disabled_claude_file" ]]; then
  echo "LiveReview: Claude review hook disabled for this repository; proceeding with git commit." >&2
  exec bash -c "$original_command"
fi

echo "LiveReview: checking whether the current staged tree already has a valid review." >&2
echo "LiveReview: if not, a blocking browser review will open before git commit can continue." >&2

review_log=$(mktemp)
cleanup() {
  rm -f "$review_log"
}
trap cleanup EXIT

set +e
if [[ -n "$initial_message" ]]; then
  LRC_INITIAL_MESSAGE="$initial_message" lrc review --staged --blocking-review --blocking-review-timeout "$blocking_timeout" 2>&1 | tee "$review_log"
  review_status=${PIPESTATUS[0]}
else
  lrc review --staged --blocking-review --blocking-review-timeout "$blocking_timeout" 2>&1 | tee "$review_log"
  review_status=${PIPESTATUS[0]}
fi
set -e

case "$review_status" in
  0|2)
    exec env LRC_CLAUDE_REVIEW_HANDLED=1 bash -c "$original_command"
    ;;
  1)
    if grep -q "attestation already present for current tree" "$review_log"; then
      echo "LiveReview: current tree is already reviewed; proceeding with git commit." >&2
      exec env LRC_CLAUDE_REVIEW_HANDLED=1 bash -c "$original_command"
    fi
    if grep -q "Commit aborted by user" "$review_log"; then
      echo "LiveReview: commit intentionally aborted in the browser; git commit was not run." >&2
      exit 0
    fi
    echo "LiveReview: blocking review exited with code 1 before git commit could continue" >&2
    exit 1
    ;;
  *)
    echo "LiveReview: blocking review failed before git commit could continue" >&2
    exit 1
    ;;
esac