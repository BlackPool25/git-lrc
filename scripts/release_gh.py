#!/usr/bin/env python3
"""Publish a GitHub release from markdown notes with auto-version inference.

Usage:
    python3 scripts/release_gh.py --repo HexmosTech/git-lrc [--version vX.Y.Z]
    python3 scripts/release_gh.py --repo HexmosTech/git-lrc --version vX.Y.Z --check-only
    python3 scripts/release_gh.py --print-version [--version vX.Y.Z]
"""

from __future__ import annotations

import argparse
import os
import pathlib
import re
import subprocess
import sys
import tempfile
from typing import Iterable, Optional, Tuple

SEMVER_RE = re.compile(r"^v(\d+)\.(\d+)\.(\d+)$")
IMAGE_REF_RE = re.compile(r"IMG:([^\s)]+)")
VIDEO_REF_RE = re.compile(r"(?m)^[ \t]*<!--\s*VIDEO:([^\s>]+)\s*-->[ \t]*$")
RELEASE_NOTES_DIR = pathlib.Path("docs") / "releases"
RELEASE_IMAGE_DIR = RELEASE_NOTES_DIR / "img"
RELEASE_NOTES_BRANCH = "main"
ATTACH_FILES_DOC_URL = "https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files"
MANUAL_VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm"}


def run(cmd: Iterable[str], check: bool = True) -> str:
    result = subprocess.run(list(cmd), check=check, text=True, capture_output=True)
    return result.stdout.strip()


def parse_semver(version: str) -> Optional[Tuple[int, int, int]]:
    match = SEMVER_RE.match(version)
    if not match:
        return None
    return tuple(int(x) for x in match.groups())


def validate_version(version: str) -> str:
    if not version.startswith("v"):
        version = f"v{version}"
    if not SEMVER_RE.match(version):
        raise ValueError(f"invalid version '{version}' (expected vX.Y.Z)")
    return version


def semver_max(versions: Iterable[str]) -> Optional[str]:
    valid = [(parse_semver(v), v) for v in versions]
    valid = [(k, v) for (k, v) in valid if k is not None]
    if not valid:
        return None
    valid.sort(key=lambda item: item[0])
    return valid[-1][1]


def infer_from_head_tags() -> Optional[str]:
    tags = run(["git", "tag", "--points-at", "HEAD"], check=False)
    if not tags:
        return None
    return semver_max([t.strip() for t in tags.splitlines() if t.strip()])


def infer_from_main_go() -> Optional[str]:
    main_go = pathlib.Path("main.go")
    if not main_go.exists():
        return None
    pattern = re.compile(r'^const\s+appVersion\s*=\s*"([^"]+)"')
    for line in main_go.read_text(encoding="utf-8").splitlines():
        match = pattern.match(line.strip())
        if match:
            candidate = match.group(1)
            try:
                return validate_version(candidate)
            except ValueError:
                return None
    return None


def infer_version(explicit: Optional[str]) -> str:
    if explicit:
        return validate_version(explicit)

    from_head = infer_from_head_tags()
    if from_head:
        return validate_version(from_head)

    from_source = infer_from_main_go()
    if from_source:
        return from_source

    raise ValueError(
        "unable to infer version automatically; pass --version vX.Y.Z"
    )


def release_notes_path(version: str) -> pathlib.Path:
    return RELEASE_NOTES_DIR / f"{version}.md"


def release_image_dir(version: str) -> pathlib.Path:
    return RELEASE_IMAGE_DIR / version


def normalize_release_ref(raw_ref: str, prefix: str) -> pathlib.PurePosixPath:
    candidate = pathlib.PurePosixPath(raw_ref)
    if not raw_ref or candidate.is_absolute():
        raise ValueError(f"invalid release reference '{prefix}:{raw_ref}'")
    if any(part in {"", ".", ".."} for part in candidate.parts):
        raise ValueError(f"invalid release reference '{prefix}:{raw_ref}'")
    return candidate


def raw_image_url(repo: str, version: str, image_ref: pathlib.PurePosixPath) -> str:
    return (
        f"https://raw.githubusercontent.com/{repo}/refs/heads/{RELEASE_NOTES_BRANCH}/"
        f"docs/releases/img/{version}/{image_ref.as_posix()}"
    )


def release_page_url(repo: str, version: str) -> str:
    return f"https://github.com/{repo}/releases/tag/{version}"


def collect_manual_video_refs(version: str, notes_text: str) -> list[tuple[pathlib.PurePosixPath, pathlib.Path]]:
    image_dir = release_image_dir(version)
    manual_video_refs: list[tuple[pathlib.PurePosixPath, pathlib.Path]] = []
    for match in VIDEO_REF_RE.finditer(notes_text):
        video_ref = normalize_release_ref(match.group(1), "VIDEO")
        if video_ref.suffix.lower() not in MANUAL_VIDEO_EXTENSIONS:
            raise ValueError(
                f"unsupported manual video placeholder 'VIDEO:{video_ref.as_posix()}'\n"
                "   Fix: use a .mp4, .mov, or .webm file"
            )
        local_path = image_dir.joinpath(*video_ref.parts)
        if not local_path.exists():
            raise ValueError(
                f"missing release video asset: {local_path}\n"
                f"   Fix: add the file under {image_dir} or update the VIDEO placeholder"
            )
        if not local_path.is_file():
            raise ValueError(f"release video reference must point to a file: {local_path}")
        manual_video_refs.append((video_ref, local_path))
    return manual_video_refs


def render_release_notes(repo: str, version: str, notes_text: str) -> tuple[str, list[tuple[pathlib.PurePosixPath, pathlib.Path]]]:
    image_dir = release_image_dir(version)
    if not image_dir.is_dir():
        raise ValueError(
            f"missing release image directory: {image_dir}\n"
            f"   Fix: make release-notes-init VERSION={version}"
        )

    manual_video_refs = collect_manual_video_refs(version, notes_text)

    def replace(match: re.Match[str]) -> str:
        image_ref = normalize_release_ref(match.group(1), "IMG")
        local_path = image_dir.joinpath(*image_ref.parts)
        if not local_path.exists():
            raise ValueError(
                f"missing release image asset: {local_path}\n"
                f"   Fix: add the file under {image_dir} or update the markdown reference"
            )
        if not local_path.is_file():
            raise ValueError(f"release image reference must point to a file: {local_path}")
        return raw_image_url(repo, version, image_ref)

    rendered = IMAGE_REF_RE.sub(replace, notes_text)
    if "IMG:" in rendered:
        raise ValueError(
            "unresolved IMG: placeholder remains in release notes\n"
            "   Fix: use markdown like ![alt](IMG:path/to/file.png) with files under the release image directory"
        )
    return rendered, manual_video_refs


def prepare_release_notes(repo: str, version: str) -> Tuple[pathlib.Path, str, list[tuple[pathlib.PurePosixPath, pathlib.Path]]]:
    notes_file = release_notes_path(version)
    if not notes_file.exists() or notes_file.stat().st_size == 0:
        raise ValueError(
            f"missing release notes file: {notes_file}\n"
            f"   Fix: make release-notes-init VERSION={version}"
        )

    notes_text = notes_file.read_text(encoding="utf-8")
    rendered_notes, manual_video_refs = render_release_notes(repo, version, notes_text)
    if not rendered_notes.strip():
        raise ValueError(f"release notes render to empty content: {notes_file}")
    return notes_file, rendered_notes, manual_video_refs


def ensure_local_tag(version: str) -> None:
    exists = subprocess.run(
        ["git", "rev-parse", "-q", "--verify", f"refs/tags/{version}"],
        check=False,
        text=True,
        capture_output=True,
    ).returncode == 0
    if exists:
        return
    run(["git", "tag", "-a", version, "-m", f"Release {version}"])


def ensure_remote_tag(version: str) -> None:
    result = subprocess.run(["git", "push", "origin", version], check=False)
    if result.returncode != 0:
        raise RuntimeError(f"failed to push tag {version} to origin")


def ensure_gh_cli() -> None:
    result = subprocess.run(["gh", "--version"], check=False, text=True, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError("gh CLI is not available in PATH")


def ensure_gh_repo_access(repo: str) -> None:
    result = subprocess.run(
        ["gh", "repo", "view", repo, "--json", "name"],
        check=False,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        message = (result.stderr or result.stdout).strip() or f"unable to access {repo}"
        raise RuntimeError(f"gh cannot access {repo}: {message}")


def release_exists(repo: str, version: str) -> bool:
    result = subprocess.run(
        ["gh", "release", "view", version, "--repo", repo],
        check=False,
        text=True,
        capture_output=True,
    )
    return result.returncode == 0


def publish_release(repo: str, version: str, notes_file: pathlib.Path) -> None:
    if release_exists(repo, version):
        run(
            [
                "gh",
                "release",
                "edit",
                version,
                "--repo",
                repo,
                "--title",
                version,
                "--notes-file",
                str(notes_file),
            ]
        )
        return

    run(
        [
            "gh",
            "release",
            "create",
            version,
            "--repo",
            repo,
            "--title",
            version,
            "--notes-file",
            str(notes_file),
            "--verify-tag",
        ]
    )


def write_rendered_notes(version: str, rendered_notes: str) -> pathlib.Path:
    fd, path = tempfile.mkstemp(prefix=f"{version}-release-", suffix=".md")
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(rendered_notes)
    return pathlib.Path(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish GitHub release from markdown notes")
    parser.add_argument("--repo", help="GitHub repo in owner/name form")
    parser.add_argument("--version", help="Version to publish, e.g. v1.2.3")
    parser.add_argument("--check-only", action="store_true", help="Validate release notes and image references without publishing")
    parser.add_argument("--print-version", action="store_true", help="Infer and print the resolved release version")
    args = parser.parse_args()

    try:
        version = infer_version(args.version)
    except ValueError as exc:
        print(f"❌ {exc}")
        return 2

    if args.print_version:
        print(version)
        return 0

    if not args.repo:
        print("❌ --repo is required unless --print-version is used")
        return 2

    try:
        notes_file, rendered_notes, manual_video_refs = prepare_release_notes(args.repo, version)
    except ValueError as exc:
        print(f"❌ {exc}")
        return 2

    if args.check_only:
        print(f"✅ Release notes validated: {notes_file}")
        print(f"✅ Release image directory validated: {release_image_dir(version)}")
        if manual_video_refs:
            print(f"✅ Manual video placeholders validated: {len(manual_video_refs)}")
        return 0

    rendered_notes_file: Optional[pathlib.Path] = None
    try:
        ensure_gh_cli()
        ensure_gh_repo_access(args.repo)
        ensure_local_tag(version)
        ensure_remote_tag(version)
        rendered_notes_file = write_rendered_notes(version, rendered_notes)
        publish_release(args.repo, version, rendered_notes_file)
    except Exception as exc:  # noqa: BLE001
        print(f"❌ Failed to publish GitHub release: {exc}")
        return 1
    finally:
        if rendered_notes_file and rendered_notes_file.exists():
            rendered_notes_file.unlink()

    print(f"✅ Published GitHub release: {version}")
    print("ℹ️  SBOM generation+attachment will run from the release tag in CI.")
    if manual_video_refs:
        print("⚠️  Manual video follow-up required:")
        for video_ref, local_path in manual_video_refs:
            print(
                f"   - Upload {video_ref.as_posix()} manually from {local_path} in the GitHub release editor"
            )
        print(f"   Release page: {release_page_url(args.repo, version)}")
        print(f"   GitHub attachment help: {ATTACH_FILES_DOC_URL}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
