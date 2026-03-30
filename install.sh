#!/bin/bash
set -e

EXT_NAME="custom-brightness-controller@user.local"
ZIP_NAME="$EXT_NAME.shell-extension.zip"

echo "Packing Custom Brightness Controller extension..."
# Package the extension
gnome-extensions pack --extra-source=configHelper.js --extra-source=prefs.js --force

echo "Installing extension live..."
# Install and force a reload in GNOME Shell
gnome-extensions install "$ZIP_NAME" --force

# Enable extension
gnome-extensions enable "$EXT_NAME" || true

echo "Extension installed and enabled successfully."
echo "It has been auto-reloaded! (No GNOME Shell restart required)"
