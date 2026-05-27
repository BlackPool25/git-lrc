# Plain Commit Hook Proof

Disposable proof rig for one question: which hook method lets plain `git commit`
complete directly with a supplied message, without opening the editor.

Entry point:

```bash
python3 scripts/plain-commit-hook-proof/driver.py
```

Behavior:

- Creates a unique workspace under `/tmp/git-lrc-plain-commit-proof-*`
- Writes isolated local hooks and helper processes into that temp workspace
- Runs a passing case and a negative control under a PTY
- Reports three explicit proof conditions in JSON output:
- `commit_triggered_via_temporary_api`
- `editor_not_opened`
- `message_recorded_in_git_log`
- Deletes the temp workspace automatically unless `--keep-temp` or
  `--keep-temp-on-failure` is used

This scaffold is intentionally product-independent. Once it proves the right
hook method, transfer only that method into the shipped hook templates.