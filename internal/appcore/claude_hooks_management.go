package appcore

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"strings"

	"github.com/HexmosTech/git-lrc/configpath"
	hooksvc "github.com/HexmosTech/git-lrc/hooks"
	"github.com/HexmosTech/git-lrc/storage"
)

const (
	claudeManagedMatcher       = "Bash"
	claudeManagedCondition     = "Bash(git commit *)"
	claudeManagedStatusMessage = "Running blocking LiveReview gate before git commit"
	claudeManagedValidatorName = "blocking-review-git-commit.sh"
	claudeManagedWrapperName   = "run-blocking-review-git-commit.sh"
	claudeManagedHookTimeout   = 1260
)

type claudeGlobalInstallState struct {
	SettingsPath    string
	HooksDir        string
	ValidatorPath   string
	WrapperPath     string
	SkillPath       string
	SettingsManaged bool
	ValidatorExists bool
	WrapperExists   bool
	SkillExists     bool
}

func claudeGlobalInstallStatus() (claudeGlobalInstallState, error) {
	settingsPath, err := configpath.ResolveClaudeSettingsPath()
	if err != nil {
		return claudeGlobalInstallState{}, err
	}
	hooksDir, err := configpath.ResolveClaudeManagedHooksDir()
	if err != nil {
		return claudeGlobalInstallState{}, err
	}
	skillPath, err := configpath.ResolveClaudeLRCSkillPath()
	if err != nil {
		return claudeGlobalInstallState{}, err
	}
	validatorPath := filepath.Join(hooksDir, claudeManagedValidatorName)
	wrapperPath := filepath.Join(hooksDir, claudeManagedWrapperName)

	settingsBytes, err := readClaudeSettingsIfPresent(settingsPath)
	if err != nil {
		return claudeGlobalInstallState{}, err
	}

	return claudeGlobalInstallState{
		SettingsPath:    settingsPath,
		HooksDir:        hooksDir,
		ValidatorPath:   validatorPath,
		WrapperPath:     wrapperPath,
		SkillPath:       skillPath,
		SettingsManaged: hasManagedClaudeHook(settingsBytes),
		ValidatorExists: fileExists(validatorPath),
		WrapperExists:   fileExists(wrapperPath),
		SkillExists:     fileExists(skillPath),
	}, nil
}

func installClaudeGlobalHooks() (claudeGlobalInstallState, error) {
	state, err := claudeGlobalInstallStatus()
	if err != nil {
		return claudeGlobalInstallState{}, err
	}

	if err := storage.EnsureClaudeManagedHooksDir(state.HooksDir); err != nil {
		return claudeGlobalInstallState{}, err
	}
	if err := storage.WriteClaudeHookScript(state.ValidatorPath, []byte(generateGlobalClaudeValidatorScript())); err != nil {
		return claudeGlobalInstallState{}, err
	}
	if err := storage.WriteClaudeHookScript(state.WrapperPath, []byte(generateGlobalClaudeWrapperScript())); err != nil {
		return claudeGlobalInstallState{}, err
	}
	if err := storage.WriteClaudeSkillFile(state.SkillPath, []byte(generateClaudeLRCSkill())); err != nil {
		return claudeGlobalInstallState{}, err
	}

	settingsBytes, err := readClaudeSettingsIfPresent(state.SettingsPath)
	if err != nil {
		return claudeGlobalInstallState{}, err
	}
	next, err := ensureManagedClaudeHook(settingsBytes, state.ValidatorPath)
	if err != nil {
		return claudeGlobalInstallState{}, err
	}
	if err := storage.WriteClaudeSettingsFile(state.SettingsPath, next); err != nil {
		return claudeGlobalInstallState{}, err
	}

	return claudeGlobalInstallStatus()
}

func uninstallClaudeGlobalHooks() (claudeGlobalInstallState, error) {
	state, err := claudeGlobalInstallStatus()
	if err != nil {
		return claudeGlobalInstallState{}, err
	}

	settingsBytes, err := readClaudeSettingsIfPresent(state.SettingsPath)
	if err != nil {
		return claudeGlobalInstallState{}, err
	}
	next, changed, err := removeManagedClaudeHook(settingsBytes)
	if err != nil {
		return claudeGlobalInstallState{}, err
	}
	if changed {
		if err := storage.WriteClaudeSettingsFile(state.SettingsPath, next); err != nil {
			return claudeGlobalInstallState{}, err
		}
	}

	if err := storage.RemoveClaudeHookScript(state.ValidatorPath); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return claudeGlobalInstallState{}, err
	}
	if err := storage.RemoveClaudeHookScript(state.WrapperPath); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return claudeGlobalInstallState{}, err
	}
	if err := storage.RemoveClaudeSkillFile(state.SkillPath); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return claudeGlobalInstallState{}, err
	}
	_ = storage.RemoveDirIfEmpty(state.HooksDir)
	_ = storage.RemoveDirIfEmpty(filepath.Dir(state.HooksDir))
	_ = storage.RemoveDirIfEmpty(filepath.Dir(state.SkillPath))
	_ = storage.RemoveDirIfEmpty(filepath.Dir(filepath.Dir(state.SkillPath)))

	return claudeGlobalInstallStatus()
}

func detectLegacyRepoClaudeIntegration(repoRoot string) []string {
	if strings.TrimSpace(repoRoot) == "" {
		return nil
	}
	candidates := []string{
		filepath.Join(repoRoot, ".claude", "settings.local.json"),
		filepath.Join(repoRoot, ".claude", "hooks", claudeManagedValidatorName),
		filepath.Join(repoRoot, ".claude", "hooks", claudeManagedWrapperName),
	}
	legacy := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		if fileExists(candidate) {
			legacy = append(legacy, candidate)
		}
	}
	return legacy
}

func removeLegacyRepoClaudeIntegration(repoRoot string) ([]string, error) {
	legacy := detectLegacyRepoClaudeIntegration(repoRoot)
	if len(legacy) == 0 {
		return nil, nil
	}

	removed := make([]string, 0, len(legacy))
	for _, path := range legacy {
		existed, err := storage.RemoveFileIfExists(path, false)
		if err != nil {
			return removed, err
		}
		if existed {
			removed = append(removed, path)
		}
	}

	claudeHooksDir := filepath.Join(repoRoot, ".claude", "hooks")
	_ = storage.RemoveDirIfEmpty(claudeHooksDir)
	_ = storage.RemoveDirIfEmpty(filepath.Join(repoRoot, ".claude"))

	return removed, nil
}

func readClaudeSettingsIfPresent(path string) ([]byte, error) {
	settingsBytes, err := storage.ReadClaudeSettingsFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	return settingsBytes, nil
}

func hasManagedClaudeHook(settingsBytes []byte) bool {
	root, err := decodeClaudeSettings(settingsBytes)
	if err != nil {
		return false
	}

	preToolUse, ok := preToolUseMatchers(root)
	if !ok {
		return false
	}
	for _, matcher := range preToolUse {
		matcherMap, ok := matcher.(map[string]any)
		if !ok || strings.TrimSpace(stringValue(matcherMap["matcher"])) != claudeManagedMatcher {
			continue
		}
		hooks, ok := objectArray(matcherMap["hooks"])
		if !ok {
			continue
		}
		for _, hookEntry := range hooks {
			if isManagedClaudeHookEntry(hookEntry) {
				return true
			}
		}
	}
	return false
}

func ensureManagedClaudeHook(settingsBytes []byte, validatorPath string) ([]byte, error) {
	root, err := decodeClaudeSettings(settingsBytes)
	if err != nil {
		return nil, err
	}

	managedHook := map[string]any{
		"type":          "command",
		"if":            claudeManagedCondition,
		"command":       validatorPath,
		"args":          []any{},
		"timeout":       claudeManagedHookTimeout,
		"statusMessage": claudeManagedStatusMessage,
	}

	hooksMap := ensureObjectField(root, "hooks")
	preToolUse, _ := objectArray(hooksMap["PreToolUse"])
	matcherIndex := -1
	for i, matcher := range preToolUse {
		matcherMap, ok := matcher.(map[string]any)
		if ok && strings.TrimSpace(stringValue(matcherMap["matcher"])) == claudeManagedMatcher {
			matcherIndex = i
			break
		}
	}

	if matcherIndex == -1 {
		preToolUse = append(preToolUse, map[string]any{
			"matcher": claudeManagedMatcher,
			"hooks":   []any{managedHook},
		})
		hooksMap["PreToolUse"] = preToolUse
		root["hooks"] = hooksMap
		return marshalClaudeSettings(root)
	}

	matcherMap, _ := preToolUse[matcherIndex].(map[string]any)
	hooks, _ := objectArray(matcherMap["hooks"])
	hookIndex := -1
	for i, hookEntry := range hooks {
		if isManagedClaudeHookEntry(hookEntry) {
			hookIndex = i
			break
		}
	}
	if hookIndex >= 0 {
		hooks[hookIndex] = managedHook
	} else {
		hooks = append(hooks, managedHook)
	}
	matcherMap["hooks"] = hooks
	preToolUse[matcherIndex] = matcherMap
	hooksMap["PreToolUse"] = preToolUse
	root["hooks"] = hooksMap
	return marshalClaudeSettings(root)
}

func removeManagedClaudeHook(settingsBytes []byte) ([]byte, bool, error) {
	root, err := decodeClaudeSettings(settingsBytes)
	if err != nil {
		return nil, false, err
	}

	hooksValue, ok := root["hooks"]
	if !ok {
		next, err := marshalClaudeSettings(root)
		return next, false, err
	}
	hooksMap, ok := hooksValue.(map[string]any)
	if !ok {
		return nil, false, fmt.Errorf("invalid Claude settings: hooks must be an object")
	}
	preToolUse, ok := objectArray(hooksMap["PreToolUse"])
	if !ok {
		next, err := marshalClaudeSettings(root)
		return next, false, err
	}

	changed := false
	nextMatchers := make([]any, 0, len(preToolUse))
	for _, matcher := range preToolUse {
		matcherMap, ok := matcher.(map[string]any)
		if !ok || strings.TrimSpace(stringValue(matcherMap["matcher"])) != claudeManagedMatcher {
			nextMatchers = append(nextMatchers, matcher)
			continue
		}

		hooks, _ := objectArray(matcherMap["hooks"])
		nextHooks := make([]any, 0, len(hooks))
		for _, hookEntry := range hooks {
			if isManagedClaudeHookEntry(hookEntry) {
				changed = true
				continue
			}
			nextHooks = append(nextHooks, hookEntry)
		}
		if len(nextHooks) == 0 {
			changed = true
			continue
		}
		matcherMap["hooks"] = nextHooks
		nextMatchers = append(nextMatchers, matcherMap)
	}

	if len(nextMatchers) == 0 {
		delete(hooksMap, "PreToolUse")
	} else {
		hooksMap["PreToolUse"] = nextMatchers
	}
	if len(hooksMap) == 0 {
		delete(root, "hooks")
	} else {
		root["hooks"] = hooksMap
	}

	next, err := marshalClaudeSettings(root)
	if err != nil {
		return nil, false, err
	}
	return next, changed, nil
}

func decodeClaudeSettings(settingsBytes []byte) (map[string]any, error) {
	if len(strings.TrimSpace(string(settingsBytes))) == 0 {
		return map[string]any{}, nil
	}
	var root map[string]any
	if err := json.Unmarshal(settingsBytes, &root); err != nil {
		return nil, fmt.Errorf("failed to parse Claude settings JSON: %w", err)
	}
	if root == nil {
		root = map[string]any{}
	}
	return root, nil
}

func marshalClaudeSettings(root map[string]any) ([]byte, error) {
	if root == nil {
		root = map[string]any{}
	}
	data, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("failed to encode Claude settings JSON: %w", err)
	}
	return append(data, '\n'), nil
}

func preToolUseMatchers(root map[string]any) ([]any, bool) {
	hooksValue, ok := root["hooks"]
	if !ok {
		return nil, false
	}
	hooksMap, ok := hooksValue.(map[string]any)
	if !ok {
		return nil, false
	}
	return objectArray(hooksMap["PreToolUse"])
}

func ensureObjectField(root map[string]any, key string) map[string]any {
	if existing, ok := root[key].(map[string]any); ok {
		return existing
	}
	created := map[string]any{}
	root[key] = created
	return created
}

func objectArray(value any) ([]any, bool) {
	if value == nil {
		return []any{}, false
	}
	items, ok := value.([]any)
	return items, ok
}

func stringValue(value any) string {
	text, _ := value.(string)
	return text
}

func isManagedClaudeHookEntry(value any) bool {
	hookMap, ok := value.(map[string]any)
	if !ok {
		return false
	}
	if strings.TrimSpace(stringValue(hookMap["type"])) != "command" {
		return false
	}
	if strings.TrimSpace(stringValue(hookMap["if"])) != claudeManagedCondition {
		return false
	}
	return isManagedClaudeCommandPath(stringValue(hookMap["command"]))
}

func isManagedClaudeCommandPath(path string) bool {
	normalized := strings.ReplaceAll(strings.TrimSpace(path), `\`, "/")
	return strings.HasSuffix(normalized, "/.lrc/claude/hooks/"+claudeManagedValidatorName)
}

func generateGlobalClaudeValidatorScript() string {
	return hooksvc.GenerateClaudeValidatorScript()
}

func generateGlobalClaudeWrapperScript() string {
	return hooksvc.GenerateClaudeWrapperScript()
}

func generateClaudeLRCSkill() string {
	return strings.ReplaceAll(hooksvc.GenerateClaudeLRCSkill(), "\t", "  ")
}
