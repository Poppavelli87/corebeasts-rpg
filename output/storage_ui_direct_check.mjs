import { chromium } from 'playwright';
import fs from 'node:fs';

const outDir = 'C:/Users/mxz/corebeasts-rpg/output/storage-ui-direct-check';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage();
const errors = [];

page.on('console', (msg) => {
  if (msg.type() === 'error') {
    errors.push({ type: 'console.error', text: msg.text() });
  }
});
page.on('pageerror', (err) => {
  errors.push({ type: 'pageerror', text: String(err) });
});

await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(600);

await page.evaluate(() => {
  const game = window.__PHASER_GAME__;
  game.scene.start('OverworldScene');
});

await page.waitForTimeout(800);

const seeded = await page.evaluate(() => {
  const game = window.__PHASER_GAME__;
  const overworld = game.scene.getScene('OverworldScene');
  const state = overworld.gameState;

  const cloneCreature = (creature) => ({
    ...creature,
    stats: { ...creature.stats },
    moves: [...creature.moves]
  });

  if (state.party.length < 2 && state.party[0]) {
    const buddy = cloneCreature(state.party[0]);
    buddy.nickname = 'Buddy';
    state.party.push(buddy);
  }

  if (state.storage.length < 2 && state.party[0]) {
    const boxOne = cloneCreature(state.party[0]);
    boxOne.nickname = 'Boxling';
    const boxTwo = cloneCreature(state.party[0]);
    boxTwo.nickname = 'Cratepaw';
    state.storage.push(boxOne, boxTwo);
  }

  overworld.publishOverworldState();
  overworld.scene.launch('PartyScene', { source: 'terminal' });
  overworld.scene.pause('OverworldScene');

  return {
    party: state.party.length,
    storage: state.storage.length,
    activeScenes: game.scene.getScenes(true).map((scene) => scene.scene.key)
  };
});

await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}/shot-initial.png` });

// Storage tab, move one creature from storage -> party.
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(120);
await page.keyboard.press('Enter');
await page.waitForTimeout(120);
await page.keyboard.press('Enter');
await page.waitForTimeout(120);
await page.keyboard.press('Enter');
await page.waitForTimeout(220);

const afterMoveToParty = await page.evaluate(() => {
  const game = window.__PHASER_GAME__;
  const overworld = game.scene.getScene('OverworldScene');
  const state = overworld.gameState;
  return {
    party: state.party.length,
    storage: state.storage.length,
    saveExists: Boolean(window.localStorage.getItem('corebeasts_save_v1'))
  };
});

await page.screenshot({ path: `${outDir}/shot-after-move-to-party.png` });

// Party tab, move one creature from party -> storage.
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(120);
await page.keyboard.press('Enter');
await page.waitForTimeout(120);
await page.keyboard.press('Enter');
await page.waitForTimeout(220);

const afterMoveToStorage = await page.evaluate(() => {
  const game = window.__PHASER_GAME__;
  const overworld = game.scene.getScene('OverworldScene');
  const state = overworld.gameState;
  return {
    party: state.party.length,
    storage: state.storage.length,
    saveExists: Boolean(window.localStorage.getItem('corebeasts_save_v1'))
  };
});

await page.screenshot({ path: `${outDir}/shot-after-move-to-storage.png` });

// Storage tab, release one creature with confirmation.
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(120);
await page.keyboard.press('Enter'); // actions
await page.waitForTimeout(120);
await page.keyboard.press('ArrowDown'); // release
await page.waitForTimeout(120);
await page.keyboard.press('Enter'); // open confirm
await page.waitForTimeout(120);
await page.keyboard.press('ArrowLeft'); // select Release (default is Cancel)
await page.waitForTimeout(120);
await page.keyboard.press('Enter'); // confirm release
await page.waitForTimeout(120);
await page.keyboard.press('Enter'); // dismiss message
await page.waitForTimeout(220);

const afterRelease = await page.evaluate(() => {
  const game = window.__PHASER_GAME__;
  const overworld = game.scene.getScene('OverworldScene');
  const state = overworld.gameState;
  return {
    party: state.party.length,
    storage: state.storage.length,
    saveExists: Boolean(window.localStorage.getItem('corebeasts_save_v1')),
    activeScenes: game.scene.getScenes(true).map((scene) => scene.scene.key)
  };
});

await page.screenshot({ path: `${outDir}/shot-after-release.png` });

// Close terminal to trigger close autosave and overworld resume.
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

const afterClose = await page.evaluate(() => {
  const game = window.__PHASER_GAME__;
  const sceneKeys = game.scene.getScenes(true).map((scene) => scene.scene.key);
  return {
    activeScenes: sceneKeys,
    saveExists: Boolean(window.localStorage.getItem('corebeasts_save_v1')),
    saveLength: (window.localStorage.getItem('corebeasts_save_v1') ?? '').length
  };
});

await page.screenshot({ path: `${outDir}/shot-after-close.png` });

const report = {
  seeded,
  afterMoveToParty,
  afterMoveToStorage,
  afterRelease,
  afterClose,
  errors
};

fs.writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));

await browser.close();
