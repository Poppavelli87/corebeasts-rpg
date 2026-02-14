import Phaser from 'phaser';

export const UI_THEME = {
  fontFamily: '"Courier New", monospace',
  panelFill: 0x081324,
  panelStroke: 0x87b5dc,
  rowFill: 0x16253d,
  rowStroke: 0x4f7398,
  rowSelectedStroke: 0xbce0ff,
  headingColor: '#f4f8ff',
  bodyColor: '#d5e6f8',
  accentColor: '#f6e492',
  mutedColor: '#8fb6d7',
  backHintColor: '#8ab0cf'
} as const;

type Addable = Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[] | undefined;

const attachToContainer = (
  container: Phaser.GameObjects.Container | undefined,
  object: Addable
): void => {
  if (!container || !object) {
    return;
  }

  if (Array.isArray(object)) {
    container.add(object);
    return;
  }

  container.add(object);
};

export const createPanel = (
  scene: Phaser.Scene,
  config: {
    x: number;
    y: number;
    width: number;
    height: number;
    depth?: number;
    fillColor?: number;
    fillAlpha?: number;
    strokeColor?: number;
    strokeWidth?: number;
    scrollFactor?: number;
    container?: Phaser.GameObjects.Container;
  }
): Phaser.GameObjects.Rectangle => {
  const panel = scene.add
    .rectangle(
      config.x,
      config.y,
      config.width,
      config.height,
      config.fillColor ?? UI_THEME.panelFill,
      config.fillAlpha ?? 0.96
    )
    .setOrigin(0)
    .setStrokeStyle(config.strokeWidth ?? 2, config.strokeColor ?? UI_THEME.panelStroke, 1);

  if (typeof config.depth === 'number') {
    panel.setDepth(config.depth);
  }

  panel.setScrollFactor(config.scrollFactor ?? 0);
  attachToContainer(config.container, panel);
  return panel;
};

export const createHeadingText = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  config: {
    size?: number;
    color?: string;
    depth?: number;
    originX?: number;
    originY?: number;
    container?: Phaser.GameObjects.Container;
  } = {}
): Phaser.GameObjects.Text => {
  const heading = scene.add.text(x, y, text, {
    fontFamily: UI_THEME.fontFamily,
    fontSize: `${config.size ?? 20}px`,
    color: config.color ?? UI_THEME.headingColor
  });

  heading.setOrigin(config.originX ?? 0, config.originY ?? 0);
  heading.setDepth(config.depth ?? 0);
  attachToContainer(config.container, heading);
  return heading;
};

export const createBodyText = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  config: {
    size?: number;
    color?: string;
    depth?: number;
    align?: 'left' | 'center' | 'right';
    lineSpacing?: number;
    wordWrapWidth?: number;
    originX?: number;
    originY?: number;
    container?: Phaser.GameObjects.Container;
  } = {}
): Phaser.GameObjects.Text => {
  const body = scene.add.text(x, y, text, {
    fontFamily: UI_THEME.fontFamily,
    fontSize: `${config.size ?? 14}px`,
    color: config.color ?? UI_THEME.bodyColor,
    align: config.align,
    lineSpacing: config.lineSpacing ?? 0
  });

  if (typeof config.wordWrapWidth === 'number') {
    body.setWordWrapWidth(config.wordWrapWidth, true);
  }

  body.setOrigin(config.originX ?? 0, config.originY ?? 0);
  body.setDepth(config.depth ?? 0);
  attachToContainer(config.container, body);
  return body;
};

export const createSelectableRow = (
  scene: Phaser.Scene,
  config: {
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    selected: boolean;
    disabled?: boolean;
    depth?: number;
    container?: Phaser.GameObjects.Container;
  }
): {
  background: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
} => {
  const background = scene.add
    .rectangle(
      config.x,
      config.y,
      config.width,
      config.height,
      UI_THEME.rowFill,
      config.disabled ? 0.7 : 1
    )
    .setOrigin(0)
    .setStrokeStyle(
      2,
      config.selected ? UI_THEME.rowSelectedStroke : UI_THEME.rowStroke,
      config.disabled ? 0.6 : 1
    )
    .setDepth(config.depth ?? 0)
    .setScrollFactor(0);

  const label = scene.add
    .text(background.x + 10, background.y + Math.floor((config.height - 16) / 2), config.text, {
      fontFamily: UI_THEME.fontFamily,
      fontSize: '14px',
      color: config.disabled
        ? '#8a96ad'
        : config.selected
          ? UI_THEME.accentColor
          : UI_THEME.bodyColor
    })
    .setDepth((config.depth ?? 0) + 1)
    .setScrollFactor(0);

  attachToContainer(config.container, [background, label]);
  return { background, label };
};

export const createBackHint = (
  scene: Phaser.Scene,
  text = 'Esc: Back',
  config: {
    x?: number;
    y?: number;
    depth?: number;
    container?: Phaser.GameObjects.Container;
  } = {}
): Phaser.GameObjects.Text => {
  const x = config.x ?? scene.scale.width - 12;
  const y = config.y ?? scene.scale.height - 12;

  const hint = scene.add
    .text(x, y, text, {
      fontFamily: UI_THEME.fontFamily,
      fontSize: '12px',
      color: UI_THEME.backHintColor
    })
    .setOrigin(1, 1)
    .setDepth(config.depth ?? 0)
    .setScrollFactor(0);

  attachToContainer(config.container, hint);
  return hint;
};

export const createTinyIcon = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  config: {
    size?: number;
    color?: number;
    depth?: number;
    container?: Phaser.GameObjects.Container;
  } = {}
): Phaser.GameObjects.Rectangle => {
  const size = config.size ?? 4;
  const icon = scene.add
    .rectangle(x, y, size, size, config.color ?? 0x9ec3df, 1)
    .setOrigin(0.5)
    .setDepth(config.depth ?? 0)
    .setScrollFactor(0);

  attachToContainer(config.container, icon);
  return icon;
};
