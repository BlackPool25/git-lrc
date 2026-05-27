# Release __VERSION__

Date: __DATE__

<!--
Release images for this version belong in: __IMAGE_DIR__
Reference files from this release folder with the placeholder syntax documented in __IMAGE_DIR__/README.md.
For manual video follow-up, keep a placeholder like <!-- VIDEO:demo.mp4 --> inside an HTML comment so release-gh can remind you after publishing.
Published raw URL base: __IMAGE_RAW_URL_BASE__
Published raw URL example: __IMAGE_RAW_URL_EXAMPLE__
-->

## Summary
- Add a concise summary of this release.

## Install and Update
New install:
```
# Linux/macOS
curl -L https://hexmos.com/ipm-install | bash && ipm i HexmosTech/git-lrc

# Windows
iwr https://hexmos.com/ipm-install-ps | iex; ipm i HexmosTech/git-lrc
```

Update:

```
lrc self-update
```

## Changes
- List the most important user-facing changes.

## Breaking Changes
- None.

## Verification
- lrc --version
- lrc --help

## Known Issues
- None.
