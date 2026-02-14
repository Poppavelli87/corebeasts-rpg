# Corebeasts RPG

Corebeasts RPG is a retro-inspired monster-battling RPG built with Phaser 3, TypeScript, and Vite. It includes overworld exploration, trainer and wild battles, creature progression/evolution, save/load, party/storage management, and a full campaign skeleton through credits.

## Quick Start (Local)

Requirements:

- Node.js 20+
- npm 10+

Install + run:

```bash
npm install
npm run dev
```

Build production web bundle:

```bash
npm run build
```

## How To Play (Controls)

Core:

- `Arrow Keys` / `WASD`: Move selection and character
- `Enter`: Confirm / interact / advance dialog
- `Esc`: Back / close menu

Overworld:

- `Enter`: Talk/interact (facing target)
- `Esc`: Pause menu (Party / Inventory / Save / Options)
- `M`: Toggle minimap
- `` ` ``: Toggle debug overlay

Battle:

- `Arrow Keys` / `WASD`: Navigate commands and moves
- `Enter`: Confirm action
- `Fight`, `Bag`, `Switch`, `Run` (wild only)
- `B`: Open Bag quickly
- `Shift` (hold): Fast-forward battle text

Mobile / Touch:

- On small/touch devices, on-screen controls appear automatically.
- Left side D-pad: movement and menu navigation.
- Right side `A`: confirm/interact.
- Right side `B`: back/cancel.
- Right side `MENU`: open/close pause menu.
- Title screen includes a mobile `Fullscreen` button (top-right).

## Build + Distribution

### Web Build (shareable zip)

One command to create a friend-shareable web zip:

```bash
npm run build:share
```

Output:

- `release/corebeasts-web-v<version>.zip`

If you already built once and only need to zip:

```bash
npm run zip:web
```

### Desktop Build (Electron)

Run desktop in development:

```bash
npm run dev:desktop
```

Build Windows desktop artifacts:

```bash
npm run build:desktop
```

Build Windows portable + installer explicitly:

```bash
npm run build:desktop:win
```

Additional targets:

```bash
npm run build:desktop:mac
npm run build:desktop:linux
```

Desktop outputs:

- `release/desktop/` (portable and installer artifacts based on target)

Note: Cross-platform packaging is toolchain/OS dependent. In practice:

- Build Windows targets on Windows.
- Build macOS targets on macOS.
- Build Linux targets on Linux.

### GitHub Pages Build

Build for repository subpath hosting:

```bash
npm run build:pages
```

The repository includes `.github/workflows/pages.yml` to deploy on push to `main`.

## Sharing With Friends

### Option A: Web

1. Run `npm run build:share`.
2. Send `release/corebeasts-web-v<version>.zip`.
3. Receiver unzips and serves the folder with a local static server.

Example local server commands:

```bash
npx serve dist
```

or

```bash
python -m http.server 4173 --directory dist
```

Then open the printed local URL in a browser.

### Option B: Desktop

1. Build with `npm run build:desktop`.
2. Zip/send files from `release/desktop/`.
3. Receiver runs the generated app/exe.

## Troubleshooting

- Windows SmartScreen warning:
  - Click `More info` then `Run anyway` for unsigned local builds.
- Missing VC++ runtime on Windows:
  - Install Microsoft Visual C++ Redistributable (x64) if app launch fails with missing runtime DLL errors.
- Blank page after opening `dist/index.html` directly:
  - Use a local web server (`npx serve dist`), not direct `file://` browsing.
- Desktop build fails on macOS/Linux target from Windows:
  - Use `build:desktop:mac` on macOS and `build:desktop:linux` on Linux or run per-OS CI.

## Known Limitations

- Desktop binaries are unsigned by default (warnings are expected on first launch).
- Cross-compiling desktop artifacts across all OSes from one machine is not guaranteed.
- Content is benchmark-driven and still under active balancing/polish.

## Repo Hygiene + Release Utilities

- License: `MIT` (`LICENSE`)
- Contribution guide: `CONTRIBUTING.md`
- Conduct: `CODE_OF_CONDUCT.md`
- Security reporting: `SECURITY.md`
- Changelog: `CHANGELOG.md`
- Release notes generator:

```bash
npm run release:notes
```

Output:

- `release/release-notes-v<version>.md`

## Exact Commands (Publish Flow)

Initialize Git and first commit (if starting from a local folder without `.git`):

```bash
git init
git add .
git commit -m "chore: initial corebeasts-rpg release"
```

Create GitHub repo and push (GitHub CLI):

```bash
gh repo create corebeasts-rpg --public --source . --remote origin --push
```

Build web zip:

```bash
npm run build:share
```

Build desktop package:

```bash
npm run build:desktop
```

Deploy to GitHub Pages:

1. Push to `main`.
2. In GitHub repo settings, set Pages source to `GitHub Actions`.
3. Workflow deploys automatically via `.github/workflows/pages.yml`.
