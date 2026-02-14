export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;

export const SCENE_KEYS = {
  BOOT: 'BootScene',
  TITLE: 'TitleScene',
  INTRO: 'IntroScene',
  STARTER_SELECTION: 'StarterSelectionScene',
  OVERWORLD: 'OverworldScene',
  BATTLE: 'BattleScene',
  PARTY: 'PartyScene',
  CREDITS: 'CreditsScene',
  GAME: 'GameScene',
  DEBUG: 'DebugOverlayScene'
} as const;

export const MENU_OPTIONS = [
  'New Game',
  'Continue',
  'New Game+',
  'Settings',
  'Help',
  'Quit'
] as const;

export type MenuOption = (typeof MENU_OPTIONS)[number];
