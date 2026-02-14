import { chromium } from 'playwright';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader']
});

const page = await browser.newPage();
const url = 'http://127.0.0.1:4173';

const waitForScene = async (sceneKey, timeout = 10000) => {
  await page.waitForFunction(
    (key) => {
      const game = window.__PHASER_GAME__;
      return Boolean(game && game.scene && game.scene.isActive(key));
    },
    sceneKey,
    { timeout }
  );
};

const pressStep = async (key, delay = 150) => {
  await page.keyboard.press(key);
  await sleep(delay);
};

const triggerEncounter = async () => {
  for (let i = 0; i < 16; i += 1) {
    await pressStep('ArrowLeft', 160);
    const inBattle = await page.evaluate(() => {
      const game = window.__PHASER_GAME__;
      return Boolean(game?.scene?.isActive('BattleScene'));
    });

    if (inBattle) {
      return;
    }
  }

  for (let i = 0; i < 8; i += 1) {
    await pressStep('ArrowRight', 160);
    const inBattle = await page.evaluate(() => {
      const game = window.__PHASER_GAME__;
      return Boolean(game?.scene?.isActive('BattleScene'));
    });

    if (inBattle) {
      return;
    }
  }

  throw new Error('Failed to trigger encounter');
};

const captureCurrentBattle = async (weakenFirst) => {
  await waitForScene('BattleScene');
  await sleep(300);

  if (weakenFirst) {
    await page.keyboard.press('Enter');

    await page.waitForFunction(
      () => {
        const game = window.__PHASER_GAME__;
        const battle = game?.registry?.get('battleState');
        return Boolean(battle && battle.menuActive && !battle.actionInProgress);
      },
      null,
      { timeout: 12000 }
    );
  }

  await page.keyboard.press('KeyB');
  await sleep(120);
  await page.keyboard.press('Enter');

  await page.waitForFunction(
    () => {
      const game = window.__PHASER_GAME__;
      return Boolean(game?.scene?.isActive('OverworldScene') && !game?.scene?.isActive('BattleScene'));
    },
    null,
    { timeout: 15000 }
  );

  await sleep(300);
};

await page.goto(url, { waitUntil: 'domcontentloaded' });
await sleep(700);

await page.keyboard.press('Enter');
await waitForScene('OverworldScene');
await sleep(500);

await page.evaluate(() => {
  Math.random = () => 0;
});

await triggerEncounter();
await captureCurrentBattle(true);

await pressStep('ArrowRight', 180);
await pressStep('ArrowLeft', 180);
await captureCurrentBattle(false);

await page.keyboard.press('Escape');
await waitForScene('PartyScene');
await sleep(150);

await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await sleep(120);

await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await sleep(120);

await page.keyboard.press('Enter');
await sleep(180);
await page.keyboard.press('Enter');
await sleep(120);

await page.keyboard.press('Escape');
await sleep(120);

await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await sleep(180);
await page.keyboard.press('Enter');
await sleep(120);

await page.keyboard.press('Escape');
await waitForScene('OverworldScene');
await sleep(200);

const preRefresh = await page.evaluate(() => {
  const game = window.__PHASER_GAME__;
  const state = game?.registry?.get('gameState');
  return {
    partyCount: state?.party?.length ?? 0,
    inventory: state?.inventory ?? null,
    saveExists: Boolean(window.localStorage.getItem('corebeasts_save_v1'))
  };
});

await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(700);

await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await waitForScene('OverworldScene');
await sleep(400);

const postRefresh = await page.evaluate(() => {
  const game = window.__PHASER_GAME__;
  const state = game?.registry?.get('gameState');
  return {
    partyCount: state?.party?.length ?? 0,
    inventory: state?.inventory ?? null,
    species: (state?.party ?? []).map((entry) => entry.speciesId)
  };
});

await page.screenshot({ path: 'C:/Users/mxz/corebeasts-rpg/output/web-game/benchmark4-final.png', fullPage: true });

console.log(
  JSON.stringify(
    {
      preRefresh,
      postRefresh
    },
    null,
    2
  )
);

await browser.close();
