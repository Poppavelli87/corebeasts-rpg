# corebeasts-rpg

Minimal Phaser 3 + TypeScript + Vite starter with retro RPG title flow.

## Requirements

- Node.js 20+ (or current LTS)
- npm 10+

## Run

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

## Build

```bash
npm run build
```

## Lint and Format

```bash
npm run lint
npm run format
```

Fix commands:

```bash
npm run lint:fix
npm run format:fix
```

## Controls

- `Up` / `Down`: move title menu selection
- `Enter`: confirm selection
- `Esc`: go back in title screen dialogs
- `Settings -> Difficulty` (title): set New Game mode to `Easy` / `Normal` / `Hard`
- `Enter` (intro): advance dialog
- `Type` + `Backspace` + `Enter` (intro naming): edit and confirm player name
- `Left` / `Right` or `A` / `D` (starter select): choose starter
- `Enter` (starter select): confirm starter
- `Arrow keys` / `WASD`: move in overworld (tile-to-tile)
- `Enter` (overworld): interact with NPC in facing direction / advance dialog
- `Esc` (overworld): open pause menu (Party / Inventory / Save / Options)
- `Options -> Difficulty` (pause menu): change difficulty with confirmation
- `Enter` while facing `Bindery Terminal` (heal houses): open Party/Storage manager
- `Left` / `Right` (terminal): switch Party/Storage tabs
- `Enter` (terminal Party tab): move selected party creature to Storage (cannot leave party empty)
- `Enter` (terminal Storage tab): open actions (Move to Party / Release / Cancel)
- `Arrow keys` / `WASD` (battle): navigate command and move menus
- `Enter` (battle): confirm command / move
- `Fight` (battle): open move list
- `Bag` or `B` (battle): open Bag (Core Seal / Potion / Cleanse)
- `Switch` (battle): open party switch panel
- `Run` (wild battle): escape the encounter
- `Back` (trainer battle): disabled retreat command
- `Esc` (battle move list): return to command menu
- `Up` / `Down` + `Enter` (learn prompt): pick move to replace
- `Esc` (learn prompt): cancel learning
- `P` (DEV only, overworld): open warp panel to jump between towns/maps for testing
- `Enter` / `Esc` (credits): return to title
- `` ` ``: toggle debug overlay (FPS + active scene)

## Save/Load + Party Notes

- Save data uses browser `localStorage` key `corebeasts_save_v1`.
- `Continue` is enabled only when save data exists.
- Autosave triggers:
  - after battle resolution
  - after item use
  - after entering/exiting buildings
  - after party/storage move or release in Bindery Terminal
  - when closing Bindery Terminal
- New game starts with one starter creature in party and a starter inventory.
- Battles award XP; level-ups can teach moves and trigger evolution.
- Save data includes selected difficulty (`easy` / `normal` / `hard`) and preserves it across refresh + Continue.
- Creature instances persist a `bond` value used by friendship-evolution checks.
- Move capacity scales with level:
  - Lv1-9: 3 moves
  - Lv10-24: 4 moves
  - Lv25+: 5 moves

## Project Notes

- Pixel-art defaults are enabled (`pixelArt: true`, `antialias: false`, CSS `image-rendering: pixelated`).
- Includes a small WebAudio `AudioSystem` stub that generates short beeps (no asset files required).
- Random encounters trigger on grass tiles (10% chance per successful step in grass).
- Campaign flow starts with `IntroScene` and `StarterSelectionScene` before entering the overworld.
- Campaign skeleton now includes 8 Trial checkpoints and final credits flow.
- Difficulty effects:
  - `Easy`: trainer levels reduced, late-trial teams slightly smaller, reduced enemy status-application rate.
  - `Normal`: baseline campaign tuning.
  - `Hard`: trainer levels increased, mid/late trials gain extra team slots (cap 5), one tactical enemy switch per trainer battle when hard-countered.
- Trainer AI (trainer battles only) is score-based instead of random and prefers KO lines, type advantage, and useful status timing.
- World map chain:
  - `starterTown -> route1 -> verdantisTown -> northPass -> route2 -> brinegateTown -> cave1 -> stonecrossTown -> route3 -> coilhavenTown -> marsh1 -> hollowmereTown -> route4 -> obsidianForgeTown -> bridge1 -> skydriftSpiresTown -> choirfallRuins -> finalTower`
- Trial progression flags unlock gates in sequence:
  - `trial1Complete` unlocks Verdantis north gate and Route 2 path.
  - `trial2Complete` unlocks Cave 1 access.
  - `trial3Complete` unlocks Route 3.
  - `trial4Complete` unlocks Marsh 1.
  - `trial5Complete` unlocks Route 4.
  - `trial6Complete` unlocks Bridge 1 / Skydrift path.
  - `trial7Complete` unlocks Choirfall + Final Tower access.
  - `trial8Complete` (Final Tower boss) triggers `CreditsScene`.
- Gate blockers are visible objects and show a seal message until required flags are set.
- Encounter data is map-driven (per-map level range + weighted encounter table), including ultra-rare pools (`~1-2%`) and story-flag-gated rare entries.
- Creature roster expanded to 54 species (18 three-stage evolution lines).
- Species definitions include `rareFlag`; rare wild encounters use a special intro line and subtle battle-sprite tint.
- Evolution rules support:
  - level threshold
  - friendship threshold (`bond`)
  - use-item evolution
  - region-restricted evolution
  - timed/story-flag conditions
- Postgame:
  - Entering credits sets `postgameUnlocked = true`.
  - Optional boss trainers appear in `cave1`, `marsh1`, and `finalTower` after postgame unlock.
  - Defeating each optional boss unlocks additional regional rare encounter entries.
- Creature visuals are generated procedurally at runtime (battle front/back + overworld icon) via `ProcSpriteFactory` with deterministic seeds per creature id.
- Scenes:
  - `BootScene`
  - `TitleScene`
  - `IntroScene`
  - `StarterSelectionScene`
  - `OverworldScene`
  - `BattleScene`
  - `PartyScene`
  - `CreditsScene`
  - `DebugOverlayScene`
