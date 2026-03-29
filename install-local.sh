#!/bin/bash
set -e

echo "→ Installing dependencies..."
npm install

echo "→ Compiling TypeScript..."
npm run compile

echo "→ Packaging extension..."
npx @vscode/vsce package --no-dependencies --allow-missing-repository

VSIX=$(ls *.vsix | head -n 1)
echo "→ Installing $VSIX into VS Code..."
code --install-extension "$VSIX"

echo ""
echo "✓ Done! Restart VS Code for the extension to take effect."
