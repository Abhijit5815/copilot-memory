#!/bin/bash
set -e

if ! command -v npm >/dev/null 2>&1; then
	echo "npm is required but was not found on PATH."
	exit 1
fi

if ! command -v code >/dev/null 2>&1; then
	echo "VS Code CLI 'code' is required but was not found on PATH."
	echo "Open VS Code and run: Shell Command: Install 'code' command in PATH"
	exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
	echo "npx is required but was not found on PATH."
	exit 1
fi

echo "→ Installing dependencies..."
npm install

echo "→ Building extension..."
npm run compile

echo "→ Packaging extension..."
if ! npx @vscode/vsce package --allow-missing-repository; then
	echo "Packaging failed. Ensure @vscode/vsce can be resolved by npx and try again."
	exit 1
fi

VSIX=$(ls -t copilot-memory-*.vsix 2>/dev/null | head -n 1)

if [ -z "$VSIX" ]; then
	echo "Packaging succeeded but no VSIX file was found."
	exit 1
fi

echo "→ Installing $VSIX into VS Code..."
code --install-extension "$VSIX"

EXT_ID=$(node -p "(() => { const p=require('./package.json'); return p.publisher + '.' + p.name; })()")
if ! code --list-extensions | grep -Fxq "$EXT_ID"; then
	echo "Installation command completed but $EXT_ID was not found in installed extensions."
	exit 1
fi

echo ""
echo "✓ Done! Restart VS Code for the extension to take effect."
