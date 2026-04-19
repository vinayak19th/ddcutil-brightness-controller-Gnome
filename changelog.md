# Changelog

## 2026-04-19
### v1.1.2

- Improved GNOME Shell stability by debouncing slider-triggered command execution and config writes to reduce subprocess and IO bursts.
- Added safer menu lifecycle handling with async error guards and rebuild reentrancy protection to avoid overlapping menu builds.
- Hardened slider value processing with finite-number checks, clamping, and safe range handling to prevent invalid UI states.
- Updated refresh behavior to explicitly run monitor discovery via `ddcutil detect` from the refresh action.
- Kept first-run convenience by allowing one-time auto-detection only when no config file exists; subsequent startups do not auto-detect.
