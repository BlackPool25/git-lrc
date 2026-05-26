package storage

import (
	"fmt"
	"os"
	"path/filepath"
)

// RemoveManagedHooksDir removes the managed lrc hooks directory under the hooks root.
func RemoveManagedHooksDir(hooksRoot string) error {
	target := filepath.Join(hooksRoot, "lrc")
	if err := RemoveAll(target); err != nil {
		return fmt.Errorf("failed to remove managed hooks directory %s: %w", target, err)
	}
	return nil
}

// RemoveHooksBackupDir removes the lrc hook backup directory under the hooks root.
func RemoveHooksBackupDir(hooksRoot string) error {
	target := filepath.Join(hooksRoot, ".lrc_backups")
	if err := RemoveAll(target); err != nil {
		return fmt.Errorf("failed to remove hooks backup directory %s: %w", target, err)
	}
	return nil
}

// RemoveTempHTMLFile removes a temporary review HTML artifact.
func RemoveTempHTMLFile(path string) error {
	if err := Remove(path); err != nil {
		return fmt.Errorf("failed to remove temporary HTML file %s: %w", path, err)
	}
	return nil
}

// RemoveSetupLogFile removes setup flow log output.
func RemoveSetupLogFile(path string) error {
	if err := Remove(path); err != nil {
		return fmt.Errorf("failed to remove setup log file %s: %w", path, err)
	}
	return nil
}

// RemoveReauthLogFile removes re-authentication flow log output.
func RemoveReauthLogFile(path string) error {
	if err := Remove(path); err != nil {
		return fmt.Errorf("failed to remove reauth log file %s: %w", path, err)
	}
	return nil
}

// RemoveAttestationFile removes a generated attestation artifact.
func RemoveAttestationFile(path string) error {
	if err := Remove(path); err != nil {
		return fmt.Errorf("failed to remove attestation file %s: %w", path, err)
	}
	return nil
}

// RemoveHookBackupFile removes an old hook backup file.
func RemoveHookBackupFile(path string) error {
	if err := Remove(path); err != nil {
		return fmt.Errorf("failed to remove hook backup file %s: %w", path, err)
	}
	return nil
}

// RemoveHookScriptFile removes a hook script file during uninstall.
func RemoveHookScriptFile(path string) error {
	if err := Remove(path); err != nil {
		return fmt.Errorf("failed to remove hook script file %s: %w", path, err)
	}
	return nil
}

// RemoveRepoHooksDisabledMarker removes the repo-level hooks disable marker file.
func RemoveRepoHooksDisabledMarker(path string) error {
	if err := Remove(path); err != nil {
		return fmt.Errorf("failed to remove hooks disabled marker %s: %w", path, err)
	}
	return nil
}

// RemoveRepoHooksStateMarker removes a repo-level hooks state marker file.
func RemoveRepoHooksStateMarker(path string) error {
	if err := os.Remove(path); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("failed to remove hooks state marker %s: %w", path, err)
	}
	return nil
}

// RemoveEditorWrapperScript removes the temporary git editor wrapper script.
func RemoveEditorWrapperScript(path string) error {
	if err := Remove(path); err != nil {
		return fmt.Errorf("failed to remove editor wrapper script %s: %w", path, err)
	}
	return nil
}

// RemoveEditorBackupStateFile removes the editor backup state file.
func RemoveEditorBackupStateFile(path string) error {
	if err := Remove(path); err != nil {
		return fmt.Errorf("failed to remove editor backup state file %s: %w", path, err)
	}
	return nil
}

// RemoveCommitMessageOverrideFile removes the pending commit message override file.
func RemoveCommitMessageOverrideFile(path string) error {
	if err := Remove(path); err != nil {
		return fmt.Errorf("failed to remove commit message override file %s: %w", path, err)
	}
	return nil
}

// RemoveCommitPushRequestFile removes the pending post-commit push request marker.
func RemoveCommitPushRequestFile(path string) error {
	if err := Remove(path); err != nil {
		return fmt.Errorf("failed to remove commit push request marker %s: %w", path, err)
	}
	return nil
}
