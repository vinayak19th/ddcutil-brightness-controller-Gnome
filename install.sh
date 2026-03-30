#!/bin/bash
set -e

EXT_NAME="ddcutil-brightness-controller@user.local"
ZIP_NAME="$EXT_NAME.shell-extension.zip"

echo "Packing ddcutil Brightness Controller extension..."
# Package the extension (only the files needed for distribution)
gnome-extensions pack \
    --extra-source=configHelper.js \
    --extra-source=prefs.js \
    --extra-source=stylesheet.css \
    --force

echo "Installing extension..."
gnome-extensions install "$ZIP_NAME" --force

# Enable extension
gnome-extensions enable "$EXT_NAME" || true

echo "Extension installed and enabled successfully."
echo "You may need to restart GNOME Shell for changes to take effect."
