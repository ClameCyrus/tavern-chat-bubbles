export const APPEARANCE_ACTORS = ['user', 'char', 'npc'] as const;
export const DECO_ACTORS = ['all', ...APPEARANCE_ACTORS] as const;
export const DECO_CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

export type AppearanceActor = (typeof APPEARANCE_ACTORS)[number];
export type DecoActor = (typeof DECO_ACTORS)[number];
export type DecoCorner = (typeof DECO_CORNERS)[number];

export interface BubbleAppearance {
  background: string;
  text: string;
  border: string;
  border_style: string;
  border_width: string;
  border_radius: string;
}

export interface NamedImage {
  name: string;
  url: string;
}

export interface NpcAlias {
  canonical: string;
  aliases: string;
}

export interface AppearanceConfig {
  user_avatar: string;
  char_avatar: string;
  npc_avatar: string;
  npc_avatars: NamedImage[];
  accent_dark: string;
  accent2_dark: string;
  accent_light: string;
  accent2_light: string;
  bubble: Record<AppearanceActor, BubbleAppearance>;
  message_scale: number;
  bubble_font_size: number;
  bubble_line_height: number;
  bubble_padding_x: number;
  bubble_padding_y: number;
  bubble_max_width_percent: number;
  bubble_max_width_px: number;
  avatar_size: number;
  message_gap: number;
  message_spacing: number;
  deco: Record<DecoActor, Record<DecoCorner, string>>;
  deco_size: string;
  deco_offset: number;
  theme: 'auto' | 'dark' | 'light';
  sticker_size: string;
  image_auto_generate: boolean;
  image_width: number;
  image_height: number;
  collapse_min: number;
  char_aliases: string;
  npc_aliases: NpcAlias[];
  stream_mode: 'defer' | 'live';
}

function emptyBubble(): BubbleAppearance {
  return { background: '', text: '', border: '', border_style: '', border_width: '', border_radius: '' };
}

function emptyDeco(): Record<DecoActor, Record<DecoCorner, string>> {
  return Object.fromEntries(
    DECO_ACTORS.map(actor => [actor, Object.fromEntries(DECO_CORNERS.map(corner => [corner, '']))]),
  ) as Record<DecoActor, Record<DecoCorner, string>>;
}

export function createDefaultAppearanceConfig(): AppearanceConfig {
  return {
    user_avatar: '',
    char_avatar: '',
    npc_avatar: '',
    npc_avatars: [],
    accent_dark: '#57a3c9',
    accent2_dark: '#c9a45c',
    accent_light: '#2b6d8c',
    accent2_light: '#97722c',
    bubble: { user: emptyBubble(), char: emptyBubble(), npc: emptyBubble() },
    message_scale: 1,
    bubble_font_size: 14.5,
    bubble_line_height: 1.65,
    bubble_padding_x: 14,
    bubble_padding_y: 10,
    bubble_max_width_percent: 72,
    bubble_max_width_px: 480,
    avatar_size: 40,
    message_gap: 11,
    message_spacing: 14,
    deco: emptyDeco(),
    deco_size: '',
    deco_offset: 40,
    theme: 'auto',
    sticker_size: '',
    image_auto_generate: true,
    image_width: 640,
    image_height: 400,
    collapse_min: 3,
    char_aliases: '',
    npc_aliases: [],
    stream_mode: 'defer',
  };
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on', '是', '开启'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', '否', '关闭'].includes(normalized)) return false;
  return fallback;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, asNumber(value, fallback)));
}

export function normalizeAppearanceConfig(input: unknown): AppearanceConfig {
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const wrapped = source.config && typeof source.config === 'object' ? (source.config as Record<string, unknown>) : source;
  const defaults = createDefaultAppearanceConfig();
  const bubbleInput = wrapped.bubble && typeof wrapped.bubble === 'object' ? (wrapped.bubble as Record<string, unknown>) : {};
  const decoInput = wrapped.deco && typeof wrapped.deco === 'object' ? (wrapped.deco as Record<string, unknown>) : {};

  const bubble = Object.fromEntries(
    APPEARANCE_ACTORS.map(actor => {
      const raw = bubbleInput[actor] && typeof bubbleInput[actor] === 'object'
        ? (bubbleInput[actor] as Record<string, unknown>)
        : {};
      return [actor, {
        background: asString(raw.background),
        text: asString(raw.text),
        border: asString(raw.border),
        border_style: asString(raw.border_style),
        border_width: asString(raw.border_width),
        border_radius: asString(raw.border_radius),
      }];
    }),
  ) as Record<AppearanceActor, BubbleAppearance>;

  const deco = emptyDeco();
  for (const actor of DECO_ACTORS) {
    const raw = decoInput[actor] && typeof decoInput[actor] === 'object'
      ? (decoInput[actor] as Record<string, unknown>)
      : {};
    for (const corner of DECO_CORNERS) deco[actor][corner] = asString(raw[corner]);
  }

  const npcAvatars = Array.isArray(wrapped.npc_avatars)
    ? wrapped.npc_avatars.map(item => {
        const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        return { name: asString(raw.name), url: asString(raw.url) };
      }).filter(item => item.name || item.url)
    : [];
  const npcAliases = Array.isArray(wrapped.npc_aliases)
    ? wrapped.npc_aliases.map(item => {
        const raw = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        return { canonical: asString(raw.canonical), aliases: asString(raw.aliases) };
      }).filter(item => item.canonical || item.aliases)
    : [];

  const theme = ['auto', 'dark', 'light'].includes(asString(wrapped.theme))
    ? asString(wrapped.theme) as AppearanceConfig['theme']
    : defaults.theme;
  const streamMode = ['defer', 'live'].includes(asString(wrapped.stream_mode))
    ? asString(wrapped.stream_mode) as AppearanceConfig['stream_mode']
    : defaults.stream_mode;

  return {
    user_avatar: asString(wrapped.user_avatar),
    char_avatar: asString(wrapped.char_avatar),
    npc_avatar: asString(wrapped.npc_avatar),
    npc_avatars: npcAvatars,
    accent_dark: asString(wrapped.accent_dark, defaults.accent_dark),
    accent2_dark: asString(wrapped.accent2_dark, defaults.accent2_dark),
    accent_light: asString(wrapped.accent_light, defaults.accent_light),
    accent2_light: asString(wrapped.accent2_light, defaults.accent2_light),
    bubble,
    message_scale: clampNumber(wrapped.message_scale, defaults.message_scale, 0.5, 2),
    bubble_font_size: clampNumber(wrapped.bubble_font_size, defaults.bubble_font_size, 8, 40),
    bubble_line_height: clampNumber(wrapped.bubble_line_height, defaults.bubble_line_height, 1, 3),
    bubble_padding_x: clampNumber(wrapped.bubble_padding_x, defaults.bubble_padding_x, 0, 48),
    bubble_padding_y: clampNumber(wrapped.bubble_padding_y, defaults.bubble_padding_y, 0, 48),
    bubble_max_width_percent: clampNumber(
      wrapped.bubble_max_width_percent,
      defaults.bubble_max_width_percent,
      30,
      100,
    ),
    bubble_max_width_px: clampNumber(wrapped.bubble_max_width_px, defaults.bubble_max_width_px, 160, 1200),
    avatar_size: clampNumber(wrapped.avatar_size, defaults.avatar_size, 20, 120),
    message_gap: clampNumber(wrapped.message_gap, defaults.message_gap, 0, 48),
    message_spacing: clampNumber(wrapped.message_spacing, defaults.message_spacing, 0, 80),
    deco,
    deco_size: asString(wrapped.deco_size),
    deco_offset: Math.max(-100, Math.min(100, asNumber(wrapped.deco_offset, defaults.deco_offset))),
    theme,
    sticker_size: asString(wrapped.sticker_size),
    image_auto_generate: asBoolean(wrapped.image_auto_generate, defaults.image_auto_generate),
    image_width: Math.max(32, Math.round(asNumber(wrapped.image_width, defaults.image_width))),
    image_height: Math.max(32, Math.round(asNumber(wrapped.image_height, defaults.image_height))),
    collapse_min: Math.max(1, Math.round(asNumber(wrapped.collapse_min, defaults.collapse_min))),
    char_aliases: asString(wrapped.char_aliases),
    npc_aliases: npcAliases,
    stream_mode: streamMode,
  };
}

function parsePairs(text: string): Array<{ key: string; lower: string; value: string }> {
  const pairs: Array<{ key: string; lower: string; value: string }> = [];
  String(text || '').split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return;
    const match = trimmed.match(/^([^=|:：]+?)\s*(?:=|--|\||：|:)\s*(.*)$/);
    if (!match) return;
    const key = match[1].trim();
    pairs.push({ key, lower: key.toLowerCase().replace(/\s+/g, ''), value: match[2].trim() });
  });
  return pairs;
}

export function parseAppearanceConfigText(text: string): AppearanceConfig {
  const model = createDefaultAppearanceConfig();
  const bubbles: Record<string, keyof BubbleAppearance> = {
    background: 'background', bg: 'background', text: 'text', color: 'text', tx: 'text',
    border: 'border', border_color: 'border', bd: 'border', border_style: 'border_style',
    style: 'border_style', bs: 'border_style', border_width: 'border_width', width: 'border_width', bw: 'border_width',
    border_radius: 'border_radius', radius: 'border_radius', br: 'border_radius',
  };

  for (const pair of parsePairs(text)) {
    const { key, lower, value } = pair;
    if (lower.startsWith('deco.')) {
      const [actor, corner] = lower.slice(5).split('.');
      if (DECO_ACTORS.includes(actor as DecoActor) && DECO_CORNERS.includes(corner as DecoCorner)) {
        model.deco[actor as DecoActor][corner as DecoCorner] = value;
      }
      continue;
    }
    if (lower.startsWith('bubble.')) {
      const [actor, property] = lower.slice(7).split('.');
      const mapped = bubbles[property];
      if (APPEARANCE_ACTORS.includes(actor as AppearanceActor) && mapped) model.bubble[actor as AppearanceActor][mapped] = value;
      continue;
    }
    if (lower.startsWith('npc_aliases.')) {
      model.npc_aliases.push({ canonical: key.slice('npc_aliases.'.length).trim(), aliases: value });
      continue;
    }
    if (lower.startsWith('npc.')) {
      model.npc_avatars.push({ name: key.slice(4).trim(), url: value });
      continue;
    }

    switch (lower) {
      case 'user_avatar': model.user_avatar = value; break;
      case 'char_avatar': model.char_avatar = value; break;
      case 'npc_avatar': model.npc_avatar = value; break;
      case 'accent_dark': model.accent_dark = value; break;
      case 'accent2_dark': model.accent2_dark = value; break;
      case 'accent_light': model.accent_light = value; break;
      case 'accent2_light': model.accent2_light = value; break;
      case 'message_scale': model.message_scale = asNumber(value, model.message_scale); break;
      case 'bubble_font_size': model.bubble_font_size = asNumber(value, model.bubble_font_size); break;
      case 'bubble_line_height': model.bubble_line_height = asNumber(value, model.bubble_line_height); break;
      case 'bubble_padding_x': model.bubble_padding_x = asNumber(value, model.bubble_padding_x); break;
      case 'bubble_padding_y': model.bubble_padding_y = asNumber(value, model.bubble_padding_y); break;
      case 'bubble_max_width_percent': model.bubble_max_width_percent = asNumber(value, model.bubble_max_width_percent); break;
      case 'bubble_max_width_px': model.bubble_max_width_px = asNumber(value, model.bubble_max_width_px); break;
      case 'avatar_size': model.avatar_size = asNumber(value, model.avatar_size); break;
      case 'message_gap': model.message_gap = asNumber(value, model.message_gap); break;
      case 'message_spacing': model.message_spacing = asNumber(value, model.message_spacing); break;
      case 'deco_size': model.deco_size = value; break;
      case 'deco_offset': model.deco_offset = Math.max(-100, Math.min(100, asNumber(value, 40))); break;
      case 'theme': if (['auto', 'dark', 'light'].includes(value)) model.theme = value as AppearanceConfig['theme']; break;
      case 'sticker_size': model.sticker_size = value; break;
      case 'image_auto_generate': model.image_auto_generate = asBoolean(value, model.image_auto_generate); break;
      case 'collapse_min': model.collapse_min = Math.max(1, Math.round(asNumber(value, 3))); break;
      case 'char_aliases': model.char_aliases = value; break;
      case 'stream_mode': if (['defer', 'live'].includes(value)) model.stream_mode = value as AppearanceConfig['stream_mode']; break;
      case 'image_size': {
        const match = value.match(/(\d{2,4})\s*[x×*]\s*(\d{2,4})/i);
        if (match) {
          model.image_width = Number(match[1]);
          model.image_height = Number(match[2]);
        }
        break;
      }
    }
  }
  return normalizeAppearanceConfig(model);
}

function cleanLine(value: unknown): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

export function serializeAppearanceConfigText(input: AppearanceConfig, templateVersion: string): string {
  const model = normalizeAppearanceConfig(input);
  const lines = [
    '# ============================================================',
    `# 聊天气泡 · 外观配置    模板版本 ${templateVersion}`,
    '# 可继续手动修改，也可用脚本按钮「外观配置面板」可视化编辑。',
    '# ============================================================',
    '',
    '# 一、头像（可填写网络链接或面板生成的本地图片 data URL）',
    `user_avatar = ${cleanLine(model.user_avatar)}`,
    `char_avatar = ${cleanLine(model.char_avatar)}`,
    `npc_avatar = ${cleanLine(model.npc_avatar)}`,
  ];

  for (const item of model.npc_avatars) {
    if (item.name.trim() && item.url.trim()) lines.push(`npc.${cleanLine(item.name)} = ${cleanLine(item.url)}`);
  }

  lines.push(
    '', '# 二、主题色',
    `accent_dark = ${cleanLine(model.accent_dark)}`,
    `accent2_dark = ${cleanLine(model.accent2_dark)}`,
    `accent_light = ${cleanLine(model.accent_light)}`,
    `accent2_light = ${cleanLine(model.accent2_light)}`,
    '', '# 三、气泡填充与边框',
  );

  for (const actor of APPEARANCE_ACTORS) {
    const bubble = model.bubble[actor];
    lines.push(
      `bubble.${actor}.background = ${cleanLine(bubble.background)}`,
      `bubble.${actor}.text = ${cleanLine(bubble.text)}`,
      `bubble.${actor}.border = ${cleanLine(bubble.border)}`,
      `bubble.${actor}.border_style = ${cleanLine(bubble.border_style)}`,
      `bubble.${actor}.border_width = ${cleanLine(bubble.border_width)}`,
      `bubble.${actor}.border_radius = ${cleanLine(bubble.border_radius)}`,
    );
  }

  lines.push(
    '', '# 四、气泡尺寸与排版',
    `message_scale = ${model.message_scale}`,
    `bubble_font_size = ${model.bubble_font_size}`,
    `bubble_line_height = ${model.bubble_line_height}`,
    `bubble_padding_x = ${model.bubble_padding_x}`,
    `bubble_padding_y = ${model.bubble_padding_y}`,
    `bubble_max_width_percent = ${model.bubble_max_width_percent}`,
    `bubble_max_width_px = ${model.bubble_max_width_px}`,
    `avatar_size = ${model.avatar_size}`,
    `message_gap = ${model.message_gap}`,
    `message_spacing = ${model.message_spacing}`,
    '', '# 五、四角装饰',
  );
  for (const actor of DECO_ACTORS) {
    for (const corner of DECO_CORNERS) {
      const value = model.deco[actor][corner];
      if (value) lines.push(`deco.${actor}.${corner} = ${cleanLine(value)}`);
    }
  }

  lines.push(
    `deco_size = ${cleanLine(model.deco_size)}`,
    `deco_offset = ${model.deco_offset}`,
    '', '# 六、其它',
    `theme = ${model.theme}`,
    `sticker_size = ${cleanLine(model.sticker_size)}`,
    `image_auto_generate = ${model.image_auto_generate}`,
    `image_size = ${model.image_width}x${model.image_height}`,
    `collapse_min = ${model.collapse_min}`,
    `char_aliases = ${cleanLine(model.char_aliases)}`,
  );

  for (const item of model.npc_aliases) {
    if (item.canonical.trim() && item.aliases.trim()) {
      lines.push(`npc_aliases.${cleanLine(item.canonical)} = ${cleanLine(item.aliases)}`);
    }
  }
  lines.push(`stream_mode = ${model.stream_mode}`);
  return lines.join('\n');
}

export function createAppearanceExport(input: AppearanceConfig): Record<string, unknown> {
  return {
    format: 'fhb-appearance-config',
    version: 1,
    exported_at: new Date().toISOString(),
    config: normalizeAppearanceConfig(input),
  };
}
