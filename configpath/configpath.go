package configpath

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	configFileName     = ".lrc.toml"
	lrcDataDirName     = ".lrc"
	claudeDirName      = ".claude"
	claudeSettingsName = "settings.json"
)

// ResolveHomeDir returns a stable absolute home directory path for this process.
func ResolveHomeDir() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to determine home directory: %w", err)
	}

	normalized := normalizeHomeForOS(runtime.GOOS, homeDir)
	if strings.TrimSpace(normalized) == "" {
		return "", fmt.Errorf("failed to determine home directory: empty path")
	}

	return normalized, nil
}

// ResolveConfigPath returns the canonical ~/.lrc.toml path.
func ResolveConfigPath() (string, error) {
	homeDir, err := ResolveHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, configFileName), nil
}

// ResolveLRCDataDir returns the canonical ~/.lrc data directory.
func ResolveLRCDataDir() (string, error) {
	homeDir, err := ResolveHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, lrcDataDirName), nil
}

// ResolveClaudeDir returns the canonical ~/.claude directory.
func ResolveClaudeDir() (string, error) {
	homeDir, err := ResolveHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, claudeDirName), nil
}

// ResolveClaudeSettingsPath returns the user-scoped Claude settings.json path.
func ResolveClaudeSettingsPath() (string, error) {
	claudeDir, err := ResolveClaudeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(claudeDir, claudeSettingsName), nil
}

// ResolveClaudeManagedHooksDir returns the lrc-managed user-global Claude hooks directory.
func ResolveClaudeManagedHooksDir() (string, error) {
	lrcDir, err := ResolveLRCDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(lrcDir, "claude", "hooks"), nil
}

// ResolveClaudeLRCSkillPath returns the personal-global Claude skill path for /lrc.
func ResolveClaudeLRCSkillPath() (string, error) {
	claudeDir, err := ResolveClaudeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(claudeDir, "skills", "lrc", "SKILL.md"), nil
}

func normalizeHomeForOS(goos, homeDir string) string {
	normalized := strings.TrimSpace(homeDir)
	if normalized == "" {
		return ""
	}

	if goos == "windows" {
		normalized = normalizeWindowsHomePath(normalized)
	}

	return filepath.Clean(normalized)
}

// normalizeWindowsHomePath converts common MSYS-style paths to native form.
func normalizeWindowsHomePath(homeDir string) string {
	normalized := strings.TrimSpace(homeDir)
	if len(normalized) >= 3 && normalized[0] == '/' && isASCIILetter(normalized[1]) && normalized[2] == '/' {
		drive := strings.ToUpper(string(normalized[1]))
		normalized = drive + ":" + normalized[2:]
	}
	if len(normalized) >= 2 && isASCIILetter(normalized[0]) && normalized[1] == ':' {
		normalized = strings.ToUpper(string(normalized[0])) + normalized[1:]
	}
	return strings.ReplaceAll(normalized, "/", `\`)
}

func isASCIILetter(ch byte) bool {
	return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
}
