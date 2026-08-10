import { expect, test, type Page } from '@playwright/test';

const ROOM_TRANSITION_TIMEOUT = 10_000;
const CITY_ROOM_ONE_MAX_HEALTH = 425;
const CITY_ROOM_TWO_MAX_HEALTH = 425;

async function whileHoldingKey(
  page: Page,
  key: string,
  action: () => Promise<void>,
) {
  await page.keyboard.down(key);
  try {
    await action();
  } finally {
    await page.keyboard.up(key);
  }
}

async function holdKeyFor(page: Page, key: string, duration: number) {
  await whileHoldingKey(page, key, () => page.waitForTimeout(duration));
}

async function enterGame(page: Page) {
  await enterTitle(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toHaveAttribute('data-scene', 'game');
  await enableEnemyHealth(page);
}

async function enterTitle(page: Page) {
  await page.goto('/');
  await expect(page.locator('main')).toHaveAttribute('data-scene', 'start');

  const bounds = await getCanvasBounds(page);
  const startButton = getCanvasPoint(bounds, 640, 402);
  await page.mouse.click(startButton.x, startButton.y);
  await expect(page.locator('main')).toHaveAttribute('data-scene', 'title');
}

async function enableEnemyHealth(page: Page) {
  const adminButton = page.getByRole('button', { name: 'ADMIN' });
  await adminButton.click();
  await page.getByRole('button', { name: 'Enemy health display' }).click();
  await adminButton.click();
}

async function getCanvasBounds(page: Page) {
  const canvas = page.locator('#game-root canvas');
  const bounds = await canvas.boundingBox();

  if (!bounds) {
    throw new Error('Phaser canvas bounds are unavailable');
  }

  return bounds;
}

function getCanvasPoint(
  bounds: Awaited<ReturnType<typeof getCanvasBounds>>,
  x: number,
  y: number,
) {
  return {
    x: bounds.x + bounds.width * (x / 1280),
    y: bounds.y + bounds.height * (y / 720),
  };
}

async function fireAt(
  page: Page,
  bounds: Awaited<ReturnType<typeof getCanvasBounds>>,
  x: number,
  y: number,
  duration: number,
) {
  const point = getCanvasPoint(bounds, x, y);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  try {
    await page.waitForTimeout(duration);
  } finally {
    await page.mouse.up();
  }
}

async function fireShotsAt(
  page: Page,
  bounds: Awaited<ReturnType<typeof getCanvasBounds>>,
  x: number,
  y: number,
  count: number,
) {
  const point = getCanvasPoint(bounds, x, y);
  await page.mouse.move(point.x, point.y);

  for (let shot = 0; shot < count; shot += 1) {
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(160);
  }
}

async function runAndFireAt(
  page: Page,
  bounds: Awaited<ReturnType<typeof getCanvasBounds>>,
  x: number,
  y: number,
  duration: number,
) {
  const point = getCanvasPoint(bounds, x, y);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  try {
    await holdKeyFor(page, 'KeyD', duration);
  } finally {
    await page.mouse.up();
  }
}

type FireTarget = [x: number, y: number, durationMs: number];

const CITY_ROOM_ONE_GROUND_TARGETS: FireTarget[] = [
  [640, 630, 1200],
  [950, 630, 2000],
  [1120, 630, 2500],
];

async function clearRoom(
  page: Page,
  bounds: Awaited<ReturnType<typeof getCanvasBounds>>,
  targets: FireTarget[],
) {
  for (const [x, y, duration] of targets) {
    await fireAt(page, bounds, x, y, duration);
  }
}

async function finishActiveFlyers(
  page: Page,
  bounds: Awaited<ReturnType<typeof getCanvasBounds>>,
) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const target = await page.evaluate(() => {
      type RuntimeScene = {
        cameras: { main: { scrollX: number; scrollY: number } };
        enemies: Array<{
          active: boolean;
          currentHealth: number;
          x: number;
          y: number;
          constructor: { name: string };
        }>;
      };
      type DebugGame = { scene: { getScene: (key: string) => unknown } };
      const game = (window as unknown as { __game?: DebugGame }).__game!;
      const scene = game.scene.getScene('game') as RuntimeScene;
      const flyer = scene.enemies.find(
        (enemy) =>
          enemy.active &&
          enemy.currentHealth > 0 &&
          enemy.constructor.name === 'FlyingEnemy',
      );
      if (!flyer) {
        return null;
      }

      return {
        x: Math.min(1240, Math.max(40, flyer.x - scene.cameras.main.scrollX)),
        y: Math.min(680, Math.max(40, flyer.y - scene.cameras.main.scrollY)),
      };
    });

    if (!target) {
      return;
    }

    await fireAt(page, bounds, target.x, target.y, 1200);
  }
}

async function clearCityRoomOne(
  page: Page,
  bounds: Awaited<ReturnType<typeof getCanvasBounds>>,
) {
  await clearRoom(page, bounds, CITY_ROOM_ONE_GROUND_TARGETS);

  // 지상 교전을 이어 간다. 마지막 비행 적은 2단 발판 위에 있으므로,
  // 지형이 양쪽 탄환을 막는 현재 구조에서는 바닥에서 피해를 줄 수 없다.
  await runAndFireAt(page, bounds, 1120, 630, 8000);
  await holdKeyFor(page, 'KeyD', 2000);
  await whileHoldingKey(page, 'Space', () => page.waitForTimeout(100));
  await page.waitForTimeout(900);
  await whileHoldingKey(page, 'Space', () => page.waitForTimeout(100));
  await page.waitForTimeout(900);
  await fireAt(page, bounds, 640, 360, 1200);
  await finishActiveFlyers(page, bounds);
}

async function enterExitPortal(page: Page) {
  await whileHoldingKey(page, 'KeyD', async () => {
    // 포탈은 클리어된 방의 먼 끝에 열리며, 그 안에 서서 위/W를 눌러야만
    // 플레이어를 통과시킴. ArrowUp은 진입로 지형을 넘는 것과 포탈 진입을
    // 겸하므로, 다음 아레나가 잠길 때까지 눌러줌.
    for (let hop = 0; hop < 34; hop += 1) {
      const roomState = await page
        .locator('main')
        .getAttribute('data-room-state');
      if (roomState === 'locked') {
        return;
      }
      await page.keyboard.down('ArrowUp');
      await page.waitForTimeout(70);
      await page.keyboard.up('ArrowUp');
      await page.waitForTimeout(300);
    }
    await expect(page.locator('main')).toHaveAttribute(
      'data-room-state',
      'locked',
      { timeout: ROOM_TRANSITION_TIMEOUT },
    );
  });
}

async function clearCurrentRoomThroughRuntime(page: Page) {
  await page.evaluate(() => {
    type RuntimeEnemy = { active: boolean };
    type RuntimeScene = {
      enemies: RuntimeEnemy[];
      roomDirector: {
        notifyEnemyDefeated: (enemy: RuntimeEnemy) => void;
      };
    };
    type DebugGame = {
      scene: { getScene: (key: string) => unknown };
    };

    const game = (window as unknown as { __game?: DebugGame }).__game;
    if (!game) {
      throw new Error('Missing development game handle');
    }

    const scene = game.scene.getScene('game') as RuntimeScene;
    for (const enemy of scene.enemies.filter(({ active }) => active)) {
      scene.roomDirector.notifyEnemyDefeated(enemy);
    }
  });
}

test('boots the Phaser canvas', async ({ page }) => {
  await page.goto('/');

  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('width', '1280');
  await expect(canvas).toHaveAttribute('height', '720');
});

test('enters the title from the start screen with a key press', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('main')).toHaveAttribute('data-scene', 'start');

  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toHaveAttribute('data-scene', 'title');
});

test('opens sound settings from both the title and pause screens', async ({
  page,
}) => {
  await enterTitle(page);

  await page.getByRole('button', { name: '설정' }).click();
  const settings = page.getByRole('dialog', { name: '설정' });
  await expect(settings).toBeVisible();
  const graphicsTab = settings.getByRole('tab', { name: '그래픽' });
  const soundTab = settings.getByRole('tab', { name: '사운드' });
  await expect(graphicsTab).toHaveAttribute('aria-selected', 'true');
  await expect(soundTab).toHaveAttribute('aria-selected', 'false');
  await expect(graphicsTab).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(soundTab).toHaveAttribute('aria-selected', 'true');
  await expect(soundTab).toBeFocused();
  await page.keyboard.press('Home');
  await expect(graphicsTab).toHaveAttribute('aria-selected', 'true');
  const displayResolution = page.getByRole('combobox', {
    name: '표시 해상도',
  });
  await expect(displayResolution).toHaveValue('auto');
  await displayResolution.selectOption('960x540');
  await expect(page.locator('main')).toHaveAttribute(
    'data-display-resolution',
    '960x540',
  );
  await expect.poll(async () => (await getCanvasBounds(page)).width).toBe(960);
  await page.getByRole('button', { name: '그래픽 기본값' }).click();
  await expect(displayResolution).toHaveValue('auto');
  await soundTab.click();
  await expect(soundTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('combobox', { name: '표시 해상도' })).toHaveCount(
    0,
  );
  const masterVolume = page.getByRole('slider', { name: '마스터 볼륨' });
  await expect(masterVolume).toHaveValue('90');
  await masterVolume.focus();
  await page.keyboard.press('End');
  await expect(masterVolume).toHaveValue('100');
  await expect(
    page.getByRole('button', { name: '사운드 기본값' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '사운드 기본값' }).click();
  await expect(masterVolume).toHaveValue('90');

  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);

  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toHaveAttribute('data-scene', 'game');
  await page.keyboard.press('Escape');
  const resume = page.getByRole('button', { name: '재개' });
  const pauseSettings = page.getByRole('button', { name: '설정' });
  await expect(resume).toBeVisible();
  await expect(pauseSettings).toBeVisible();
  expect(
    await Promise.all(
      [resume, pauseSettings].map((button) =>
        button.evaluate((element) => element.getBoundingClientRect().width),
      ),
    ),
  ).toEqual([140, 140]);

  await pauseSettings.click();
  await expect(settings).toBeVisible();
  await page.getByRole('button', { name: '닫기' }).click();
  await expect(settings).toHaveCount(0);
  await expect(page.getByRole('button', { name: '재개' })).toBeVisible();
});

test('keeps the HUD inside the rendered canvas at narrow and wide ratios', async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 2560, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await enterGame(page);

    const canvas = await getCanvasBounds(page);
    const shell = await page.locator('.game-shell').boundingBox();
    const hud = await page.locator('.hud-layer').boundingBox();

    if (!hud || !shell) {
      throw new Error('HUD bounds are unavailable');
    }

    if (viewport.width / viewport.height >= 16 / 9) {
      expect(canvas.x).toBeCloseTo(shell.x);
      expect(canvas.width).toBeCloseTo(shell.width);
      expect(canvas.width / canvas.height).toBeCloseTo(
        await page
          .locator('#game-root canvas')
          .evaluate((element) => element.width / element.height),
      );
    }

    expect(hud.x).toBeGreaterThanOrEqual(canvas.x);
    expect(hud.y).toBeGreaterThanOrEqual(canvas.y);
    expect(hud.x + hud.width).toBeLessThanOrEqual(canvas.x + canvas.width);
    expect(hud.y + hud.height).toBeLessThanOrEqual(canvas.y + canvas.height);
  }
});

test('covers a wide viewport with the stage shatter snapshot', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1080 });
  await enterGame(page);
  const sizes = await page.evaluate(
    () =>
      new Promise<{
        cameraHeight: number;
        cameraWidth: number;
        coverHeight: number;
        coverWidth: number;
      }>((resolve, reject) => {
        type RuntimeImage = {
          active: boolean;
          displayHeight: number;
          displayWidth: number;
          type: string;
          texture?: { key: string };
        };
        type RuntimeScene = {
          cameras: { main: { height: number; width: number } };
          children: { list: RuntimeImage[] };
          stageTransitionDirector: {
            playEffect: (event: 'shatter', onBlackout: () => void) => void;
          };
        };
        type DebugGame = { scene: { getScene: (key: string) => unknown } };
        const game = (window as unknown as { __game?: DebugGame }).__game!;
        const scene = game.scene.getScene('game') as RuntimeScene;
        const timeout = window.setTimeout(
          () => reject(new Error('Missing stage shatter cover')),
          1_000,
        );
        const inspect = () => {
          const cover = scene.children.list.find(
            ({ active, texture, type }) =>
              active &&
              texture?.key === 'stage-shatter-snapshot' &&
              type === 'Image',
          );
          if (!cover) {
            window.requestAnimationFrame(inspect);
            return;
          }
          window.clearTimeout(timeout);
          resolve({
            cameraHeight: scene.cameras.main.height,
            cameraWidth: scene.cameras.main.width,
            coverHeight: cover.displayHeight,
            coverWidth: cover.displayWidth,
          });
        };
        scene.stageTransitionDirector.playEffect('shatter', () => {});
        inspect();
      }),
  );

  expect(sizes.coverWidth).toBeCloseTo(sizes.cameraWidth);
  expect(sizes.coverHeight).toBeCloseTo(sizes.cameraHeight);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          type DebugGame = {
            scene: {
              getScene: (key: string) => {
                textures: { exists: (key: string) => boolean };
              };
            };
          };
          const game = (window as unknown as { __game?: DebugGame }).__game!;
          return game.scene
            .getScene('game')
            .textures.exists('stage-shatter-snapshot');
        }),
      { timeout: 12_000 },
    )
    .toBe(false);
});

test('shows the title before the stage one background finishes loading', async ({
  page,
}) => {
  let releaseBackground: (() => void) | undefined;
  let markBackgroundRequested: (() => void) | undefined;
  const backgroundGate = new Promise<void>((resolve) => {
    releaseBackground = resolve;
  });
  const backgroundRequested = new Promise<void>((resolve) => {
    markBackgroundRequested = resolve;
  });

  await page.route('**/assets/backgrounds/stage-01.webp', async (route) => {
    markBackgroundRequested?.();
    await backgroundGate;
    await route.continue();
  });

  try {
    await enterTitle(page);
    await backgroundRequested;
    await expect(page.locator('main')).toHaveAttribute('data-scene', 'title');

    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toHaveAttribute('data-scene', 'title');

    releaseBackground?.();
    await expect(page.locator('main')).toHaveAttribute('data-scene', 'game');
  } finally {
    releaseBackground?.();
  }
});

test('loads stage backgrounds one step ahead', async ({ page }) => {
  const requestedBackgrounds = new Set<string>();
  page.on('request', (request) => {
    const fileName = new URL(request.url()).pathname
      .split('/')
      .find((segment) => /^stage-\d{2}\.webp$/.test(segment));

    if (fileName) {
      requestedBackgrounds.add(fileName);
    }
  });

  await enterTitle(page);
  expect(requestedBackgrounds).toEqual(new Set(['stage-01.webp']));

  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toHaveAttribute('data-scene', 'game');
  await expect.poll(() => requestedBackgrounds.has('stage-02.webp')).toBe(true);
  expect(requestedBackgrounds.has('stage-03.webp')).toBe(false);
  expect(requestedBackgrounds.has('stage-04.webp')).toBe(false);
  expect(requestedBackgrounds.has('stage-05.webp')).toBe(false);
});

test('loads enemy and terrain art one stage ahead', async ({ page }) => {
  const requestedAssets = new Set<string>();
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/\/assets\/(enemies|terrain)\/stage-[12]-/.test(pathname)) {
      requestedAssets.add(pathname.split('/').at(-1) ?? '');
    }
  });

  await enterTitle(page);
  await expect
    .poll(
      () =>
        requestedAssets.has('stage-1-neared.png') &&
        requestedAssets.has('stage-1-floor-left.png'),
    )
    .toBe(true);
  expect(
    [...requestedAssets].some((asset) => asset.startsWith('stage-2-')),
  ).toBe(false);

  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toHaveAttribute('data-scene', 'game');
  await expect
    .poll(
      () =>
        requestedAssets.has('stage-2-neared.png') &&
        requestedAssets.has('stage-2-floor-left.png'),
    )
    .toBe(true);
});

test('starts combat as soon as the room opens', async ({ page }) => {
  await enterTitle(page);
  await page.keyboard.press('Enter');

  await expect(page.locator('main')).toHaveAttribute('data-scene', 'game');
  await expect(page.locator('main')).toHaveAttribute(
    'data-room-state',
    'locked',
  );
  await expect(page.getByRole('meter', { name: 'Enemy health' })).toHaveCount(
    0,
  );

  await enableEnemyHealth(page);
  await expect(
    page.getByRole('meter', { name: 'Enemy health' }),
  ).toHaveAttribute('aria-valuenow', CITY_ROOM_ONE_MAX_HEALTH.toString());
});

test('enters the game and shows the React HUD', async ({ page }) => {
  await enterGame(page);

  await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing');
  await expect(page.locator('main')).toHaveAttribute(
    'data-room-state',
    'locked',
  );
  await expect(
    page.getByRole('meter', { name: 'Player health' }),
  ).toHaveAttribute('aria-valuenow', '100');
  const enemyHealthMeter = page.getByRole('meter', { name: 'Enemy health' });
  await expect(enemyHealthMeter).toHaveAttribute(
    'aria-valuenow',
    CITY_ROOM_ONE_MAX_HEALTH.toString(),
  );
  await expect(enemyHealthMeter).toHaveAttribute(
    'aria-valuemax',
    CITY_ROOM_ONE_MAX_HEALTH.toString(),
  );
});

test('fills four weapon slots and switches them with number keys', async ({
  page,
}) => {
  await enterGame(page);

  const inventory = page.getByRole('list', {
    name: 'Weapon inventory',
  });
  const slots = inventory.getByRole('listitem');
  const expectSlotFrame = (
    index: number,
    frame: 'active' | 'empty' | 'neutral',
  ) =>
    expect(slots.nth(index)).toHaveCSS(
      'border-image-source',
      new RegExp(`slot-frame-${frame}\\.png`),
    );

  await expect(slots).toHaveCount(4);
  await expect(slots.nth(0)).toHaveAttribute('aria-label', '1: SMG');
  await expect(slots.nth(0)).toHaveAttribute('aria-current', 'true');
  await expectSlotFrame(0, 'active');
  await expect(slots.nth(1)).toHaveAttribute('aria-label', '2: Empty');
  await expectSlotFrame(1, 'empty');

  const adminButton = page.getByRole('button', { name: 'ADMIN' });
  await adminButton.click();
  await page.getByRole('button', { name: 'SHOTGUN 지급' }).click();
  await expect(page.locator('main')).toHaveAttribute('data-weapon', 'shotgun');
  await expect(slots.nth(1)).toHaveAttribute('aria-label', '2: SHOTGUN');
  await expect(slots.nth(1)).toHaveAttribute('aria-current', 'true');
  await expectSlotFrame(1, 'active');
  await expectSlotFrame(0, 'neutral');

  await page.getByRole('button', { name: 'BURST RIFLE 지급' }).click();
  await expect(page.locator('main')).toHaveAttribute(
    'data-weapon',
    'burst-rifle',
  );
  await expect(slots.nth(2)).toHaveAttribute('aria-current', 'true');
  await adminButton.click();

  await page.keyboard.press('Digit1');
  await expect(page.locator('main')).toHaveAttribute('data-weapon', 'smg');
  await expect(slots.nth(0)).toHaveAttribute('aria-current', 'true');

  await page.keyboard.press('Digit2');
  await expect(page.locator('main')).toHaveAttribute('data-weapon', 'shotgun');
  await expect(slots.nth(1)).toHaveAttribute('aria-current', 'true');

  await page.keyboard.press('Digit4');
  await expect(page.locator('main')).toHaveAttribute('data-weapon', 'shotgun');
  await expect(slots.nth(3)).toHaveAttribute('aria-label', '4: Empty');
});

test('accepts WASD movement and mouse fire input', async ({ page }) => {
  const runtimeErrors: Error[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error));

  await enterGame(page);

  await holdKeyFor(page, 'KeyD', 180);
  await page.keyboard.press('KeyW');

  const bounds = await getCanvasBounds(page);

  await page.mouse.move(
    bounds.x + bounds.width * 0.75,
    bounds.y + bounds.height * 0.45,
  );
  await page.mouse.down();
  await page.waitForTimeout(240);
  await page.mouse.up();

  expect(runtimeErrors).toEqual([]);
});

test('supports alternate controls and dash input', async ({ page }) => {
  const runtimeErrors: Error[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error));

  await enterGame(page);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing');

  await whileHoldingKey(page, 'ArrowRight', async () => {
    await page.keyboard.press('Shift');
    await page.waitForTimeout(220);
  });
  await page.keyboard.press('Space');

  const bounds = await getCanvasBounds(page);

  await page.mouse.click(
    bounds.x + bounds.width * 0.7,
    bounds.y + bounds.height * 0.5,
    { button: 'right' },
  );

  expect(runtimeErrors).toEqual([]);
});

test('enemy detects the player and deals ranged damage', async ({ page }) => {
  await enterGame(page);
  await page.waitForTimeout(1000);

  const healthMeter = page.getByRole('meter', { name: 'Player health' });
  await expect(healthMeter).toHaveAttribute('aria-valuenow', '100');

  const bounds = await getCanvasBounds(page);
  await fireShotsAt(page, bounds, 640, 630, 6);
  await expect(
    page.getByRole('meter', { name: 'Enemy health' }),
  ).not.toHaveAttribute('aria-valuenow', CITY_ROOM_ONE_MAX_HEALTH.toString());

  await holdKeyFor(page, 'KeyD', 2600);

  await expect(healthMeter).not.toHaveAttribute('aria-valuenow', '100', {
    timeout: 5000,
  });
});

test('melee enemy pursues the player and deals contact damage', async ({
  page,
}) => {
  await enterGame(page);

  const healthMeter = page.getByRole('meter', { name: 'Player health' });
  await expect(healthMeter).toHaveAttribute('aria-valuenow', '100');

  await holdKeyFor(page, 'KeyD', 400);

  await expect(healthMeter).not.toHaveAttribute('aria-valuenow', '100', {
    timeout: 5000,
  });
});

test('invincibility mode prevents player health loss', async ({ page }) => {
  await enterTitle(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toHaveAttribute('data-scene', 'game');

  const adminButton = page.getByRole('button', { name: 'ADMIN' });
  const toggle = page.getByRole('button', { name: 'Invincibility mode' });
  await expect(toggle).toHaveCount(0);
  await adminButton.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('main')).toHaveAttribute('data-invincible', 'true');

  const healthMeter = page.getByRole('meter', { name: 'Player health' });
  await holdKeyFor(page, 'KeyD', 1000);
  await page.waitForTimeout(2000);
  await expect(healthMeter).toHaveAttribute('aria-valuenow', '100');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await holdKeyFor(page, 'KeyD', 400);
  await expect(healthMeter).not.toHaveAttribute('aria-valuenow', '100', {
    timeout: 5000,
  });
});

test('admin menu closes and jumps directly to a selected stage', async ({
  page,
}) => {
  const runtimeErrors: Error[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error));

  await enterTitle(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toHaveAttribute('data-scene', 'game');

  const adminButton = page.getByRole('button', { name: 'ADMIN' });
  const adminMenu = page.getByRole('dialog', { name: 'Admin menu' });

  await expect(adminButton).toHaveAttribute('aria-expanded', 'false');
  await adminButton.click();
  await expect(adminButton).toHaveAttribute('aria-expanded', 'true');
  await expect(adminMenu).toBeVisible();

  for (let stageNumber = 1; stageNumber <= 5; stageNumber += 1) {
    await expect(
      page.getByRole('button', { name: `${stageNumber}스테이지`, exact: true }),
    ).toBeVisible();
  }

  await page.getByRole('button', { name: '닫기' }).click();
  await expect(adminMenu).toHaveCount(0);
  await expect(adminButton).toHaveAttribute('aria-expanded', 'false');

  await adminButton.click();
  await page.getByRole('button', { name: '2스테이지', exact: true }).click();
  await expect(adminMenu).toHaveCount(0);
  await expect(
    page.getByRole('meter', { name: 'Player health' }),
  ).toHaveAttribute('aria-valuemax', '115');
  expect(runtimeErrors).toEqual([]);
});

test('shows the stage guide between the location and admin button', async ({
  page,
}) => {
  await enterTitle(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toHaveAttribute('data-scene', 'game');

  const location = page.getByLabel('Stage location');
  const guideButton = page.getByRole('button', { name: '조작 가이드' });
  const adminButton = page.getByRole('button', { name: 'ADMIN' });

  await expect(page.locator('.hud-layer .stage-location')).toHaveCount(0);
  await expect(page.locator('.admin-controls .stage-location')).toHaveCount(1);
  await expect(
    page.locator('.admin-controls [aria-label="조작 가이드"]'),
  ).toHaveCount(1);
  await expect(location).toContainText('STAGE 1 | THE CITY');
  await expect(location).toContainText('ROOM #1');

  const [locationBox, guideBox, adminBox] = await Promise.all([
    location.boundingBox(),
    guideButton.boundingBox(),
    adminButton.boundingBox(),
  ]);
  expect(locationBox).not.toBeNull();
  expect(guideBox).not.toBeNull();
  expect(adminBox).not.toBeNull();
  expect(locationBox!.y + locationBox!.height).toBeLessThanOrEqual(guideBox!.y);
  expect(guideBox!.y + guideBox!.height).toBeLessThanOrEqual(adminBox!.y);

  await guideButton.click();
  const guide = page.getByRole('dialog', { name: '조작 가이드' });
  await expect(guide).toContainText('A / D · ← / →');
  await expect(guide).toContainText('SPACE / W / ↑');
  await expect(guide).toContainText('S / ↓');
  await expect(guide).toContainText('1 – 4');
  await expect(guide).toContainText('ESC');
  await expect(guide).toContainText('R / ENTER');
  await expect(guide).toHaveJSProperty('open', true);
  expect(await guide.evaluate((dialog) => dialog.matches(':modal'))).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        type DebugGame = { scene: { isPaused: (key: string) => boolean } };
        const game = (window as unknown as { __game?: DebugGame }).__game!;
        return game.scene.isPaused('game');
      }),
    )
    .toBe(true);
  await page.keyboard.press('Escape');
  await expect(guide).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        type DebugGame = { scene: { isPaused: (key: string) => boolean } };
        const game = (window as unknown as { __game?: DebugGame }).__game!;
        return game.scene.isPaused('game');
      }),
    )
    .toBe(false);

  await guideButton.click();
  await guide.click({ position: { x: 4, y: 4 } });
  await expect(guide).toHaveCount(0);

  await adminButton.click();
  await page.getByRole('button', { name: '보스', exact: true }).first().click();
  await expect(location).toContainText('ROOM #3');
});

test('stage two spawns each standard enemy with its supplied atlas', async ({
  page,
}) => {
  await enterGame(page);
  await page.getByRole('button', { name: 'ADMIN' }).click();
  await page.getByRole('button', { name: '2스테이지', exact: true }).click();
  await expect(
    page.getByRole('meter', { name: 'Player health' }),
  ).toHaveAttribute('aria-valuemax', '115');

  const textures = await page.evaluate(() => {
    type RuntimeEnemy = { texture: { key: string } };
    type RuntimeScene = { enemies: RuntimeEnemy[] };
    type DebugGame = {
      scene: { getScene: (key: string) => unknown };
    };

    const game = (window as unknown as { __game?: DebugGame }).__game;
    if (!game) {
      throw new Error('Missing development game handle');
    }

    return (game.scene.getScene('game') as RuntimeScene).enemies.map(
      ({ texture }) => texture.key,
    );
  });

  expect(new Set(textures)).toEqual(
    new Set(['stage-2-neared', 'stage-2-ranged', 'stage-2-flying']),
  );
});

test('stage three uses pipe crawlers, captors, and face-only blockers', async ({
  page,
}) => {
  await enterGame(page);
  await page.getByRole('button', { name: 'ADMIN' }).click();
  await page
    .getByRole('button', { name: '3스테이지', exact: true })
    .click();
  await expect(
    page.getByRole('meter', { name: 'Player health' }),
  ).toHaveAttribute('aria-valuemax', '130');
  const playerTexture = await page.evaluate(() => {
    type RuntimeScene = { player: { texture: { key: string } } };
    type DebugGame = { scene: { getScene: (key: string) => unknown } };
    const game = (window as unknown as { __game?: DebugGame }).__game!;
    return (game.scene.getScene('game') as RuntimeScene).player.texture.key;
  });
  expect(playerTexture).toBe('stage-3-player');
  await expect(page.locator('main')).toHaveAttribute(
    'data-room-state',
    'locked',
    { timeout: 10_000 },
  );
  // 콜드 점프 후 스테이지 3 아틀라스가 도착하며 방이 다시 지어질 때까지 기다려,
  // 천장 정비병의 스프라이트/애니메이션이 준비된 뒤에 상태를 읽는다.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          type RuntimeScene = {
            enemies: Array<{
              anims: { currentAnim?: { key: string } };
              texture: { key: string };
            }>;
          };
          type DebugGame = { scene: { getScene: (key: string) => unknown } };
          const game = (window as unknown as { __game?: DebugGame }).__game!;
          const enemies = (game.scene.getScene('game') as RuntimeScene).enemies;
          return enemies.find(({ texture }) => texture.key === 'stage-3-flying')
            ?.anims.currentAnim?.key;
        }),
      { timeout: 10_000 },
    )
    .toBe('stage-3-flying-pipe-idle');

  const result = await page.evaluate(() => {
    type DamageResult = { applied: boolean; defeated: boolean };
    type RuntimeEnemy = {
      anims: { currentAnim?: { key: string } };
      body: { reset: (x: number, y: number) => void };
      currentHealth: number;
      setPosition: (x: number, y: number) => void;
      setVelocity: (x: number, y: number) => void;
      takeProjectileDamage: (
        damage: number,
        x: number,
        y: number,
      ) => DamageResult;
      texture: { key: string };
      x: number;
      y: number;
    };
    type RuntimePlayer = {
      anims: { currentAnim?: { key: string } };
      body: { reset: (x: number, y: number) => void };
      setPosition: (x: number, y: number) => void;
      texture: { key: string };
    };
    type RuntimeScene = {
      cameras: { main: { scrollX: number; scrollY: number } };
      enemies: RuntimeEnemy[];
      player: RuntimePlayer;
      terrainBuilder: {
        pipeObjects: Array<{ texture?: { key: string } }>;
      };
    };
    type DebugGame = {
      scene: { getScene: (key: string) => unknown };
    };

    const game = (window as unknown as { __game?: DebugGame }).__game;
    if (!game) {
      throw new Error('Missing development game handle');
    }

    const scene = game.scene.getScene('game') as RuntimeScene;
    const enemies = scene.enemies;
    const blocker = enemies.find(
      ({ texture }) => texture.key === 'stage-3-neared',
    );
    if (!blocker) {
      throw new Error('Missing stage 3 blocker');
    }

    const healthBefore = blocker.currentHealth;
    const blocked = blocker.takeProjectileDamage(
      10,
      blocker.x,
      blocker.y,
    );
    const healthAfterShield = blocker.currentHealth;

    scene.player.setPosition(330, 600);
    scene.player.body.reset(330, 600);
    blocker.setPosition(650, blocker.y);
    blocker.body.reset(650, blocker.y);
    blocker.setVelocity(0, 0);
    const crawler = enemies.find(
      ({ texture }) => texture.key === 'stage-3-flying',
    );

    return {
      blocked,
      healthBefore,
      healthAfterShield,
      textures: enemies.map(({ texture }) => texture.key),
      pipeTextures: scene.terrainBuilder.pipeObjects.flatMap(({ texture }) =>
        texture ? [texture.key] : [],
      ),
      crawlerAnimation: crawler?.anims.currentAnim?.key,
      crawlerY: crawler?.y,
    };
  });

  expect(new Set(result.textures)).toEqual(
    new Set([
      'stage-3-flying',
      'stage-3-ranged',
      'stage-3-neared',
    ]),
  );
  expect(result.crawlerY).toBeLessThan(180);
  expect(result.crawlerAnimation).toBe('stage-3-flying-pipe-idle');
  expect(new Set(result.pipeTextures)).toEqual(
    new Set([
      'stage-3-pipe-left',
      'stage-3-pipe-middle',
      'stage-3-pipe-right',
    ]),
  );
  expect(result.blocked.applied).toBe(false);
  expect(result.healthAfterShield).toBe(result.healthBefore);

  // 재배치한 방어형은 원래 발판을 벗어나 바닥으로 낙하하므로, 정착한 뒤에
  // 노출 바이저 좌표를 다시 읽는다(발 정렬 바디 상단, 스프라이트 중심 위 약 41px).
  await page.waitForTimeout(500);
  const faceTarget = await page.evaluate(() => {
    type RuntimeScene = {
      cameras: { main: { scrollX: number; scrollY: number } };
      enemies: Array<{
        texture: { key: string };
        x: number;
        y: number;
        setVelocity: (x: number, y: number) => void;
      }>;
    };
    type DebugGame = { scene: { getScene: (key: string) => unknown } };
    const game = (window as unknown as { __game?: DebugGame }).__game!;
    const scene = game.scene.getScene('game') as RuntimeScene;
    const blocker = scene.enemies.find(
      ({ texture }) => texture.key === 'stage-3-neared',
    )!;
    blocker.setVelocity(0, 0);
    return {
      x: blocker.x - scene.cameras.main.scrollX,
      y: blocker.y - 41 - scene.cameras.main.scrollY,
    };
  });

  const bounds = await getCanvasBounds(page);
  await fireShotsAt(page, bounds, faceTarget.x, faceTarget.y, 3);
  await expect
    .poll(() =>
      page.evaluate(() => {
        type RuntimeScene = {
          enemies: Array<{
            currentHealth: number;
            texture: { key: string };
          }>;
        };
        type DebugGame = {
          scene: { getScene: (key: string) => unknown };
        };
        const game = (window as unknown as { __game?: DebugGame }).__game!;
        const enemies = (game.scene.getScene('game') as RuntimeScene).enemies;
        return enemies.find(
          ({ texture }) => texture.key === 'stage-3-neared',
        )?.currentHealth;
      }),
    )
    .toBeLessThan(result.healthAfterShield);
});

test('stage four uses three infernal patterns with at most two attackers', async ({
  page,
}) => {
  await enterGame(page);
  await page.getByRole('button', { name: 'ADMIN' }).click();
  await page
    .getByRole('button', { name: '4스테이지', exact: true })
    .click();
  await expect(
    page.getByRole('meter', { name: 'Player health' }),
  ).toHaveAttribute('aria-valuemax', '150');
  await expect(page.locator('main')).toHaveAttribute(
    'data-room-state',
    'locked',
    { timeout: 10_000 },
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        type RuntimeScene = { anims: { exists: (key: string) => boolean } };
        type DebugGame = { scene: { getScene: (key: string) => unknown } };
        const game = (window as unknown as { __game?: DebugGame }).__game!;
        const { anims } = game.scene.getScene('game') as RuntimeScene;
        return [
          'stage-4-dog-idle',
          'stage-4-dog-attack',
          'stage-4-dog-walk',
          'stage-4-dog-death',
          'stage-4-takedown-idle',
          'stage-4-takedown-death-fall',
          'stage-4-takedown-death-land',
          'stage-4-floating-idle',
          'stage-4-floating-attack',
          'stage-4-floating-death-fall',
          'stage-4-floating-death-land',
        ].every((key) => anims.exists(key));
      }),
    )
    .toBe(true);

  const result = await page.evaluate(async () => {
    type RuntimeEnemy = {
      active: boolean;
      anims: { currentAnim?: { key: string } };
      constructor: { name: string };
      getData: (key: string) => unknown;
      texture: { key: string };
      updateCombat: (
        time: number,
        target: RuntimePlayer,
        fireProjectile: () => void,
      ) => boolean;
      x: number;
      y: number;
    };
    type RuntimePlayer = {
      body: { reset: (x: number, y: number) => void };
      setPosition: (x: number, y: number) => void;
    };
    type RuntimeScene = {
      enemies: RuntimeEnemy[];
      player: RuntimePlayer;
    };
    type DebugGame = { scene: { getScene: (key: string) => unknown } };
    const game = (window as unknown as { __game?: DebugGame }).__game!;
    const scene = game.scene.getScene('game') as RuntimeScene;

    const executioner = scene.enemies.find(
      ({ constructor }) => constructor.name === 'ExecutionerDollEnemy',
    )!;
    scene.player.setPosition(executioner.x + 200, executioner.y);
    scene.player.body.reset(executioner.x + 200, executioner.y);
    executioner.updateCombat(0, scene.player, () => undefined);
    const idleAnimation = executioner.anims.currentAnim?.key;
    scene.player.setPosition(executioner.x + 200, executioner.y + 100);
    scene.player.body.reset(executioner.x + 200, executioner.y + 100);
    executioner.updateCombat(0, scene.player, () => undefined);
    const flyAnimation = executioner.anims.currentAnim?.key;

    scene.player.setPosition(2_500, 600);
    scene.player.body.reset(2_500, 600);
    let maximumAttackers = 0;
    let sawThreeNearbyEnemies = false;
    for (let sample = 0; sample < 30; sample += 1) {
      const active = scene.enemies.filter(({ active }) => active);
      maximumAttackers = Math.max(
        maximumAttackers,
        active.filter((enemy) => enemy.getData('stage-four-attacking')).length,
      );
      sawThreeNearbyEnemies ||=
        active.filter(
          ({ x, y }) => Math.hypot(x - 2_500, y - 600) <= 760,
        ).length >= 3;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }

    return {
      textures: scene.enemies.map(({ texture }) => texture.key),
      dogAnimation: scene.enemies.find(
        ({ texture }) => texture.key === 'stage-4-dog',
      )?.anims.currentAnim?.key,
      floatingAnimation: scene.enemies.find(
        ({ texture }) => texture.key === 'stage-4-floating',
      )?.anims.currentAnim?.key,
      playerAnimation: scene.player.anims.currentAnim?.key,
      playerTexture: scene.player.texture.key,
      idleAnimation,
      flyAnimation,
      maximumAttackers,
      sawThreeNearbyEnemies,
    };
  });

  expect(new Set(result.textures)).toEqual(
    new Set([
      'stage-4-dog',
      'stage-4-takedown',
      'stage-4-floating',
    ]),
  );
  expect(['stage-4-dog-idle', 'stage-4-dog-attack', 'stage-4-dog-walk']).toContain(
    result.dogAnimation,
  );
  expect(['stage-4-floating-idle', 'stage-4-floating-attack']).toContain(
    result.floatingAnimation,
  );
  expect(result.playerTexture).toBe('stage-4-player');
  expect(result.playerAnimation).toBe('stage-4-player-idle');
  expect(result.idleAnimation).toBe('stage-4-takedown-idle');
  expect(result.flyAnimation).toBe('stage-4-takedown-fly');
  expect(result.sawThreeNearbyEnemies).toBe(true);
  expect(result.maximumAttackers).toBe(2);
});

test('stage four flying enemies change death pose after landing', async ({
  page,
}) => {
  await enterGame(page);
  await page.getByRole('button', { name: 'ADMIN' }).click();
  await page
    .getByRole('button', { name: '4스테이지', exact: true })
    .click();
  await expect(page.locator('main')).toHaveAttribute(
    'data-room-state',
    'locked',
    { timeout: 10_000 },
  );

  const targetTextures = ['stage-4-takedown', 'stage-4-floating'];
  await expect
    .poll(() =>
      page.evaluate(() => {
        type RuntimeScene = { anims: { exists: (key: string) => boolean } };
        type DebugGame = { scene: { getScene: (key: string) => unknown } };
        const game = (window as unknown as { __game?: DebugGame }).__game!;
        const { anims } = game.scene.getScene('game') as RuntimeScene;
        return [
          'stage-4-takedown-death-fall',
          'stage-4-takedown-death-land',
          'stage-4-floating-death-fall',
          'stage-4-floating-death-land',
        ].every((key) => anims.exists(key));
      }),
    )
    .toBe(true);

  const falling = await page.evaluate((textures) => {
    type RuntimeEnemy = {
      anims: { currentAnim?: { key: string } };
      body: { reset: (x: number, y: number) => void };
      defeat: () => void;
      setPosition: (x: number, y: number) => void;
      texture: { key: string };
      x: number;
      y: number;
    };
    type RuntimeScene = { enemies: RuntimeEnemy[] };
    type DebugGame = { scene: { getScene: (key: string) => unknown } };
    const game = (window as unknown as { __game?: DebugGame }).__game!;
    const { enemies } = game.scene.getScene('game') as RuntimeScene;
    return textures.map((texture) => {
      const enemy = enemies.find((candidate) => candidate.texture.key === texture)!;
      enemy.setPosition(enemy.x, 220);
      enemy.body.reset(enemy.x, 220);
      enemy.defeat();
      return { animation: enemy.anims.currentAnim?.key, y: enemy.y };
    });
  }, targetTextures);

  expect(falling).toEqual([
    { animation: 'stage-4-takedown-death-fall', y: 220 },
    { animation: 'stage-4-floating-death-fall', y: 220 },
  ]);
  await expect
    .poll(() =>
      page.evaluate((textures) => {
        type RuntimeEnemy = {
          anims: { currentAnim?: { key: string } };
          texture: { key: string };
          y: number;
        };
        type RuntimeScene = { enemies: RuntimeEnemy[] };
        type DebugGame = { scene: { getScene: (key: string) => unknown } };
        const game = (window as unknown as { __game?: DebugGame }).__game!;
        const { enemies } = game.scene.getScene('game') as RuntimeScene;
        return textures.map((texture) => {
          const enemy = enemies.find(
            (candidate) => candidate.texture.key === texture,
          );
          return { animation: enemy?.anims.currentAnim?.key, y: enemy?.y };
        });
      }, targetTextures),
    )
    .toEqual([
      { animation: 'stage-4-takedown-death-land', y: 586 },
      { animation: 'stage-4-floating-death-land', y: 619 },
    ]);
});

test('stage five uses three celestial bullet enemies with at most two attackers', async ({
  page,
}) => {
  await enterGame(page);
  await page.getByRole('button', { name: 'ADMIN' }).click();
  await page.getByRole('button', { name: '5스테이지', exact: true }).click();
  await expect(page.getByLabel('Stage location')).toContainText(
    'STAGE 5 | THE RETURN',
  );
  await expect(page.locator('main')).toHaveAttribute(
    'data-room-state',
    'locked',
    { timeout: 10_000 },
  );

  const result = await page.evaluate(async () => {
    type RuntimeEnemy = {
      active: boolean;
      getData: (key: string) => unknown;
      texture: { key: string };
    };
    type RuntimePlayer = {
      anims: { currentAnim?: { key: string } };
      body: { reset: (x: number, y: number) => void };
      depth: number;
      setFlipX: (flipX: boolean) => void;
      setPosition: (x: number, y: number) => void;
      texture: { key: string };
      x: number;
      y: number;
    };
    type RuntimeDisplayObject = {
      active: boolean;
      anims?: { currentAnim?: { key: string } };
      depth: number;
      texture?: { key: string };
      visible: boolean;
      x: number;
      y: number;
    };
    type RuntimeScene = {
      children: { list: RuntimeDisplayObject[] };
      enemies: RuntimeEnemy[];
      player: RuntimePlayer;
      syncPlayerHalo: (pointerX: number) => void;
    };
    type DebugGame = { scene: { getScene: (key: string) => unknown } };
    const game = (window as unknown as { __game?: DebugGame }).__game!;
    const scene = game.scene.getScene('game') as RuntimeScene;

    scene.player.setPosition(1_700, 360);
    scene.player.body.reset(1_700, 360);
    let maximumAttackers = 0;
    let sawProjectile = false;
    for (let sample = 0; sample < 40; sample += 1) {
      maximumAttackers = Math.max(
        maximumAttackers,
        scene.enemies.filter(
          (enemy) => enemy.active && enemy.getData('stage-five-attacking'),
        ).length,
      );
      sawProjectile ||= scene.children.list.some(
        ({ active, texture }) =>
          active &&
          (texture?.key === 'celestial-bullet-placeholder' ||
            texture?.key === 'celestial-spear-placeholder'),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    const halo = scene.children.list.find(
      ({ texture }) => texture?.key === 'stage-5-player-halo',
    )!;
    scene.syncPlayerHalo(scene.player.x - 100);
    const leftPointerXOffset = halo.x - scene.player.x;
    scene.player.setFlipX(true);
    scene.syncPlayerHalo(scene.player.x - 100);
    const leftPointerAfterFlipXOffset = halo.x - scene.player.x;
    scene.syncPlayerHalo(scene.player.x + 100);
    const rightPointerXOffset = halo.x - scene.player.x;

    return {
      pointerOffsets: {
        leftPointerAfterFlipXOffset,
        leftPointerXOffset,
        rightPointerXOffset,
      },
      halo: {
        animation: halo.anims?.currentAnim?.key,
        depth: halo.depth,
        visible: halo.visible,
        xOffset: halo.x - scene.player.x,
        yOffset: halo.y - scene.player.y,
      },
      textures: scene.enemies.map(({ texture }) => texture.key),
      playerAnimation: scene.player.anims.currentAnim?.key,
      playerDepth: scene.player.depth,
      playerTexture: scene.player.texture.key,
      maximumAttackers,
      sawProjectile,
    };
  });

  expect(new Set(result.textures)).toEqual(
    new Set([
      'stage-5-supporter',
      'stage-5-executor',
      'stage-5-oracle',
    ]),
  );
  expect(result.maximumAttackers).toBeLessThanOrEqual(2);
  expect(result.sawProjectile).toBe(true);
  expect(result.playerTexture).toBe('stage-5-player');
  expect(result.playerAnimation).toBe('stage-5-player-fly');
  expect(result.halo).toEqual({
    animation: 'stage-5-player-halo-spin',
    depth: 7.25,
    visible: true,
    xOffset: -6,
    yOffset: -34,
  });
  expect(result.pointerOffsets).toEqual({
    leftPointerAfterFlipXOffset: 6,
    leftPointerXOffset: 6,
    rightPointerXOffset: -6,
  });
  expect(result.halo.depth).toBeLessThan(result.playerDepth);
});

test('stage five boss direct jump loads the ascension room floor skin', async ({
  page,
}) => {
  await enterGame(page);
  await page.getByRole('button', { name: 'ADMIN' }).click();
  await page.getByRole('button', { name: '보스' }).nth(4).click();
  await expect(page.getByLabel('Stage location')).toContainText(
    'STAGE 5 | THE RETURN',
  );
  await expect(page.getByRole('meter', { name: 'Boss health' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        type RuntimeEnemy = {
          anims: { currentAnim?: { key: string } };
          texture: { key: string };
        };
        type RuntimeScene = { enemies: RuntimeEnemy[] };
        type DebugGame = { scene: { getScene: (key: string) => unknown } };
        const game = (window as unknown as { __game?: DebugGame }).__game!;
        const boss = (game.scene.getScene('game') as RuntimeScene).enemies[0];
        return {
          animation: boss?.anims.currentAnim?.key,
          texture: boss?.texture.key,
        };
      }),
    )
    .toEqual({
      animation: expect.stringMatching(/^stage-5-boss-/),
      texture: 'stage-5-boss',
    });
  await expect(page.locator('main')).toHaveAttribute(
    'data-room-state',
    'locked',
    { timeout: ROOM_TRANSITION_TIMEOUT },
  );

  await clearCurrentRoomThroughRuntime(page);
  await expect(page.locator('main')).toHaveAttribute(
    'data-room-state',
    'cleared',
  );
  expect(
    await page.evaluate(() => {
      type RuntimeScene = {
        weaponSystem: { feedback: { display: { visible: boolean } } };
      };
      type DebugGame = { scene: { getScene: (key: string) => unknown } };
      const game = (window as unknown as { __game?: DebugGame }).__game!;
      return (game.scene.getScene('game') as RuntimeScene).weaponSystem
        .feedback.display.visible;
    }),
  ).toBe(true);

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          type RuntimeScene = {
            activeRoomConfig: { id: string };
            cameras: { main: { midPoint: { x: number }; zoom: number } };
            children: {
              list: Array<{
                active: boolean;
                alpha: number;
                texture?: { key: string };
              }>;
            };
            combatUi: { victoryOverlay: { visible: boolean } };
            floorBuilder: {
              skinObjects: Array<{ texture?: { key: string } }>;
            };
            player: { x: number };
            weaponSystem: {
              feedback: { display: { visible: boolean } };
            };
          };
          type DebugGame = { scene: { getScene: (key: string) => unknown } };
          const game = (window as unknown as { __game?: DebugGame }).__game!;
          const scene = game.scene.getScene('game') as RuntimeScene;
          return {
            cameraCenterOffset: Math.abs(
              scene.cameras.main.midPoint.x - scene.player.x,
            ),
            cameraZoom: scene.cameras.main.zoom,
            roomId: scene.activeRoomConfig.id,
            siegeTextureKeys: scene.children.list.flatMap(
              ({ active, alpha, texture }) =>
                active &&
                alpha === 1 &&
                texture &&
                ['stage-3-neared', 'stage-3-ranged', 'stage-3-flying'].includes(
                  texture.key,
                )
                  ? [texture.key]
                  : [],
            ),
            textureKeys: scene.floorBuilder.skinObjects.flatMap(({ texture }) =>
              texture ? [texture.key] : [],
            ),
            victoryVisible: scene.combatUi.victoryOverlay.visible,
            weaponVisible: scene.weaponSystem.feedback.display.visible,
          };
        }),
      { timeout: 10_000 },
    )
    .toEqual({
      cameraCenterOffset: 0,
      cameraZoom: 1,
      roomId: 'underground-landing',
      siegeTextureKeys: expect.arrayContaining([
        'stage-3-neared',
        'stage-3-ranged',
        'stage-3-flying',
      ]),
      textureKeys: expect.arrayContaining([
        'stage-3-floor-left',
        'stage-3-floor-middle',
        'stage-3-floor-right',
      ]),
      victoryVisible: false,
      weaponVisible: false,
    });

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          type RuntimeScene = {
            cameras: { main: { zoom: number } };
            children: {
              list: Array<{ active: boolean; texture?: { key: string } }>;
            };
            combatUi: { victoryOverlay: { visible: boolean } };
            player: {
              anims: { currentAnim?: { frames: unknown[]; key: string } };
            };
          };
          type DebugGame = { scene: { getScene: (key: string) => unknown } };
          const game = (window as unknown as { __game?: DebugGame }).__game!;
          const scene = game.scene.getScene('game') as RuntimeScene;
          return {
            cameraZoom: scene.cameras.main.zoom,
            siegeEnemies: scene.children.list.filter(
              ({ active, texture }) =>
                active &&
                texture &&
                ['stage-3-neared', 'stage-3-ranged', 'stage-3-flying'].includes(
                  texture.key,
                ),
            ).length,
            playerAnimation: scene.player.anims.currentAnim?.key,
            playerAnimationFrames:
              scene.player.anims.currentAnim?.frames.length,
            victoryVisible: scene.combatUi.victoryOverlay.visible,
          };
        }),
      { timeout: 12_000 },
    )
    .toEqual({
      cameraZoom: 1.35,
      playerAnimation: 'stage-3-player-alive',
      playerAnimationFrames: 3,
      siegeEnemies: 0,
      victoryVisible: true,
    });
});

test('stage three pipe crawler stays aligned above its floor segment', async ({
  page,
}) => {
  await enterGame(page);
  await page.getByRole('button', { name: 'ADMIN' }).click();
  await page
    .getByRole('button', { name: '3스테이지', exact: true })
    .click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        type RuntimeEnemy = {
          anims: { currentAnim?: { key: string } };
          texture: { key: string };
        };
        type RuntimeScene = { enemies: RuntimeEnemy[] };
        type DebugGame = { scene: { getScene: (key: string) => unknown } };
        const game = (window as unknown as { __game?: DebugGame }).__game!;
        const enemies = (game.scene.getScene('game') as RuntimeScene).enemies;
        return enemies.find(({ texture }) => texture.key === 'stage-3-flying')
          ?.anims.currentAnim?.key;
      }),
    )
    .toBe('stage-3-flying-pipe-idle');

  const phaseTransition = await page.evaluate(() => {
    type DamageResult = { applied: boolean; defeated: boolean };
    type RuntimeEnemy = {
      currentHealth: number;
      phase: number;
      takeProjectileDamage: (
        damage: number,
        x: number,
        y: number,
      ) => DamageResult;
      texture: { key: string };
      x: number;
      y: number;
    };
    type RuntimeScene = { enemies: RuntimeEnemy[] };
    type DebugGame = { scene: { getScene: (key: string) => unknown } };
    const game = (window as unknown as { __game?: DebugGame }).__game!;
    const enemies = (game.scene.getScene('game') as RuntimeScene).enemies;
    const crawler = enemies.find(
      ({ texture }) => texture.key === 'stage-3-flying',
    )!;
    const damageResult = crawler.takeProjectileDamage(
      70,
      crawler.x,
      crawler.y,
    );
    return {
      currentHealth: crawler.currentHealth,
      damageResult,
      phase: crawler.phase,
    };
  });

  expect(phaseTransition.damageResult).toEqual({
    applied: true,
    defeated: false,
  });
  expect(phaseTransition.currentHealth).toBe(70);
  expect(phaseTransition.phase).toBe(2);

  await expect
    .poll(() =>
      page.evaluate(() => {
        type RuntimeEnemy = {
          anims: { currentAnim?: { key: string } };
          texture: { key: string };
        };
        type RuntimeScene = { enemies: RuntimeEnemy[] };
        type DebugGame = { scene: { getScene: (key: string) => unknown } };
        const game = (window as unknown as { __game?: DebugGame }).__game!;
        const enemies = (game.scene.getScene('game') as RuntimeScene).enemies;
        return enemies.find(({ texture }) => texture.key === 'stage-3-flying')
          ?.anims.currentAnim?.key;
      }),
      { timeout: 5_000 },
    )
    .toBe('stage-3-flying-floor-idle');

  const groundPose = await page.evaluate(() => {
    type RuntimeEnemy = {
      body: { allowGravity: boolean; bottom: number; offset: { y: number } };
      displayOriginY: number;
      texture: { key: string };
      x: number;
      y: number;
    };
    type RuntimeScene = { enemies: RuntimeEnemy[] };
    type DebugGame = { scene: { getScene: (key: string) => unknown } };
    const game = (window as unknown as { __game?: DebugGame }).__game!;
    const enemies = (game.scene.getScene('game') as RuntimeScene).enemies;
    const crawler = enemies.find(
      ({ texture }) => texture.key === 'stage-3-flying',
    )!;
    return {
      allowGravity: crawler.body.allowGravity,
      bodyBottom: crawler.body.bottom,
      bodyOffsetY: crawler.body.offset.y,
      opaqueBottom: crawler.y - crawler.displayOriginY + 87,
      x: crawler.x,
      y: crawler.y,
    };
  });

  expect(groundPose.allowGravity).toBe(true);
  expect(groundPose.bodyOffsetY).toBe(1);
  expect(groundPose.opaqueBottom).toBeCloseTo(groundPose.bodyBottom, 1);
  expect(groundPose.x).toBeGreaterThan(2_000);
});

test('stage two ground enemies stop at pit edges instead of falling', async ({
  page,
}) => {
  await enterGame(page);
  await page.getByRole('button', { name: 'ADMIN' }).click();
  await page.getByRole('button', { name: '2스테이지', exact: true }).click();
  await expect(
    page.getByRole('meter', { name: 'Player health' }),
  ).toHaveAttribute('aria-valuemax', '115');
  await page.evaluate(() => {
    type RuntimeBody = { reset: (x: number, y: number) => void };
    type RuntimeActor = {
      body: RuntimeBody;
      texture: { key: string };
      x: number;
      y: number;
      setPosition: (x: number, y: number) => void;
    };
    type RuntimeScene = {
      enemies: RuntimeActor[];
      player: RuntimeActor;
    };
    type DebugGame = {
      scene: { getScene: (key: string) => unknown };
    };

    const game = (window as unknown as { __game?: DebugGame }).__game;
    if (!game) {
      throw new Error('Missing development game handle');
    }

    const scene = game.scene.getScene('game') as RuntimeScene;
    const melee = scene.enemies.find(
      ({ texture }) => texture.key === 'stage-2-neared',
    );
    if (!melee) {
      throw new Error('Missing stage 2 melee enemy');
    }

    // 플레이어를 1번 방 후반 구덩이 건너편에, 근접 적을 그 가까운 가장자리에
    // 둔다. 적의 추격 AI가 구덩이 쪽으로 계속 밀고 들어온다.
    scene.player.setPosition(2800, 600);
    scene.player.body.reset(2800, 600);
    melee.setPosition(2350, melee.y);
    melee.body.reset(2350, melee.y);
  });

  await page.waitForTimeout(1500);
  const meleePosition = await page.evaluate(() => {
    type RuntimeScene = {
      enemies: Array<{
        texture: { key: string };
        x: number;
        y: number;
      }>;
    };
    type DebugGame = {
      scene: { getScene: (key: string) => unknown };
    };
    const game = (window as unknown as { __game?: DebugGame }).__game!;
    const scene = game.scene.getScene('game') as RuntimeScene;
    const melee = scene.enemies.find(
      ({ texture }) => texture.key === 'stage-2-neared',
    )!;
    return { x: melee.x, y: melee.y };
  });

  expect(meleePosition.x).toBeLessThan(2450);
  expect(meleePosition.y).toBeLessThan(656);
});

test('admin menu scrolls instead of overflowing a short viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 360 });
  await enterTitle(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toHaveAttribute('data-scene', 'game');

  await page.getByRole('button', { name: 'ADMIN' }).click();
  const adminMenu = page.getByRole('dialog', { name: 'Admin menu' });
  const initialMetrics = await adminMenu.evaluate((menu) => ({
    clientHeight: menu.clientHeight,
    overflowY: getComputedStyle(menu).overflowY,
    scrollHeight: menu.scrollHeight,
  }));

  expect(initialMetrics.overflowY).toBe('auto');
  expect(initialMetrics.scrollHeight).toBeGreaterThan(
    initialMetrics.clientHeight,
  );

  const [menuBounds, viewportBounds] = await Promise.all([
    adminMenu.boundingBox(),
    page.locator('.game-viewport').boundingBox(),
  ]);
  if (!menuBounds || !viewportBounds) {
    throw new Error('Admin menu bounds are unavailable');
  }
  expect(menuBounds.y).toBeGreaterThanOrEqual(viewportBounds.y);
  expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(
    viewportBounds.y + viewportBounds.height,
  );

  await adminMenu.evaluate((menu) => {
    menu.scrollTop = menu.scrollHeight;
  });
  await expect
    .poll(() => adminMenu.evaluate((menu) => menu.scrollTop))
    .toBeGreaterThan(0);
});

test('shows boss health without enabling the standard enemy health HUD', async ({
  page,
}) => {
  await enterTitle(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toHaveAttribute('data-scene', 'game');

  await page.getByRole('button', { name: 'ADMIN' }).click();
  await page.getByRole('button', { name: '보스' }).first().click();

  await expect(page.getByRole('meter', { name: 'Enemy health' })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('meter', { name: 'Boss health' }),
  ).toHaveAttribute('aria-valuemax', '500');

  const [hudLayer, playerHud, bossHud, playerStack, location] =
    await Promise.all(
      [
        '.hud-layer',
        '.hud--player',
        '.hud--enemy',
        '.hud-player-stack',
        '.stage-location',
      ].map(async (selector) => {
        const bounds = await page.locator(selector).boundingBox();
        if (!bounds) {
          throw new Error(`HUD bounds are unavailable: ${selector}`);
        }
        return bounds;
      }),
    );

  expect(playerHud.x).toBeCloseTo(hudLayer.x);
  expect(bossHud.x + bossHud.width).toBeCloseTo(
    hudLayer.x + hudLayer.width,
  );
  expect(bossHud.width).toBe(playerHud.width);
  expect(location.y).toBeGreaterThanOrEqual(bossHud.y + bossHud.height);
  expect(bossHud.height).toBe(playerHud.height);
  expect(bossHud.height).toBeLessThan(playerStack.height);
});

test('stage four boss uses the infernal sprite atlas', async ({ page }) => {
  await enterGame(page);
  await page.getByRole('button', { name: 'ADMIN' }).click();
  await page.getByRole('button', { name: '보스' }).nth(3).click();

  await expect(
    page.getByRole('meter', { name: 'Boss health' }),
  ).toHaveAttribute('aria-valuemax', '1000');

  const sprite = await page.evaluate(() => {
    type RuntimeEnemy = {
      anims: { currentAnim?: { key: string } };
      body: { bottom: number };
      beginCharge: (time: number) => void;
      beginRupture: (time: number) => void;
      beginShards: (time: number, target: unknown) => void;
      constructor: { name: string };
      defeat: () => void;
      displayHeight: number;
      texture: { key: string };
      y: number;
    };
    type RuntimeScene = { enemies: RuntimeEnemy[]; player: unknown };
    type DebugGame = { scene: { getScene: (key: string) => unknown } };
    const game = (window as unknown as { __game?: DebugGame }).__game!;
    const scene = game.scene.getScene('game') as RuntimeScene;
    const boss = scene.enemies.find(
      ({ constructor }) => constructor.name === 'InfernalBossEnemy',
    )!;
    const idleAnimation = boss.anims.currentAnim?.key;
    boss.beginRupture(0);
    const gushAnimation = boss.anims.currentAnim?.key;
    boss.beginCharge(0);
    const rushAnimation = boss.anims.currentAnim?.key;
    boss.beginShards(0, scene.player);
    const getDownAnimation = boss.anims.currentAnim?.key;
    boss.defeat();
    return {
      bottomGap: boss.body.bottom - (boss.y + boss.displayHeight / 2),
      deathAnimation: boss.anims.currentAnim?.key,
      displayHeight: boss.displayHeight,
      getDownAnimation,
      gushAnimation,
      idleAnimation,
      rushAnimation,
      texture: boss.texture.key,
    };
  });

  expect(sprite.texture).toBe('stage-4-boss');
  expect(sprite.idleAnimation).toBe('stage-4-boss-idle');
  expect(sprite.gushAnimation).toBe('stage-4-boss-gush');
  expect(sprite.rushAnimation).toBe('stage-4-boss-rush');
  expect(sprite.getDownAnimation).toBe('stage-4-boss-get-down');
  expect(sprite.deathAnimation).toBe('stage-4-boss-death');
  // 프레임 하단의 7px 투명 여백만 바디 아래로 내려가 발을 바닥에 맞춤.
  expect(sprite.bottomGap).toBeGreaterThan(-7);
  expect(sprite.bottomGap).toBeLessThan(-5);
  expect(sprite.displayHeight).toBeGreaterThan(210);
  expect(sprite.displayHeight).toBeLessThan(230);
});

test('player fire damages the enemy without stopping combat', async ({
  page,
}) => {
  const runtimeErrors: Error[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error));

  await enterGame(page);
  await page.waitForTimeout(1000);

  const bounds = await getCanvasBounds(page);
  await fireShotsAt(page, bounds, 640, 630, 1);

  await expect(
    page.getByRole('meter', { name: 'Enemy health' }),
  ).toHaveAttribute('aria-valuenow', '414', { timeout: 5000 });
  expect(runtimeErrors).toEqual([]);
});

test('platforms block player projectiles', async ({ page }) => {
  await enterGame(page);
  await page.evaluate(() => {
    type RuntimeBody = { reset: (x: number, y: number) => void };
    type RuntimeActor = {
      body: RuntimeBody;
      constructor: { name: string };
      setPosition: (x: number, y: number) => void;
      x: number;
      y: number;
    };
    type RuntimeScene = {
      enemies: RuntimeActor[];
      player: RuntimeActor;
    };
    type DebugGame = { scene: { getScene: (key: string) => unknown } };
    const game = (window as unknown as { __game?: DebugGame }).__game!;
    const scene = game.scene.getScene('game') as RuntimeScene;

    scene.player.setPosition(3150, 600);
    scene.player.body.reset(3150, 600);
  });
  await page.waitForTimeout(500);

  // 플레이어와 비행 적을 같은 x축의 발판 아래·위에 놓고 위로 사격한다.
  // 탄환이 발판을 통과하지 않으면 비행 적의 체력은 그대로 유지된다.
  const shieldedFlyerHp = () =>
    page.evaluate(() => {
      type RuntimeScene = {
        enemies: Array<{
          active: boolean;
          currentHealth: number;
          constructor: { name: string };
        }>;
      };
      type DebugGame = { scene: { getScene: (key: string) => unknown } };
      const game = (window as unknown as { __game?: DebugGame }).__game!;
      const scene = game.scene.getScene('game') as RuntimeScene;
      return scene.enemies.find(
        (e) => e.active && e.constructor.name === 'FlyingEnemy',
      )!.currentHealth;
    });

  const target = await page.evaluate(() => {
    type RuntimeBody = { reset: (x: number, y: number) => void };
    type RuntimeActor = {
      body: RuntimeBody;
      active: boolean;
      constructor: { name: string };
      setPosition: (x: number, y: number) => void;
      setVelocity: (x: number, y: number) => void;
      updateCombat: () => boolean;
    };
    type RuntimeScene = {
      cameras: { main: { scrollX: number; scrollY: number } };
      enemies: RuntimeActor[];
    };
    type DebugGame = { scene: { getScene: (key: string) => unknown } };
    const game = (window as unknown as { __game?: DebugGame }).__game!;
    const scene = game.scene.getScene('game') as RuntimeScene;
    const flyer = scene.enemies.find(
      (enemy) => enemy.active && enemy.constructor.name === 'FlyingEnemy',
    )!;

    flyer.setPosition(3150, 360);
    flyer.body.reset(3150, 360);
    flyer.setVelocity(0, 0);
    flyer.updateCombat = () => false;
    return {
      x: 3150 - scene.cameras.main.scrollX,
      y: 360 - scene.cameras.main.scrollY,
    };
  });

  const before = await shieldedFlyerHp();
  const bounds = await getCanvasBounds(page);
  await fireAt(page, bounds, target.x, target.y, 300);

  expect(await shieldedFlyerHp()).toBe(before);
});

test('locks the room until every spawned enemy is defeated', async ({
  page,
}) => {
  test.setTimeout(45_000);
  const runtimeErrors: Error[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error));

  await enterGame(page);
  await expect(page.locator('main')).toHaveAttribute(
    'data-room-state',
    'locked',
  );
  await page.waitForTimeout(1000);

  const bounds = await getCanvasBounds(page);
  await clearCityRoomOne(page, bounds);

  await expect(
    page.getByRole('meter', { name: 'Enemy health' }),
  ).toHaveAttribute('aria-valuenow', '0', { timeout: 5000 });
  await expect(page.locator('main')).toHaveAttribute(
    'data-room-state',
    'cleared',
    { timeout: 5000 },
  );
  await expect(page.locator('main')).toHaveAttribute(
    'data-phase',
    'room-cleared',
  );
  await fireShotsAt(page, bounds, 1000, 420, 1);
  expect(runtimeErrors).toEqual([]);
});

test('player death shows its animation before enabling restart', async ({
  page,
}) => {
  test.setTimeout(45_000);

  await enterGame(page);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing');

  const healthMeter = page.getByRole('meter', { name: 'Player health' });
  await holdKeyFor(page, 'KeyD', 900);

  await expect(page.locator('main')).toHaveAttribute('data-phase', 'dead', {
    timeout: 30_000,
  });
  await expect(healthMeter).toHaveAttribute('aria-valuenow', '0');

  const deathVisual = await page.evaluate(() => {
    type RuntimeScene = {
      player: {
        alpha: number;
        anims: { currentAnim?: { key: string } };
        texture: { key: string };
      };
    };
    type DebugGame = { scene: { getScene: (key: string) => unknown } };
    const game = (window as unknown as { __game?: DebugGame }).__game!;
    const { player } = game.scene.getScene('game') as RuntimeScene;
    return {
      alpha: player.alpha,
      animation: player.anims.currentAnim?.key,
      texture: player.texture.key,
    };
  });
  expect(deathVisual).toEqual({
    alpha: 1,
    animation: 'stage-1-2-player-death',
    texture: 'stage-1-2-player',
  });

  // 사망 자세가 보이는 1초 동안 재시작 입력을 잠금.
  await page.keyboard.press('KeyR');
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'dead');

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          type RuntimeScene = { restartEnabled: boolean };
          type DebugGame = {
            scene: { getScene: (key: string) => unknown };
          };
          const game = (window as unknown as { __game?: DebugGame }).__game!;
          return (game.scene.getScene('game') as RuntimeScene).restartEnabled;
        }),
      { timeout: 2000 },
    )
    .toBe(true);

  await page.keyboard.press('KeyR');
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing');
  await expect(healthMeter).toHaveAttribute('aria-valuenow', '100');
  await expect(
    page.getByRole('meter', { name: 'Enemy health' }),
  ).toHaveAttribute('aria-valuenow', CITY_ROOM_ONE_MAX_HEALTH.toString());
  await expect(page.locator('main')).toHaveAttribute(
    'data-room-state',
    'locked',
  );
});

test('does not offer a weapon drop from a standard enemy', async ({ page }) => {
  const runtimeErrors: Error[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error));

  await enterGame(page);
  await page.waitForTimeout(1000);
  await expect(page.locator('main')).toHaveAttribute('data-weapon', 'smg');

  const bounds = await getCanvasBounds(page);
  await fireAt(page, bounds, 640, 630, 1200);

  await expect(
    page.getByRole('meter', { name: 'Enemy health' }),
  ).not.toHaveAttribute('aria-valuenow', CITY_ROOM_ONE_MAX_HEALTH.toString());
  await holdKeyFor(page, 'KeyD', 700);
  await expect(page.locator('main')).toHaveAttribute('data-nearby-weapon', '');
  await expect(page.locator('main')).toHaveAttribute('data-weapon', 'smg');
  expect(runtimeErrors).toEqual([]);
});

test('enters the clear portal and starts combat in the next room', async ({
  page,
}) => {
  const runtimeErrors: Error[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error));

  await enterGame(page);
  await clearCurrentRoomThroughRuntime(page);

  await expect(page.locator('main')).toHaveAttribute(
    'data-phase',
    'room-cleared',
    { timeout: 5000 },
  );
  const portalState = await page.evaluate(() => {
    type RuntimePortal = {
      view: {
        anims: { currentAnim?: { key: string } };
        texture: { key: string };
        visible: boolean;
      };
    };
    type RuntimeScene = { roomDirector: { portal: RuntimePortal } };
    type DebugGame = { scene: { getScene: (key: string) => unknown } };
    const game = (window as unknown as { __game?: DebugGame }).__game;
    if (!game) {
      throw new Error('Missing development game handle');
    }

    const portal = (game.scene.getScene('game') as RuntimeScene).roomDirector
      .portal.view;
    return {
      animation: portal.anims.currentAnim?.key,
      texture: portal.texture.key,
      visible: portal.visible,
    };
  });
  expect(portalState).toEqual({
    animation: 'room-portal-idle',
    texture: 'room-portal',
    visible: true,
  });

  await enterExitPortal(page);

  await expect(page.locator('main')).toHaveAttribute(
    'data-room-state',
    'locked',
  );
  await expect(
    page.getByRole('meter', { name: 'Enemy health' }),
  ).toHaveAttribute('aria-valuenow', CITY_ROOM_TWO_MAX_HEALTH.toString());
  expect(runtimeErrors).toEqual([]);
});
