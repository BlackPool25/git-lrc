package hooks

import (
	"embed"
	"fmt"
)

//go:embed claude/*
var claudeAssetsFS embed.FS

func mustReadClaudeAsset(path string) string {
	content, err := claudeAssetsFS.ReadFile(path)
	if err != nil {
		panic(fmt.Sprintf("failed to load Claude asset %s: %v", path, err))
	}

	return string(content)
}

func GenerateClaudeValidatorScript() string {
	return mustReadClaudeAsset("claude/blocking-review-git-commit.sh")
}

func GenerateClaudeWrapperScript() string {
	return mustReadClaudeAsset("claude/run-blocking-review-git-commit.sh")
}

func GenerateClaudeLRCSkill() string {
	return mustReadClaudeAsset("claude/SKILL.md")
}
