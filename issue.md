### Pre-flight checks

- [x] I searched existing issues and discussions.
- [x] I read CONTRIBUTING.md.
- [x] This is not a private security vulnerability report.

---

### Current behavior

When running `lrc hooks install --local` or `lrc hooks uninstall --local` from a nested subdirectory of a Git repository, the CLI exits with:

```
Error: not in a git repository (no .git directory found)
```

Developers must be at the repository root containing `.git` to manage hooks locally, which breaks the expected workflow when working in subdirectories.

### Expected behavior

`git-lrc` should detect the enclosing Git repository when invoked from any subdirectory. `lrc hooks install --local` and `lrc hooks uninstall --local` should succeed when run from any path inside a Git worktree.

### Steps to reproduce

1. Build and install: `make build-local && lrc hooks install`
2. Create a subdirectory: `mkdir -p subdir && cd subdir`
3. Try local install: `lrc hooks install --local`
4. Observe:

   ```
   Error: not in a git repository (no .git directory found)
   ```

### Environment

- lrc version: Dev / main
- OS: Linux
- Shell: bash
- Git version: any

### Additional context

**Root cause**

The function `IsGitRepositoryCurrentDir()` in `gitops/config.go` checks for `.git` using `os.Stat(".git")`, which only looks at the current working directory. When invoked from a subdirectory, `.git` is not found even though the directory is inside a valid Git worktree.

**Naming bug**

The name says "check current dir for .git" but the actual purpose is "check whether we are inside any Git repository." Per project convention (AGENTS.md): names must match function meaning.

**Proposed fix**

Replace `os.Stat(".git")` with `git rev-parse --is-inside-work-tree`, rename `IsGitRepositoryCurrentDir` → `IsGitRepository`, and drop the unused `"os"` import.
