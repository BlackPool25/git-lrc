package storage

import (
	"fmt"
	"os"
)

// EnsureClaudeManagedHooksDir creates the user-global lrc-managed Claude hooks directory.
func EnsureClaudeManagedHooksDir(dir string) error {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create Claude managed hooks directory %s: %w", dir, err)
	}
	return nil
}

// ReadClaudeSettingsFile reads the user-scoped Claude settings.json file.
func ReadClaudeSettingsFile(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read Claude settings file %s: %w", path, err)
	}
	return data, nil
}

// WriteClaudeSettingsFile atomically writes the user-scoped Claude settings.json file.
func WriteClaudeSettingsFile(path string, data []byte) error {
	if err := WriteFileAtomically(path, data, 0600); err != nil {
		return fmt.Errorf("failed to write Claude settings file %s: %w", path, err)
	}
	return nil
}

// WriteClaudeHookScript atomically writes an lrc-managed Claude hook script.
func WriteClaudeHookScript(path string, data []byte) error {
	if err := WriteFileAtomically(path, data, 0755); err != nil {
		return fmt.Errorf("failed to write Claude hook script %s: %w", path, err)
	}
	return nil
}

// WriteClaudeSkillFile atomically writes an lrc-managed Claude skill file.
func WriteClaudeSkillFile(path string, data []byte) error {
	if err := WriteFileAtomically(path, data, 0644); err != nil {
		return fmt.Errorf("failed to write Claude skill file %s: %w", path, err)
	}
	return nil
}

// RemoveClaudeHookScript removes an lrc-managed Claude hook script.
func RemoveClaudeHookScript(path string) error {
	if err := Remove(path); err != nil {
		return fmt.Errorf("failed to remove Claude hook script %s: %w", path, err)
	}
	return nil
}

// RemoveClaudeSkillFile removes an lrc-managed Claude skill file.
func RemoveClaudeSkillFile(path string) error {
	if err := Remove(path); err != nil {
		return fmt.Errorf("failed to remove Claude skill file %s: %w", path, err)
	}
	return nil
}
