import Phaser from 'phaser';
import './style.css';
import { GAME_HEIGHT, GAME_WIDTH, MENU_OPTIONS, SCENE_KEYS } from './game/constants';
import { BattleScene } from './game/scenes/BattleScene';
import { BootScene } from './game/scenes/BootScene';
import { CreditsScene } from './game/scenes/CreditsScene';
import { DebugOverlayScene } from './game/scenes/DebugOverlayScene';
import { IntroScene } from './game/scenes/IntroScene';
import { OverworldScene } from './game/scenes/OverworldScene';
import { PartyScene } from './game/scenes/PartyScene';
import { StarterSelectionScene } from './game/scenes/StarterSelectionScene';
import { TitleScene } from './game/scenes/TitleScene';

const sceneList: Phaser.Types.Scenes.SceneType[] = [
  BootScene,
  TitleScene,
  IntroScene,
  StarterSelectionScene,
  OverworldScene,
  BattleScene,
  PartyScene,
  CreditsScene
];

if (import.meta.env.DEV) {
  sceneList.push(DebugOverlayScene);
}

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root node');
}

app.innerHTML = '<div id="game-root"></div>';

const game = new Phaser.Game({
  type: Phaser.CANVAS,
  parent: 'game-root',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#05050a',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: sceneList
});

window.__PHASER_GAME__ = game;

const canvas = game.canvas;
if (canvas) {
  canvas.style.touchAction = 'none';
  canvas.style.userSelect = 'none';
  canvas.style.webkitUserSelect = 'none';

  const preventCanvasTouchScroll = (event: TouchEvent): void => {
    if (event.cancelable) {
      event.preventDefault();
    }
  };

  canvas.addEventListener('touchmove', preventCanvasTouchScroll, { passive: false });
  canvas.addEventListener('touchstart', preventCanvasTouchScroll, { passive: false });
  canvas.addEventListener('gesturestart', preventCanvasTouchScroll as EventListener, {
    passive: false
  });

  game.events.once(Phaser.Core.Events.DESTROY, () => {
    canvas.removeEventListener('touchmove', preventCanvasTouchScroll);
    canvas.removeEventListener('touchstart', preventCanvasTouchScroll);
    canvas.removeEventListener('gesturestart', preventCanvasTouchScroll as EventListener);
  });
}

type StepCapableGame = Phaser.Game & {
  step: (time: number, delta: number) => void;
};

let steppedTime = 0;

window.render_game_to_text = () => {
  const scenes = game.scene
    .getScenes(true)
    .map((scene) => scene.scene.key)
    .filter((key) => key !== SCENE_KEYS.DEBUG);

  const activeScene = scenes[0] ?? 'none';
  const payload = {
    coordinateSystem: 'origin: top-left (0,0), +x: right, +y: down',
    activeScene,
    activeScenes: scenes,
    titleMenu: game.registry.get('titleMenuOptions') ?? MENU_OPTIONS,
    overworldState: game.registry.get('overworldState') ?? null,
    battleState: game.registry.get('battleState') ?? null,
    gameState: game.registry.get('gameState') ?? null
  };

  return JSON.stringify(payload);
};

window.advanceTime = (ms: number) => {
  const stepMs = 1000 / 60;
  const steps = Math.max(1, Math.round(ms / stepMs));
  const steppedGame = game as StepCapableGame;

  for (let index = 0; index < steps; index += 1) {
    steppedTime += stepMs;
    steppedGame.step(steppedTime, stepMs);
  }
};
