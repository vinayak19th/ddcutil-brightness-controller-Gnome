# Custom Brightness Controller

A GNOME Shell extension developed to precisely control your multiple monitors brightness levels via `ddcutil`.

## Features
* Multiple sliders per monitor supported natively.
* Persistence: Remembers your last configured brightness state across reloads.
* Config file populated automatically based on connected monitors using `ddcutil detect`.
* Debounced inputs to avoid hardware command saturation on sliders drag-n-drop.

## Installation

Ensure `install.sh` is executable:
```bash
chmod +x ./install.sh
./install.sh
```

## Requirements and Setup

**Important Note:** To use this extension effectively, `ddcutil` must be configured to run without `sudo` so GNOME can trigger shell commands under your user context securely.

If you haven't already done this for your operating system:
1. Ensure the `i2c-dev` module is loaded on your system.
2. Add your user to the appropriately named group (usually `i2c`): 
   ```bash
   sudo usermod -aG i2c $USER
   ```
3. Set up appropriate udev rules for the i2c devices. You usually have to reboot after this.

## Configuration

Upon its first execution, the extension maps your active monitors running the backend equivalent of `ddcutil detect --terse` and generates a declarative JSON configuration file placed inside `~/.config/custom-brightness-controller/config.json`.

You can freely edit this file to tweak terminal command calls injected into your shell context, and append more specific sliders to existing monitors (e.g., contrast options, custom gamma, colors).

Inside GNOME shell, navigate to the extension dropdown list to click on `Refresh Config` to immediately observe changes implemented.
