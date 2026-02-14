# Changelog

All notable changes to this project are documented in this file.

## [0.11.0] - 2026-02-14

### Added

- Full campaign skeleton with intro, starter selection, multi-map routing, 8 Trials, and credits flow.
- Battle systems: encounters, turn-based combat, capture, inventory, switching, XP/leveling, evolution, and move slot scaling.
- Storage management loop with Bindery Terminal.
- Procedural runtime creature sprites and map tile rendering.
- Save/load persistence with difficulty/challenge settings and New Game+ support.
- Packaging/distribution tooling:
  - Web build zipping (`zip:web`)
  - Release notes generation (`release:notes`)
  - Electron desktop packaging scripts
  - GitHub Pages deployment workflow

### Changed

- Repository and documentation updated for friend/family distribution.
- Build/version scripts standardized for web and desktop release flows.
