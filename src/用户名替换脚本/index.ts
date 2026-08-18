import { z } from 'zod';

declare const $: any;
declare const toastr: any;

type ReplacementRule = {
  enabled: boolean;
  source: string;
  replacement_text: string;
  image_url: string;
  blurred: boolean;
};

type CustomProfile = {
  id: string;
  name: string;
  rules: ReplacementRule[];
};

type CustomSettingsExport = {
  version: 1;
  custom_enabled: boolean;
  active_custom_profile_id: string;
  custom_profiles: CustomProfile[];
};

type CustomThemeProfile = {
  id: string;
  name: string;
  colors: ThemeCustomColors;
};

type ThemeSettingsExport = {
  version: 1;
  active_custom_theme_profile_id: string;
  custom_theme_profiles: CustomThemeProfile[];
};

type CompiledMatcher = {
  regex: RegExp;
  map: Map<string, ReplacementRule>;
  tokens: string[];
};

const ASCII_WORD_CHAR_REGEX = /[A-Za-z0-9_]/;

type DisplayReplaceMode = 'text_only' | 'image_only' | 'image_and_text';

type ThemePalette = {
  bgPaper: string;
  bgPaperDark: string;
  textMain: string;
  textSub: string;
  accentColor: string;
  lineColor: string;
  shadowColor: string;
  noteBg: string;
  btnBg: string;
  btnHover: string;
  pinColor: string;
  saveText: string;
};

type ThemeCustomColors = {
  bgPaper: string;
  bgPaperDark: string;
  textMain: string;
  textSub: string;
  accentColor: string;
  noteBg: string;
  btnBg: string;
  btnHover: string;
};

const THEME_PRESETS = [
  {
    key: 'day',
    label: '日间模式',
    colors: {
      bgPaper: '#f7f3e8',
      bgPaperDark: '#e8e0d0',
      textMain: '#5a4a42',
      textSub: '#8c7b70',
      accentColor: '#a33e3b',
      noteBg: '#fffbf0',
      btnBg: '#e6dcc3',
      btnHover: '#d9cba8',
    },
  },
  {
    key: 'night',
    label: '夜间模式',
    colors: {
      bgPaper: '#2b2e3b',
      bgPaperDark: '#20222a',
      textMain: '#dcdde1',
      textSub: '#7f8fa6',
      accentColor: '#f1c40f',
      noteBg: '#353b48',
      btnBg: '#404b69',
      btnHover: '#4e6a85',
    },
  },
] as const;

type ThemePresetKey = (typeof THEME_PRESETS)[number]['key'];
type UiTheme = ThemePresetKey | 'tavern' | 'custom';

type PersistentMessageBackup = {
  message: string;
  swipes?: string[];
};

type MessageState = {
  message: ChatMessage;
  swiped: ChatMessageSwiped | null;
  backup: PersistentMessageBackup | null;
  hasStoredBackup: boolean;
};

type ChatMessagePatch = {
  message_id: number;
  message?: string;
  swipes?: string[];
  data?: Record<string, any>;
};

const LOG_PREFIX = '[用户名替换脚本V2.0]';
const DEFAULT_CUSTOM_PROFILE_ID = 'profile-1';
const DEFAULT_CUSTOM_THEME_PROFILE_ID = 'theme-1';
const USER_RULE_SOURCE = '{{user}}';
const CHAR_RULE_SOURCE = '{{char}}';
const PERSISTENT_BACKUP_DATA_KEY = 'th_user_name_replace_backup';
const LEGACY_PERSISTENT_BACKUP_DATA_KEY_PREFIX = 'th_user_name_replace_backup_';
const REPLACEMENT_CLASS = 'TH-user-name-replace';
const REPLACEMENT_FLOW_CLASS = 'TH-user-name-replace-flow';
const ORIGINAL_TEXT_DATA_ATTRIBUTE = 'data-th-user-name-original';
const FHB_MESSAGE_RENDERED_EVENT = 'fhb_message_rendered';
const ST_CHATU8_MANAGED_SELECTOR = [
  '.image-tag-button',
  '.st-chatu8-image-button',
  '.st-chatu8-image-span',
  '.st-chatu8-image-container',
  '.st-chatu8-collapse-wrapper',
].join(', ');
const MESSAGE_DISPLAY_CONTENT_SELECTOR = '.mes_text, .mes_reasoning';
const MESSAGE_DISPLAY_IFRAME_SELECTOR = '.mes_text iframe, .mes_reasoning iframe';

const ThemeCustomColorsSchema = z.object({
  bgPaper: z.string().default('#f7f3e8'),
  bgPaperDark: z.string().default('#e8e0d0'),
  textMain: z.string().default('#5a4a42'),
  textSub: z.string().default('#8c7b70'),
  accentColor: z.string().default('#a33e3b'),
  noteBg: z.string().default('#fffbf0'),
  btnBg: z.string().default('#e6dcc3'),
  btnHover: z.string().default('#d9cba8'),
});

const PersistentMessageBackupSchema = z.object({
  message: z.string(),
  swipes: z.array(z.string()).optional(),
});

const ReplacementRuleSchema = z.object({
  enabled: z.boolean().default(true),
  source: z.string().default(''),
  replacement_text: z.string().default(''),
  image_url: z.string().default(''),
  blurred: z.boolean().default(false),
});

const CustomProfileSchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  rules: z.array(ReplacementRuleSchema).default([]),
});

const CustomThemeProfileSchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  colors: ThemeCustomColorsSchema.prefault({}),
});

const CustomSettingsExportSchema = z.object({
  version: z.literal(1).default(1),
  custom_enabled: z.boolean().default(true),
  active_custom_profile_id: z.string().default(DEFAULT_CUSTOM_PROFILE_ID),
  custom_profiles: z.array(CustomProfileSchema).default([]),
});

const ThemeSettingsExportSchema = z.object({
  version: z.literal(1).default(1),
  active_custom_theme_profile_id: z.string().default(DEFAULT_CUSTOM_THEME_PROFILE_ID),
  custom_theme_profiles: z.array(CustomThemeProfileSchema).default([]),
});

const SettingsSchema = z
  .object({
    enabled: z.boolean().default(false),

    // 图片替换行为
    image_replace_whole_word: z.boolean().default(true), // 兼容旧版本
    display_replace_mode: z.enum(['text_only', 'image_only', 'image_and_text']).optional(),

    // 设置界面主题
    ui_theme: z.enum(['day', 'night', 'tavern', 'custom']).default('day'),
    custom_theme_colors: ThemeCustomColorsSchema.prefault({}),
    active_custom_theme_profile_id: z.string().default(DEFAULT_CUSTOM_THEME_PROFILE_ID),
    custom_theme_profiles: z.array(CustomThemeProfileSchema).default([]),
    custom_theme_palette_collapsed: z.boolean().default(true),

    // 是否直接写回聊天正文
    replace_message_content: z.boolean().default(false),

    // 是否同时替换聊天楼层标题中的用户/角色名称
    replace_message_header_names: z.boolean().default(false),

    // 是否替换“回声小剧场”的角色标题与 Shadow DOM 正文
    replace_echo_theater: z.boolean().default(false),

    // {{user}} 对应名称替换
    user_enabled: z.boolean().default(true),
    user_replacement_text: z.string().default('玩家'),
    user_image_url: z.string().default(''),

    // {{char}} 对应名称替换
    char_enabled: z.boolean().default(false),
    char_replacement_text: z.string().default('角色'),
    char_image_url: z.string().default(''),

    // 自定义词汇替换
    custom_enabled: z.boolean().default(false),
    custom_rules_raw: z.string().default(''),
    active_custom_profile_id: z.string().default(DEFAULT_CUSTOM_PROFILE_ID),
    custom_profiles: z.array(CustomProfileSchema).default([]),

    // 悬浮按钮位置（百分比，0~1，基于可视区域）
    fab_pos_x: z.number().min(0).max(1).default(0.94),
    fab_pos_y: z.number().min(0).max(1).default(0.42),
    fab_layout: z.enum(['vertical', 'horizontal']).default('vertical'),
    fab_show_collapse_button: z.boolean().default(false),
    fab_show_content_sync_button: z.boolean().default(false),
    fab_collapsed: z.boolean().default(false),
    fab_enabled: z.boolean().optional(),
    fab_auto_show: z.boolean().default(true), // 兼容旧版“加载后自动显示”设置
    fab_compact_dock: z.boolean().default(true),
    fab_expanded: z.boolean().default(false),
  })
  .prefault({});

const VariablesSchema = z
  .object({
    user_name_replace: SettingsSchema,
  })
  .prefault({ user_name_replace: {} });

type Settings = z.infer<typeof SettingsSchema>;
type Variables = z.infer<typeof VariablesSchema>;

const FLOATING_PANEL_BUTTON_NAME = '替换设置';
const REPLACEMENT_TOGGLE_BUTTON_NAME = '替换开关';
const CONTENT_SYNC_TOGGLE_BUTTON_NAME = '同步替换开关';
const CONTENT_SYNC_ACTIVE_COLOR = '#f59e0b';

function isContentSyncActive(settings: Settings): boolean {
  return settings.enabled && settings.replace_message_content;
}

function getToggledReplacementSettings(settings: Settings): Settings {
  return SettingsSchema.parse({ ...settings, enabled: !settings.enabled });
}

function getToggledContentSyncSettings(settings: Settings): Settings {
  const active = isContentSyncActive(settings);
  return SettingsSchema.parse({
    ...settings,
    enabled: active ? settings.enabled : true,
    replace_message_content: !active,
  });
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map(part => `${part}${part}`)
          .join('')
      : normalized.padEnd(6, '0');
  const value = Number.parseInt(expanded.slice(0, 6), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function parseCssColor(color: string, doc: Document = document): { r: number; g: number; b: number } | null {
  const value = color.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return hexToRgb(value);

  const rgbMatch = value.match(
    /^rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i,
  );
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
    };
  }

  if (!doc.body) return null;
  const probe = doc.createElement('span');
  probe.style.cssText = 'position:fixed;left:-9999px;visibility:hidden;pointer-events:none;';
  probe.style.color = value;
  doc.body.appendChild(probe);
  try {
    const resolved = doc.defaultView?.getComputedStyle(probe).color ?? '';
    if (!resolved || resolved === value) return null;
    return parseCssColor(resolved, doc);
  } finally {
    probe.remove();
  }
}

function rgbaFromCssColor(color: string, alpha: number, doc: Document = document): string {
  const { r, g, b } = parseCssColor(color, doc) ?? { r: 0, g: 0, b: 0 };
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isUsableCssColor(color: string): boolean {
  const value = color.trim().toLowerCase();
  return Boolean(value) && value !== 'transparent' && !/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)$/.test(value);
}

function getComputedTextColor(el: Element | null): string | null {
  if (!el) return null;

  const view = el.ownerDocument.defaultView;
  if (!view) return null;

  const color = view.getComputedStyle(el).color;
  return isUsableCssColor(color) ? color : null;
}

function getTavernReferenceTextColor(doc: Document): string | null {
  const selectors = [
    '#chat .mes_text blockquote',
    '.mes_text blockquote',
    '#chat blockquote',
    'blockquote',
    '.quote',
    '.mes_text q',
  ];

  for (const selector of selectors) {
    const color = getComputedTextColor(doc.querySelector(selector));
    if (color) return color;
  }

  const probeWrap = doc.createElement('div');
  probeWrap.className = 'mes_text';
  probeWrap.style.cssText =
    'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;visibility:hidden;pointer-events:none;';
  const probeQuote = doc.createElement('blockquote');
  probeQuote.textContent = 'q';
  probeWrap.appendChild(probeQuote);
  doc.body.appendChild(probeWrap);
  try {
    return getComputedTextColor(probeQuote);
  } finally {
    probeWrap.remove();
  }
}

function getContrastText(color: string, doc: Document = document): string {
  const { r, g, b } = parseCssColor(color, doc) ?? { r: 0, g: 0, b: 0 };
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness >= 145 ? '#1d212d' : '#fffaf3';
}

function buildThemePalette(colors: ThemeCustomColors): ThemePalette {
  return {
    ...colors,
    lineColor: rgbaFromCssColor(colors.textMain, 0.2),
    shadowColor: rgbaFromCssColor(colors.bgPaperDark, 0.32),
    pinColor: colors.accentColor,
    saveText: getContrastText(colors.accentColor),
  };
}

function buildTavernThemePalette(doc: Document): ThemePalette {
  const fallback = THEME_PRESETS[0].colors;
  const cssVar = (name: string, fallbackColor: string) => `var(${name}, ${fallbackColor})`;
  const accentColor = cssVar('--SmartThemeQuoteColor', fallback.accentColor);

  return {
    bgPaper: cssVar('--SmartThemeBlurTintColor', fallback.bgPaper),
    bgPaperDark: cssVar('--SmartThemeChatTintColor', fallback.bgPaperDark),
    textMain: cssVar('--SmartThemeBodyColor', fallback.textMain),
    textSub: cssVar('--SmartThemeEmColor', fallback.textSub),
    accentColor,
    lineColor: cssVar('--SmartThemeBorderColor', rgbaFromCssColor(fallback.textMain, 0.2)),
    shadowColor: cssVar('--SmartThemeShadowColor', rgbaFromCssColor(fallback.bgPaperDark, 0.32)),
    noteBg: cssVar('--SmartThemeBotMesBlurTintColor', fallback.noteBg),
    btnBg: cssVar('--SmartThemeUserMesBlurTintColor', fallback.btnBg),
    btnHover: cssVar('--SmartThemeBlurTintColor', fallback.btnHover),
    pinColor: accentColor,
    saveText: getContrastText(accentColor, doc),
  };
}

function getThemePreset(key: ThemePresetKey) {
  return THEME_PRESETS.find(theme => theme.key === key) ?? THEME_PRESETS[0];
}

function getThemePalette(
  theme: UiTheme,
  customThemeColors?: ThemeCustomColors,
  doc: Document = document,
): ThemePalette {
  if (theme === 'tavern') {
    return buildTavernThemePalette(doc);
  }
  if (theme === 'custom') {
    return buildThemePalette(ThemeCustomColorsSchema.parse(customThemeColors ?? {}));
  }
  return buildThemePalette(getThemePreset(theme).colors);
}

function getDisplayReplaceMode(settings: Settings): DisplayReplaceMode {
  return settings.display_replace_mode ?? (settings.image_replace_whole_word ? 'image_only' : 'image_and_text');
}

function isFloatingWindowEnabled(settings: Settings): boolean {
  return settings.fab_enabled ?? settings.fab_auto_show;
}

function getResolvedThemePalette(settings: Settings, doc: Document = document): ThemePalette {
  return getThemePalette(settings.ui_theme, getActiveCustomThemeColors(settings), doc);
}

function getPersistentBackupDataKey(): string {
  return PERSISTENT_BACKUP_DATA_KEY;
}

function getUserName(): string {
  return (SillyTavern.name1 ?? '').trim();
}

function getCharName(): string {
  return ((SillyTavern as any).name2 ?? '').trim();
}

function normalizeUrl(url: string): string {
  return url.trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function hasAsciiWordChar(text: string): boolean {
  return ASCII_WORD_CHAR_REGEX.test(text);
}

function isAsciiWordChar(char: string | undefined): boolean {
  return char !== undefined && ASCII_WORD_CHAR_REGEX.test(char);
}

function isTokenBoundaryValid(source: string, token: string, start: number, end: number): boolean {
  const prev = start > 0 ? source[start - 1] : undefined;
  const next = end < source.length ? source[end] : undefined;

  if (hasAsciiWordChar(token)) {
    return !isAsciiWordChar(prev) && !isAsciiWordChar(next);
  }

  return true;
}

function findNextTokenMatch(
  source: string,
  matcher: CompiledMatcher,
  fromIndex: number,
): { token: string; rule: ReplacementRule; start: number; end: number } | null {
  for (let index = fromIndex; index < source.length; index++) {
    for (const token of matcher.tokens) {
      if (!source.startsWith(token, index)) continue;

      const end = index + token.length;
      if (!isTokenBoundaryValid(source, token, index, end)) continue;

      const rule = matcher.map.get(token);
      if (!rule) continue;

      return { token, rule, start: index, end };
    }
  }

  return null;
}

function parseCustomRules(raw: string): ReplacementRule[] {
  // 格式（每行一条）：
  // 原词 => 替换文本
  // 原词 => 替换文本 | 图片URL
  // 原词 =>  | 图片URL
  const lines = raw.split(/\r?\n/);
  const rules: ReplacementRule[] = [];

  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;

    const sepIdx = line.indexOf('=>');
    if (sepIdx < 0) continue;

    const source = line.slice(0, sepIdx).trim();
    const right = line.slice(sepIdx + 2).trim();

    if (!source) continue;

    const [replacement_text, image_url] = right.includes('|')
      ? (() => {
          const [text, image] = right.split('|', 2);
          return [(text ?? '').trim(), normalizeUrl(image ?? '')];
        })()
      : [right.trim(), ''];

    rules.push({
      enabled: true,
      source,
      replacement_text,
      image_url,
      blurred: false,
    });
  }

  return rules;
}

function createCustomProfileId(): string {
  return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createCustomThemeProfileId(): string {
  return `theme-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeReplacementRule(rule: ReplacementRule): ReplacementRule {
  return {
    enabled: rule.enabled ?? true,
    source: String(rule.source ?? ''),
    replacement_text: String(rule.replacement_text ?? ''),
    image_url: normalizeUrl(String(rule.image_url ?? '')),
    blurred: Boolean(rule.blurred),
  };
}

function normalizeCustomThemeProfile(
  profile: CustomThemeProfile,
  index: number,
  usedIds: Set<string>,
): CustomThemeProfile {
  const parsed = CustomThemeProfileSchema.parse(profile);
  let id = parsed.id.trim() || (index === 0 ? DEFAULT_CUSTOM_THEME_PROFILE_ID : createCustomThemeProfileId());
  if (usedIds.has(id)) id = createCustomThemeProfileId();
  usedIds.add(id);

  return {
    id,
    name: parsed.name.trim() || `配色${index + 1}`,
    colors: ThemeCustomColorsSchema.parse(parsed.colors),
  };
}

function normalizeCustomThemeProfiles(
  profiles: CustomThemeProfile[],
  legacyColors?: ThemeCustomColors,
): CustomThemeProfile[] {
  const usedIds = new Set<string>();
  const normalized = profiles.map((profile, index) => normalizeCustomThemeProfile(profile, index, usedIds));
  if (normalized.length > 0) return normalized;

  return [
    {
      id: DEFAULT_CUSTOM_THEME_PROFILE_ID,
      name: '配色1',
      colors: ThemeCustomColorsSchema.parse(legacyColors ?? {}),
    },
  ];
}

function getActiveCustomThemeProfile(settings: Settings): CustomThemeProfile {
  const profiles = normalizeCustomThemeProfiles(settings.custom_theme_profiles, settings.custom_theme_colors);
  return profiles.find(profile => profile.id === settings.active_custom_theme_profile_id) ?? profiles[0];
}

function getActiveCustomThemeColors(settings: Settings): ThemeCustomColors {
  return getActiveCustomThemeProfile(settings).colors;
}

function splitRuleSources(source: string): string[] {
  const parts = String(source ?? '')
    .split(/[\n,，、;；/]+/g)
    .map(part => part.trim())
    .filter(Boolean);
  return Array.from(new Set(parts));
}

function serializeCustomRulesRaw(rules: ReplacementRule[]): string {
  return rules
    .map(normalizeReplacementRule)
    .filter(rule => rule.source.trim().length > 0)
    .map(rule => {
      const source = rule.source.trim();
      const text = rule.replacement_text.trim();
      const image = normalizeUrl(rule.image_url);
      return image ? `${source} => ${text} | ${image}` : `${source} => ${text}`;
    })
    .join('\n');
}

function getDefaultProfileRules(): ReplacementRule[] {
  return [
    { enabled: true, source: USER_RULE_SOURCE, replacement_text: 'user', image_url: '', blurred: false },
    { enabled: true, source: CHAR_RULE_SOURCE, replacement_text: 'char', image_url: '', blurred: false },
  ];
}

function getLegacyProfilePrefix(settings: Settings): ReplacementRule[] {
  const rules: ReplacementRule[] = [];

  if (settings.user_enabled) {
    rules.push({
      enabled: true,
      source: USER_RULE_SOURCE,
      replacement_text: settings.user_replacement_text.trim(),
      image_url: normalizeUrl(settings.user_image_url),
      blurred: false,
    });
  }

  if (settings.char_enabled) {
    rules.push({
      enabled: true,
      source: CHAR_RULE_SOURCE,
      replacement_text: settings.char_replacement_text.trim(),
      image_url: normalizeUrl(settings.char_image_url),
      blurred: false,
    });
  }

  return rules;
}

function hasProfileSource(profile: CustomProfile, source: string): boolean {
  return profile.rules.some(rule => rule.source.trim() === source);
}

function orderProfileRules(rules: ReplacementRule[]): ReplacementRule[] {
  const normalized = rules.map(normalizeReplacementRule);
  const userRules = normalized.filter(rule => rule.source.trim() === USER_RULE_SOURCE);
  const charRules = normalized.filter(rule => rule.source.trim() === CHAR_RULE_SOURCE);
  const customRules = normalized.filter(rule => {
    const source = rule.source.trim();
    return source !== USER_RULE_SOURCE && source !== CHAR_RULE_SOURCE;
  });

  return [...userRules, ...charRules, ...customRules];
}

function mergeLegacyUserCharIntoProfiles(settings: Settings, profiles: CustomProfile[]): CustomProfile[] {
  const legacyRules = getLegacyProfilePrefix(settings);
  if (legacyRules.length === 0) return profiles;

  return profiles.map(profile => {
    const prefix = legacyRules.filter(rule => !hasProfileSource(profile, rule.source));
    return {
      ...profile,
      rules: orderProfileRules(prefix.length > 0 ? [...prefix, ...profile.rules] : profile.rules),
    };
  });
}

function normalizeCustomProfiles(profiles: CustomProfile[], legacyRaw: string): CustomProfile[] {
  const normalized: CustomProfile[] = [];
  const usedIds = new Set<string>();

  profiles.forEach((profile, index) => {
    const parsed = CustomProfileSchema.parse(profile);
    let id = parsed.id.trim() || (index === 0 ? DEFAULT_CUSTOM_PROFILE_ID : createCustomProfileId());
    if (usedIds.has(id)) id = createCustomProfileId();
    usedIds.add(id);

    normalized.push({
      id,
      name: parsed.name.trim() || `配置${index + 1}`,
      rules: orderProfileRules(parsed.rules),
    });
  });

  if (normalized.length > 0) return normalized;

  const legacyRules = parseCustomRules(legacyRaw);
  return [
    {
      id: DEFAULT_CUSTOM_PROFILE_ID,
      name: '配置1',
      rules: legacyRules.length > 0 ? legacyRules : getDefaultProfileRules(),
    },
  ];
}

function normalizeCustomProfilesForSettings(settings: Settings): CustomProfile[] {
  const profiles = normalizeCustomProfiles(settings.custom_profiles, settings.custom_rules_raw);
  return mergeLegacyUserCharIntoProfiles(settings, profiles);
}

function getActiveCustomProfile(settings: Settings): CustomProfile {
  const profiles = normalizeCustomProfilesForSettings(settings);
  return profiles.find(profile => profile.id === settings.active_custom_profile_id) ?? profiles[0];
}

function getActiveCustomRules(settings: Settings): ReplacementRule[] {
  return getActiveCustomProfile(settings).rules;
}

function buildCustomSettingsExport(settings: Settings): CustomSettingsExport {
  const profiles = normalizeCustomProfilesForSettings(settings);
  const activeProfile = profiles.find(profile => profile.id === settings.active_custom_profile_id) ?? profiles[0];
  return CustomSettingsExportSchema.parse({
    version: 1,
    custom_enabled: settings.custom_enabled,
    active_custom_profile_id: activeProfile.id,
    custom_profiles: profiles,
  });
}

function resolveRuleSource(source: string): string {
  const trimmed = source.trim();
  if (trimmed === USER_RULE_SOURCE) return getUserName();
  if (trimmed === CHAR_RULE_SOURCE) return getCharName();
  return trimmed;
}

function buildThemeSettingsExport(
  activeThemeId: string,
  customThemeProfiles: CustomThemeProfile[],
): ThemeSettingsExport {
  const profiles = normalizeCustomThemeProfiles(customThemeProfiles);
  const activeProfile = profiles.find(profile => profile.id === activeThemeId) ?? profiles[0];
  return ThemeSettingsExportSchema.parse({
    version: 1,
    active_custom_theme_profile_id: activeProfile.id,
    custom_theme_profiles: profiles,
  });
}

function buildRules(settings: Settings): ReplacementRule[] {
  const rules: ReplacementRule[] = [];

  for (const rule of getActiveCustomRules(settings).filter(rule => rule.enabled)) {
    for (const source of splitRuleSources(rule.source)) {
      rules.push({
        ...rule,
        source: resolveRuleSource(source),
      });
    }
  }

  return rules.filter(r => r.source.trim().length > 0);
}

function buildContentMatcher(settings: Settings): CompiledMatcher | null {
  return compileMatcher(
    buildRules(settings).filter(rule => rule.replacement_text.trim().length > 0 || !normalizeUrl(rule.image_url)),
  );
}

function compileMatcher(rules: ReplacementRule[]): CompiledMatcher | null {
  if (rules.length === 0) return null;

  // 后出现的同名规则覆盖先出现（让自定义可覆盖 user/char）
  const map = new Map<string, ReplacementRule>();
  for (const r of rules) map.set(r.source, r);

  const tokens = Array.from(map.keys()).sort((a, b) => b.length - a.length);
  if (tokens.length === 0) return null;

  const alts = tokens.map(s => escapeRegExp(s)).join('|');

  // 只匹配完整词：
  // 左边界：开头或非字母数字下划线
  // 右边界：结尾或非字母数字下划线
  // 只把 ASCII 单词字符当作“词内”
  // 这样可避免 Alice 命中 Malice，同时中文可正常匹配
  const regex = new RegExp(alts, 'g');

  return { regex, map, tokens };
}

function replaceTextContentByMatcher(source: string, matcher: CompiledMatcher | null): string {
  if (!matcher || !source) return source;

  let last = 0;
  let changed = false;
  let result = '';

  while (true) {
    const match = findNextTokenMatch(source, matcher, last);
    if (!match) break;

    const replacement_text = match.rule.replacement_text.trim();

    result += source.slice(last, match.start);
    result += replacement_text;
    last = match.end;
    changed = true;
  }

  if (!changed) return source;
  return result + source.slice(last);
}

function setImportantStyles(element: HTMLElement, styles: Record<string, string>) {
  Object.entries(styles).forEach(([property, value]) => {
    element.style.setProperty(property, value, 'important');
  });
}

function makeReplacementImage(
  ownerDocument: Document,
  image_url: string,
  alt: string,
  marginRight = '0',
): HTMLImageElement {
  const image = ownerDocument.createElement('img');
  image.src = image_url;
  image.alt = alt;
  image.title = alt;
  setImportantStyles(image, {
    display: 'inline-block',
    width: '1.2em',
    height: '1.2em',
    'min-width': '1.2em',
    'min-height': '1.2em',
    'max-width': '1.2em',
    'max-height': '1.2em',
    'object-fit': 'cover',
    'border-radius': '999px',
    // 与旧版保持一致：贴着文字底部对齐，不参与扩大所在行的行盒。
    'vertical-align': 'text-bottom',
    float: 'none',
    position: 'static',
    margin: '0',
    'margin-right': marginRight,
    padding: '0',
    'box-sizing': 'border-box',
  });
  return image;
}

type ReplacementTextStyle = 'plain' | 'italic' | 'bold' | 'bold_italic' | 'code';

type ReplacementTextSegment = {
  text: string;
  style: ReplacementTextStyle;
};

function parseReplacementTextSegments(source: string): ReplacementTextSegment[] {
  const formatPattern =
    /<code>([\s\S]*?)<\/code>|`([^`\r\n]+)`|\*\*\*([^*\r\n]+)\*\*\*|\*\*([^*\r\n]+)\*\*|\*([^*\r\n]+)\*/gi;
  const segments: ReplacementTextSegment[] = [];
  let lastIndex = 0;

  for (const match of source.matchAll(formatPattern)) {
    const start = match.index;
    if (start > lastIndex) {
      segments.push({ text: source.slice(lastIndex, start), style: 'plain' });
    }

    if (match[1] !== undefined) {
      segments.push({ text: match[1], style: 'code' });
    } else if (match[2] !== undefined) {
      segments.push({ text: match[2], style: 'code' });
    } else if (match[3] !== undefined) {
      segments.push({ text: match[3], style: 'bold_italic' });
    } else if (match[4] !== undefined) {
      segments.push({ text: match[4], style: 'bold' });
    } else if (match[5] !== undefined) {
      segments.push({ text: match[5], style: 'italic' });
    }

    lastIndex = start + match[0].length;
  }

  if (lastIndex < source.length) {
    segments.push({ text: source.slice(lastIndex), style: 'plain' });
  }

  return segments;
}

function getPlainReplacementText(source: string): string {
  return parseReplacementTextSegments(source)
    .map(segment => segment.text)
    .join('');
}

function appendFormattedReplacementText(parent: HTMLElement, source: string, ownerDocument: Document) {
  for (const segment of parseReplacementTextSegments(source)) {
    if (!segment.text) continue;
    if (segment.style === 'plain') {
      parent.appendChild(ownerDocument.createTextNode(segment.text));
      continue;
    }

    if (segment.style === 'code') {
      const code = ownerDocument.createElement('code');
      code.textContent = segment.text;
      setImportantStyles(code, {
        display: 'inline-block',
        padding: '0.08em 0.36em',
        border: '1px solid color-mix(in srgb, currentColor 24%, transparent)',
        'border-radius': '0.4em',
        background: 'color-mix(in srgb, currentColor 8%, transparent)',
        color: 'inherit',
        'font-family': 'inherit',
        'font-size': 'inherit',
        'font-style': 'inherit',
        'font-weight': 'inherit',
        'letter-spacing': 'inherit',
        'line-height': '1.25',
        'vertical-align': 'baseline',
        'white-space': 'nowrap',
      });
      parent.appendChild(code);
      continue;
    }

    const styled = ownerDocument.createElement('span');
    styled.textContent = segment.text;
    if (segment.style === 'bold' || segment.style === 'bold_italic') {
      styled.style.setProperty('font-weight', '700', 'important');
    }
    if (segment.style === 'italic' || segment.style === 'bold_italic') {
      styled.style.setProperty('font-style', 'italic', 'important');
    }
    parent.appendChild(styled);
  }
}

function makeReplacementNode(
  original: string,
  rule: ReplacementRule,
  settings: Settings,
  ownerDocument: Document = document,
): HTMLElement {
  const $wrap = $(ownerDocument.createElement('span'))
    .addClass(REPLACEMENT_CLASS)
    .attr(ORIGINAL_TEXT_DATA_ATTRIBUTE, original);
  setImportantStyles($wrap[0] as HTMLElement, {
    // 不能使用 inline-flex：它会生成独立的 flex 行盒，把正文和状态栏每行额外撑高。
    // 窄 flex 标签的连续排版由 stabilizeReplacementLayout 外层流容器负责。
    display: 'inline',
    width: 'auto',
    height: 'auto',
    'min-width': '0',
    'max-width': 'none',
    margin: '0',
    padding: '0',
    border: '0',
    float: 'none',
    position: 'static',
    'vertical-align': 'baseline',
    'white-space': 'nowrap',
    'word-break': 'keep-all',
    'overflow-wrap': 'normal',
    'text-indent': '0',
    'line-height': 'inherit',
    'font-family': 'inherit',
    'font-size': 'inherit',
    'font-style': 'inherit',
    'font-weight': 'inherit',
    'letter-spacing': 'inherit',
    color: 'inherit',
    'box-sizing': 'border-box',
  });

  if (rule.blurred) {
    setImportantStyles($wrap[0] as HTMLElement, {
      filter: 'blur(4px)',
      '-webkit-filter': 'blur(4px)',
      'user-select': 'none',
      '-webkit-user-select': 'none',
    });
  }

  const text = rule.replacement_text.trim();
  const plainText = getPlainReplacementText(text);
  const image_url = normalizeUrl(rule.image_url);
  const displayMode = getDisplayReplaceMode(settings);
  const hasImage = Boolean(image_url);
  const hasText = Boolean(text);
  const shouldShowImage = hasImage && (!hasText || displayMode !== 'text_only');
  const shouldShowText = hasText && (!hasImage || displayMode !== 'image_only');

  if (shouldShowImage) {
    const alt = plainText || original || 'replaced';
    const image = makeReplacementImage(ownerDocument, image_url, alt, shouldShowText && text ? '0.35em' : '0');

    if (!shouldShowText) {
      $wrap.append(image);
      return $wrap[0] as HTMLElement;
    }

    // 图片 + 文字
    $wrap.append(image);
  }

  if (shouldShowText) {
    appendFormattedReplacementText($wrap[0] as HTMLElement, text, ownerDocument);
  } else if (!hasImage && !hasText) {
    // 图片文本都空时，明确按空替换处理。
  } else if (!shouldShowImage) {
    // 当前模式隐藏了已有内容时，回退到仍可显示的那一项
    if (hasText) {
      appendFormattedReplacementText($wrap[0] as HTMLElement, text, ownerDocument);
    } else if (hasImage) {
      const alt = plainText || original || 'replaced';
      $wrap.append(makeReplacementImage(ownerDocument, image_url, alt));
    }
  }

  return $wrap[0] as HTMLElement;
}

function areStringArraysEqual(lhs?: string[], rhs?: string[]): boolean {
  if (!lhs && !rhs) return true;
  if (!lhs || !rhs) return false;
  if (lhs.length !== rhs.length) return false;
  return lhs.every((value, index) => value === rhs[index]);
}

function isSameBackup(lhs: PersistentMessageBackup | null, rhs: PersistentMessageBackup | null): boolean {
  return JSON.stringify(lhs ?? null) === JSON.stringify(rhs ?? null);
}

function getPersistentBackupDataKeys(data: Record<string, any> | undefined): string[] {
  if (!data) return [];

  const keys = new Set<string>();
  if (Object.prototype.hasOwnProperty.call(data, PERSISTENT_BACKUP_DATA_KEY)) {
    keys.add(PERSISTENT_BACKUP_DATA_KEY);
  }

  for (const key of Object.keys(data)) {
    if (key.startsWith(LEGACY_PERSISTENT_BACKUP_DATA_KEY_PREFIX)) {
      keys.add(key);
    }
  }

  return Array.from(keys);
}

function hasStoredBackupKey(data: Record<string, any> | undefined): boolean {
  return getPersistentBackupDataKeys(data).length > 0;
}

function parsePersistentBackup(data: Record<string, any> | undefined): PersistentMessageBackup | null {
  for (const key of getPersistentBackupDataKeys(data)) {
    const parsed = PersistentMessageBackupSchema.safeParse(data?.[key]);
    if (parsed.success) return parsed.data;
  }

  return null;
}

function withPersistentBackupData(
  data: Record<string, any> | undefined,
  backup: PersistentMessageBackup | null,
): Record<string, any> {
  const nextData = { ...(data ?? {}) };
  for (const key of getPersistentBackupDataKeys(nextData)) {
    delete nextData[key];
  }

  if (backup) {
    nextData[getPersistentBackupDataKey()] = backup;
  }

  return nextData;
}

function hasReplacementMarkup($el: any): boolean {
  return $el.find(`.${REPLACEMENT_CLASS}`).length > 0;
}

function isValidMessageId(message_id: unknown): message_id is number {
  return Number.isInteger(message_id) && Number(message_id) >= 0;
}

function restoreElement($el: any) {
  if (hasReplacementMarkup($el)) {
    $el.find(`.${REPLACEMENT_CLASS}`).each((_idx: number, element: HTMLElement) => {
      const original = element.getAttribute(ORIGINAL_TEXT_DATA_ATTRIBUTE) ?? element.textContent ?? '';
      element.replaceWith(element.ownerDocument.createTextNode(original));
    });
  }

  const flowContainers = $el.find(`.${REPLACEMENT_FLOW_CLASS}`).get().reverse() as HTMLElement[];
  flowContainers.forEach(container => {
    container.replaceWith(...Array.from(container.childNodes));
  });
}

function restoreAll() {
  $('#chat > .mes')
    .find(`${MESSAGE_DISPLAY_CONTENT_SELECTOR}, .name_text`)
    .each((_idx: number, el: HTMLElement) => {
      restoreElement($(el));
    });
}

function isEmptyImageTagMarker(element: Element): boolean {
  return (
    element.tagName === 'IMG' &&
    !element.hasAttribute('src') &&
    !element.hasAttribute('srcset') &&
    !element.hasAttribute('data-link') &&
    element.attributes.length === 0
  );
}

function isInsideStChatu8SourceTag(element: Element, root: HTMLElement): boolean {
  let current: Element | null = element;

  while (current && root.contains(current)) {
    const hasMarker = Array.from(current.children).some(isEmptyImageTagMarker);
    if (hasMarker && /image\s*###/i.test(current.textContent ?? '')) {
      return true;
    }
    if (current === root) break;
    current = current.parentElement;
  }

  return false;
}

function isInsideTavernHelperFrontendSource(element: Element): boolean {
  const code = element.closest('code');
  if (!code) return false;

  // 酒馆助手会把这类隐藏代码块当作 iframe 的 HTML 源码读取。若提前往源码 DOM
  // 插入替换 span，渲染器会把 span 当成页面内容，最终在 iframe 末尾泄漏出 USERUSER。
  if (code.classList.contains('custom-html')) return true;

  const pre = code.closest('pre');
  return Boolean(pre?.classList.contains('hidden!') && pre.parentElement?.classList.contains('TH-render'));
}

function shouldSkipReplacementNode(node: Text, root: HTMLElement): boolean {
  const parent = node.parentElement;
  if (!parent) return true;

  // 普通 Markdown code/pre 仍允许替换；酒馆助手 iframe 的隐藏 HTML 源码必须保持纯文本，
  // 等 iframe 渲染完成后再由 applyToNestedIframe 处理可见内容。
  if (isInsideTavernHelperFrontendSource(parent)) return true;

  // 仍跳过表单、可执行内容、本脚本节点和 st-chatu8 交互区域。
  if (parent.closest(`textarea, script, style, .${REPLACEMENT_CLASS}, ${ST_CHATU8_MANAGED_SELECTOR}`)) {
    return true;
  }

  // <image> 会被浏览器格式化为空 <img> + tag 文本。必须在 st-chatu8 解析前保护整段 tag，
  // 否则显示层替换与插件的渲染事件存在竞态，插件可能把替换后的名称写进 data-link。
  return isInsideStChatu8SourceTag(parent, root);
}

type TextNodeSlice = {
  node: Text;
  start: number;
  end: number;
};

function replaceTextAcrossCodeMarkup(code: HTMLElement, matcher: CompiledMatcher, settings: Settings) {
  const walker = code.ownerDocument.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  const slices: TextNodeSlice[] = [];
  let source = '';

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (shouldSkipReplacementNode(node, code)) continue;

    const text = node.nodeValue ?? '';
    if (!text) continue;

    const start = source.length;
    source += text;
    slices.push({ node, start, end: source.length });
  }

  if (!source || slices.length === 0) return;

  const matches: Array<{ token: string; rule: ReplacementRule; start: number; end: number }> = [];
  let fromIndex = 0;
  while (true) {
    const match = findNextTokenMatch(source, matcher, fromIndex);
    if (!match) break;
    matches.push(match);
    fromIndex = match.end;
  }

  // 从后往前改 DOM，前方文本节点的 offset 才不会因后方替换而移动。
  matches.reverse().forEach(match => {
    const startSlice = slices.find(slice => match.start >= slice.start && match.start < slice.end);
    const endSlice = slices.find(slice => match.end > slice.start && match.end <= slice.end);
    if (!startSlice || !endSlice || !startSlice.node.isConnected || !endSlice.node.isConnected) return;

    const range = code.ownerDocument.createRange();
    range.setStart(startSlice.node, match.start - startSlice.start);
    range.setEnd(endSlice.node, match.end - endSlice.start);
    range.deleteContents();
    range.insertNode(makeReplacementNode(match.token, match.rule, settings, code.ownerDocument));
    range.detach();
  });
}

function replaceTextNodesByMatcher(root: HTMLElement, matcher: CompiledMatcher, settings: Settings) {
  // Highlight.js 会把 {{user}} 拆成 "{{"、<span>user</span>、"}}" 三个文本节点；
  // 先在每个 code 的完整 textContent 坐标中匹配，再用 Range 跨节点替换。
  root.querySelectorAll<HTMLElement>('code').forEach(code => {
    replaceTextAcrossCodeMarkup(code, matcher, settings);
  });

  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (shouldSkipReplacementNode(node, root)) continue;
    nodes.push(node);
  }

  for (const node of nodes) {
    const src = node.nodeValue ?? '';
    if (!src) continue;

    let last = 0;
    let changed = false;
    const ownerDocument = root.ownerDocument;
    const frag = ownerDocument.createDocumentFragment();

    while (true) {
      const match = findNextTokenMatch(src, matcher, last);
      if (!match) break;

      if (match.start > last) {
        frag.appendChild(ownerDocument.createTextNode(src.slice(last, match.start)));
      }

      frag.appendChild(makeReplacementNode(match.token, match.rule, settings, ownerDocument));
      last = match.end;
      changed = true;
    }

    if (!changed) continue;

    if (last < src.length) {
      frag.appendChild(ownerDocument.createTextNode(src.slice(last)));
    }

    node.parentNode?.replaceChild(frag, node);
  }
}

function stabilizeReplacementLayout(root: HTMLElement) {
  const parents = new Set<HTMLElement>();
  root.querySelectorAll<HTMLElement>(`.${REPLACEMENT_CLASS}`).forEach(element => {
    if (element.parentElement) parents.add(element.parentElement);
  });

  parents.forEach(parent => {
    if (parent.classList.contains(REPLACEMENT_FLOW_CLASS)) return;

    const view = parent.ownerDocument.defaultView;
    if (!view) return;
    const parentStyle = view.getComputedStyle(parent);
    if (!['flex', 'inline-flex'].includes(parentStyle.display) || parentStyle.flexWrap !== 'nowrap') return;

    const childNodes = Array.from(parent.childNodes);
    const hasOutsideText = childNodes.some(node => node.nodeType === Node.TEXT_NODE && Boolean(node.nodeValue?.trim()));
    if (!hasOutsideText) return;

    const containsOnlyFlowText = childNodes.every(node => {
      if (node.nodeType === Node.TEXT_NODE) return true;
      if (!(node instanceof view.HTMLElement)) return false;
      return node.classList.contains(REPLACEMENT_CLASS) || node.tagName === 'BR';
    });
    if (!containsOnlyFlowText) return;

    const flow = parent.ownerDocument.createElement('span');
    flow.className = REPLACEMENT_FLOW_CLASS;
    setImportantStyles(flow, {
      display: 'block',
      width: 'auto',
      'min-width': '0',
      'max-width': '100%',
      flex: '1 1 auto',
      margin: '0',
      padding: '0',
      border: '0',
      'white-space': parentStyle.whiteSpace,
      'word-break': parentStyle.wordBreak,
      'overflow-wrap': parentStyle.overflowWrap,
      'line-height': 'inherit',
      'font-family': 'inherit',
      'font-size': 'inherit',
      'font-style': 'inherit',
      'font-weight': 'inherit',
      'letter-spacing': 'inherit',
      color: 'inherit',
      'text-align': 'inherit',
      'box-sizing': 'border-box',
    });
    childNodes.forEach(node => flow.appendChild(node));
    parent.appendChild(flow);
  });
}

function applyToTargetElement($el: any, matcher: CompiledMatcher | null, settings: Settings) {
  // 只撤销本脚本插入的 span，保留第三方插件动态 DOM、事件监听器与折叠状态。
  restoreElement($el);

  if (!settings.enabled || !matcher) {
    return;
  }

  replaceTextNodesByMatcher($el[0] as HTMLElement, matcher, settings);
  stabilizeReplacementLayout($el[0] as HTMLElement);
}

type NestedIframeDisplayState = {
  ownerDocument: Document;
  observer: MutationObserver;
  timer: number | null;
  matcher: CompiledMatcher | null;
  settings: Settings;
};

const nestedIframeDisplayStates = new Map<HTMLIFrameElement, NestedIframeDisplayState>();

function destroyNestedIframeDisplayState(frame: HTMLIFrameElement, restore = false) {
  const state = nestedIframeDisplayStates.get(frame);
  if (!state) return;

  state.observer.disconnect();
  if (state.timer !== null) window.clearTimeout(state.timer);
  if (restore && state.ownerDocument.body) restoreElement($(state.ownerDocument.body));
  nestedIframeDisplayStates.delete(frame);
}

function applyToNestedIframe(frame: HTMLIFrameElement, matcher: CompiledMatcher | null, settings: Settings) {
  try {
    const ownerDocument = frame.contentDocument;
    const body = ownerDocument?.body;
    if (!ownerDocument || !body) return;

    let state = nestedIframeDisplayStates.get(frame);
    if (state && state.ownerDocument !== ownerDocument) {
      destroyNestedIframeDisplayState(frame);
      state = undefined;
    }

    if (!state) {
      const FrameMutationObserver = (frame.contentWindow as any)?.MutationObserver as
        typeof MutationObserver | undefined;
      if (!FrameMutationObserver) return;

      const nextState: NestedIframeDisplayState = {
        ownerDocument,
        observer: null as unknown as MutationObserver,
        timer: null,
        matcher,
        settings,
      };
      nextState.observer = new FrameMutationObserver(() => {
        if (nextState.timer !== null) return;
        nextState.timer = window.setTimeout(() => {
          nextState.timer = null;
          applyToNestedIframe(frame, nextState.matcher, nextState.settings);
        }, 0);
      });
      state = nextState;
      nestedIframeDisplayStates.set(frame, state);
    }

    state.matcher = matcher;
    state.settings = settings;
    state.observer.disconnect();
    if (state.timer !== null) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }

    applyToTargetElement($(body), matcher, settings);
    state.observer.observe(body, { childList: true, characterData: true, subtree: true });
  } catch {
    // 跨域 iframe 无法读取；保持原样即可。
  }
}

function cleanupDisconnectedNestedIframeDisplayStates() {
  for (const frame of nestedIframeDisplayStates.keys()) {
    if (!frame.isConnected) destroyNestedIframeDisplayState(frame);
  }
}

function applyToNestedMessageIframes($mes: any, matcher: CompiledMatcher | null, settings: Settings) {
  cleanupDisconnectedNestedIframeDisplayStates();
  const eventNamespace = `.TH_user_name_replace_nested_iframe_${getScriptId()}`;

  $mes.find(MESSAGE_DISPLAY_IFRAME_SELECTOR).each((_idx: number, element: HTMLIFrameElement) => {
    const $frame = $(element);
    $frame.off(`load${eventNamespace}`).on(`load${eventNamespace}`, () => {
      destroyNestedIframeDisplayState(element);
      applyToNestedIframe(element, matcher, settings);
    });
    applyToNestedIframe(element, matcher, settings);
  });
}

function destroyNestedIframeDisplayEnhancements(restore: boolean) {
  const eventNamespace = `.TH_user_name_replace_nested_iframe_${getScriptId()}`;
  $('#chat > .mes').find(MESSAGE_DISPLAY_IFRAME_SELECTOR).off(`load${eventNamespace}`);
  for (const frame of Array.from(nestedIframeDisplayStates.keys())) {
    destroyNestedIframeDisplayState(frame, restore);
  }
}

function applyToMessageElement($mes: any, matcher: CompiledMatcher | null, settings: Settings) {
  $mes.find('.name_text').each((_idx: number, el: HTMLElement) => {
    if (settings.replace_message_header_names) {
      applyToTargetElement($(el), matcher, settings);
    } else {
      restoreElement($(el));
    }
  });

  $mes.find(MESSAGE_DISPLAY_CONTENT_SELECTOR).each((_idx: number, el: HTMLElement) => {
    applyToTargetElement($(el), matcher, settings);
  });
  applyToNestedMessageIframes($mes, matcher, settings);
}

function applyToMessageId(message_id: number, settings: Settings) {
  if (!isValidMessageId(message_id)) return;

  const $mes = $(`#chat > .mes[mesid='${message_id}']`);
  if ($mes.length === 0) return;

  const matcher = compileMatcher(buildRules(settings));
  applyToMessageElement($mes, matcher, settings);
}

function applyToAllVisible(settings: Settings) {
  const matcher = compileMatcher(buildRules(settings));
  $('#chat > .mes').each((_idx: number, el: HTMLElement) => {
    applyToMessageElement($(el), matcher, settings);
  });
}

type EchoTheaterShadowState = {
  observer: MutationObserver;
};

function createEchoTheaterEnhancer(
  getSettings: () => Settings,
  pDoc: Document,
  pWin: Window,
): { reapply: () => void; destroy: (restore: boolean) => void } {
  const ParentMutationObserver = (pWin as any).MutationObserver as typeof MutationObserver | undefined;
  const shadowStates = new Map<ShadowRoot, EchoTheaterShadowState>();
  let destroyed = false;
  let outputElement: HTMLElement | null = null;
  let outputObserver: MutationObserver | null = null;
  let documentObserver: MutationObserver | null = null;
  let trackedTitle: HTMLElement | null = null;
  let applyTimer: number | null = null;

  const restoreShadowRoot = (root: ShadowRoot) => {
    root.querySelectorAll<HTMLElement>('.t-shadow-content').forEach(content => restoreElement($(content)));
  };

  const destroyShadowState = (root: ShadowRoot, restore: boolean) => {
    const state = shadowStates.get(root);
    if (!state) return;
    state.observer.disconnect();
    if (restore) restoreShadowRoot(root);
    shadowStates.delete(root);
  };

  const restoreTitle = () => {
    if (!trackedTitle) return;
    restoreElement($(trackedTitle));
    trackedTitle = null;
  };

  const scheduleApply = () => {
    if (destroyed) return;
    if (applyTimer !== null) pWin.clearTimeout(applyTimer);
    applyTimer = pWin.setTimeout(() => {
      applyTimer = null;
      reapply();
    }, 80);
  };

  const observeOutputElement = () => {
    const nextOutput = pDoc.querySelector<HTMLElement>('#t-output-content');
    if (nextOutput === outputElement) return;

    outputObserver?.disconnect();
    outputObserver = null;
    outputElement = nextOutput;

    if (!outputElement || !ParentMutationObserver) return;
    outputObserver = new ParentMutationObserver(scheduleApply);
    outputObserver.observe(outputElement, { childList: true, characterData: true, subtree: true });
  };

  const observeShadowRoot = (root: ShadowRoot) => {
    let state = shadowStates.get(root);
    if (!state) {
      const ShadowMutationObserver = (root.ownerDocument.defaultView as any)?.MutationObserver as
        typeof MutationObserver | undefined;
      if (!ShadowMutationObserver) return;
      state = { observer: new ShadowMutationObserver(scheduleApply) };
      shadowStates.set(root, state);
    }
    state.observer.observe(root, { childList: true, characterData: true, subtree: true });
  };

  const reapply = () => {
    if (destroyed) return;
    if (applyTimer !== null) pWin.clearTimeout(applyTimer);
    applyTimer = null;
    observeOutputElement();

    // 替换过程中暂停观察，避免本脚本插入/还原节点触发自己的观察器。
    outputObserver?.disconnect();
    shadowStates.forEach(state => state.observer.disconnect());

    const settings = getSettings();
    const active = settings.enabled && settings.replace_echo_theater;
    const matcher = active ? compileMatcher(buildRules(settings)) : null;
    const nextTitle = pDoc.querySelector<HTMLElement>('#t-char-name');

    if (trackedTitle && trackedTitle !== nextTitle) restoreTitle();
    trackedTitle = nextTitle;
    if (trackedTitle) {
      restoreElement($(trackedTitle));
      if (active && matcher) applyToTargetElement($(trackedTitle), matcher, settings);
    }

    const activeRoots = new Set<ShadowRoot>();
    outputElement?.querySelectorAll<HTMLElement>('.t-shadow-host').forEach(host => {
      const root = host.shadowRoot;
      if (!root) return;
      activeRoots.add(root);

      root.querySelectorAll<HTMLElement>('.t-shadow-content').forEach(content => {
        restoreElement($(content));
        if (active && matcher) applyToTargetElement($(content), matcher, settings);
      });
      observeShadowRoot(root);
    });

    for (const root of Array.from(shadowStates.keys())) {
      if (!activeRoots.has(root) || !root.host.isConnected) destroyShadowState(root, true);
    }

    if (outputElement && ParentMutationObserver) {
      outputObserver ??= new ParentMutationObserver(scheduleApply);
      outputObserver.observe(outputElement, { childList: true, characterData: true, subtree: true });
    }
  };

  if (ParentMutationObserver && pDoc.body) {
    // #t-output-content 本身可能随小剧场的关闭与重新打开而重建；这里只负责重新绑定目标观察器。
    documentObserver = new ParentMutationObserver(() => {
      const nextOutput = pDoc.querySelector<HTMLElement>('#t-output-content');
      if (nextOutput !== outputElement) scheduleApply();
    });
    documentObserver.observe(pDoc.body, { childList: true, subtree: true });
  }

  return {
    reapply,
    destroy: restore => {
      if (destroyed) return;
      destroyed = true;
      if (applyTimer !== null) pWin.clearTimeout(applyTimer);
      applyTimer = null;
      outputObserver?.disconnect();
      outputObserver = null;
      documentObserver?.disconnect();
      documentObserver = null;
      restoreTitle();
      for (const root of Array.from(shadowStates.keys())) destroyShadowState(root, restore);
      outputElement = null;
    },
  };
}

function getMessageState(message_id: number): MessageState | null {
  const message = getChatMessages(message_id)[0] as ChatMessage | undefined;
  if (!message) return null;

  const swiped = (() => {
    try {
      return (getChatMessages(message_id, { include_swipes: true })[0] as ChatMessageSwiped | undefined) ?? null;
    } catch {
      return null;
    }
  })();

  return {
    message,
    swiped,
    backup: parsePersistentBackup(message.data),
    hasStoredBackup: hasStoredBackupKey(message.data),
  };
}

function getAllMessageStates(): MessageState[] {
  try {
    const messages = getChatMessages('0-{{lastMessageId}}');
    const swipedByMessageId = new Map(
      getChatMessages('0-{{lastMessageId}}', { include_swipes: true }).map(message => [message.message_id, message]),
    );

    return messages.map(message => ({
      message,
      swiped: swipedByMessageId.get(message.message_id) ?? null,
      backup: parsePersistentBackup(message.data),
      hasStoredBackup: hasStoredBackupKey(message.data),
    }));
  } catch {
    return [];
  }
}

function shouldPersistentlyReplaceMessage(state: MessageState): boolean {
  return state.message.role !== 'user';
}

function buildClearPersistentMessageBackupPatch(state: MessageState): ChatMessagePatch | null {
  if (!state.hasStoredBackup) return null;

  return {
    message_id: state.message.message_id,
    data: withPersistentBackupData(state.message.data, null),
  };
}

function reconcileOriginalSwipes(
  original_swipes: string[] | undefined,
  current_swipes: string[] | undefined,
  matcher: CompiledMatcher | null,
): string[] | undefined {
  if (!current_swipes) return original_swipes?.slice();
  if (!original_swipes) return current_swipes.slice();

  if (original_swipes.length === current_swipes.length) {
    const is_aligned = original_swipes.every((original, index) => {
      const expected = replaceTextContentByMatcher(original, matcher);
      return current_swipes[index] === expected || current_swipes[index] === original;
    });
    if (is_aligned) return original_swipes.slice();
  }

  const matched_originals: string[] = [];
  const used = new Set<number>();

  for (const current of current_swipes) {
    const matched_index = original_swipes.findIndex((original, index) => {
      if (used.has(index)) return false;
      const expected = replaceTextContentByMatcher(original, matcher);
      return current === expected || current === original;
    });

    if (matched_index < 0) {
      return current_swipes.slice();
    }

    used.add(matched_index);
    matched_originals.push(original_swipes[matched_index]);
  }

  return matched_originals;
}

function buildRestorePersistentMessagePatch(
  state: MessageState,
  settings: Settings,
  matcher: CompiledMatcher | null = buildContentMatcher(settings),
): ChatMessagePatch | null {
  if (!state.backup && !state.hasStoredBackup) return null;

  if (!shouldPersistentlyReplaceMessage(state)) {
    return buildClearPersistentMessageBackupPatch(state);
  }

  const current_swipes = state.swiped?.swipes?.slice();
  const restored_swipes = current_swipes
    ? reconcileOriginalSwipes(state.backup?.swipes, current_swipes, matcher)
    : undefined;

  const has_message_diff = state.backup ? state.message.message !== state.backup.message : false;
  const has_swipes_diff =
    current_swipes !== undefined &&
    restored_swipes !== undefined &&
    !areStringArraysEqual(current_swipes, restored_swipes);

  const patch: ChatMessagePatch = {
    message_id: state.message.message_id,
    data: withPersistentBackupData(state.message.data, null),
  };

  if (state.backup && has_message_diff) patch.message = state.backup.message;
  if (state.backup && has_swipes_diff && restored_swipes) patch.swipes = restored_swipes;

  return patch;
}

function buildSyncPersistentMessagePatch(
  state: MessageState,
  settings: Settings,
  matcher: CompiledMatcher | null = buildContentMatcher(settings),
): ChatMessagePatch | null {
  if (!shouldPersistentlyReplaceMessage(state)) {
    return buildClearPersistentMessageBackupPatch(state);
  }

  if (!settings.enabled || !settings.replace_message_content || !matcher) {
    return buildRestorePersistentMessagePatch(state, settings, matcher);
  }

  const current_swipes = state.swiped?.swipes?.slice();
  const original_message = state.backup?.message ?? state.message.message ?? '';
  const original_swipes = state.swiped
    ? reconcileOriginalSwipes(state.backup?.swipes, current_swipes, matcher)
    : undefined;

  const next_message = replaceTextContentByMatcher(original_message, matcher);
  const next_swipes = original_swipes?.map(swipe => replaceTextContentByMatcher(swipe, matcher));

  const has_message_diff = next_message !== (state.message.message ?? '');
  const has_swipes_diff =
    current_swipes !== undefined && next_swipes !== undefined && !areStringArraysEqual(next_swipes, current_swipes);

  let next_backup = state.backup;
  if (!next_backup && (has_message_diff || has_swipes_diff)) {
    next_backup = {
      message: state.message.message ?? '',
      swipes: current_swipes?.slice(),
    };
  } else if (next_backup && !areStringArraysEqual(next_backup.swipes, original_swipes)) {
    next_backup = {
      ...next_backup,
      swipes: original_swipes,
    };
  }

  const should_update_data =
    state.hasStoredBackup !== (next_backup !== null) || !isSameBackup(state.backup, next_backup);
  if (!has_message_diff && !has_swipes_diff && !should_update_data) return null;

  const patch: ChatMessagePatch = { message_id: state.message.message_id };
  if (has_message_diff) patch.message = next_message;
  if (has_swipes_diff && next_swipes) patch.swipes = next_swipes;
  if (should_update_data) patch.data = withPersistentBackupData(state.message.data, next_backup);
  return patch;
}

async function writePersistentMessagePatches(patches: Array<ChatMessagePatch | null>): Promise<ChatMessagePatch[]> {
  const validPatches = patches.filter((patch): patch is ChatMessagePatch => patch !== null);
  if (validPatches.length === 0) return [];

  // 正文数据一次性写回且不触发楼层重绘；可见楼层由调用方在最后统一更新显示层。
  await setChatMessages(validPatches, { refresh: 'none' });
  return validPatches;
}

async function syncPersistentMessageContent(
  message_id: number,
  settings: Settings,
  matcher: CompiledMatcher | null = buildContentMatcher(settings),
): Promise<ChatMessagePatch[]> {
  if (!isValidMessageId(message_id)) return [];

  const state = getMessageState(message_id);
  if (!state) return [];

  return await writePersistentMessagePatches([buildSyncPersistentMessagePatch(state, settings, matcher)]);
}

async function restorePersistentMessageContent(
  message_id: number,
  settings: Settings,
  matcher: CompiledMatcher | null = buildContentMatcher(settings),
): Promise<ChatMessagePatch[]> {
  if (!isValidMessageId(message_id)) return [];

  const state = getMessageState(message_id);
  if (!state) return [];

  return await writePersistentMessagePatches([buildRestorePersistentMessagePatch(state, settings, matcher)]);
}

async function syncAllPersistentMessageContent(settings: Settings): Promise<ChatMessagePatch[]> {
  const matcher = buildContentMatcher(settings);
  if (!matcher) {
    return await restoreAllPersistentMessageContent(settings, matcher);
  }

  const patches = getAllMessageStates().map(state => buildSyncPersistentMessagePatch(state, settings, matcher));
  return await writePersistentMessagePatches(patches);
}

async function restoreAllPersistentMessageContent(
  settings: Settings,
  matcher: CompiledMatcher | null = buildContentMatcher(settings),
): Promise<ChatMessagePatch[]> {
  const patches = getAllMessageStates().map(state => buildRestorePersistentMessagePatch(state, settings, matcher));
  return await writePersistentMessagePatches(patches);
}

function doesPatchChangeDisplayedContent(patch: ChatMessagePatch): boolean {
  return patch.message !== undefined || patch.swipes !== undefined;
}

function buildSettingsOverlay(
  getSettings: () => Settings,
  setSettings: (next: Settings) => void,
  afterSave: () => void,
): { open: () => void; destroy: () => void } {
  const p$ = (window.parent as any).$ ?? $;
  const pDoc = window.parent?.document ?? document;
  const pWin = window.parent ?? window;

  const root = pDoc.createElement('div');
  const rootClass = `TH-user-name-replace-root-${getScriptId()}`;
  root.className = rootClass;
  pDoc.body.appendChild(root);

  const $root = p$(root);
  const $toastStyle = p$('<style>').text('#toast-container{z-index:2147483647!important;}').appendTo(pDoc.head);
  const $layoutStyle = p$('<style>')
    .text(
      `
.${rootClass} .TH-user-name-replace-overlay {
  position: fixed !important;
  left: 0 !important;
  top: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  height: 100dvh !important;
  z-index: 2147483600 !important;
  display: none !important;
  align-items: center !important;
  justify-content: center !important;
  overflow: auto !important;
  box-sizing: border-box !important;
  padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)) !important;
  overscroll-behavior: contain !important;
  -webkit-overflow-scrolling: touch !important;
}
.${rootClass} .TH-user-name-replace-overlay.TH-user-name-replace-open {
  display: flex !important;
}
.${rootClass} .TH-user-name-replace-modal {
  position: relative !important;
  left: auto !important;
  top: auto !important;
  right: auto !important;
  bottom: auto !important;
  transform: none !important;
  margin: 0 !important;
  flex: 0 1 auto !important;
  width: min(1120px, calc(100vw - 32px)) !important;
  max-width: calc(100vw - 32px) !important;
  max-height: calc(100dvh - 24px) !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}
.${rootClass} .TH-user-name-replace-modal-body {
  min-height: 0 !important;
  overflow: auto !important;
  overflow-x: hidden !important;
  max-width: 100% !important;
  -webkit-overflow-scrolling: touch !important;
}
.${rootClass} .TH-user-name-settings-overview {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 12px !important;
  align-items: stretch !important;
}
.${rootClass} .TH-user-name-settings-overview > .TH-user-name-settings-section {
  height: 100% !important;
  align-content: start !important;
}
.${rootClass} .TH-user-name-settings-section-wide {
  grid-column: 1 / -1 !important;
}
.${rootClass} .TH-user-name-settings-section-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 10px !important;
  width: 100% !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  color: inherit !important;
  text-align: left !important;
  cursor: default !important;
}
.${rootClass} .TH-user-name-settings-section-title {
  display: flex !important;
  align-items: center !important;
  gap: 7px !important;
  min-width: 0 !important;
  font-size: 14px !important;
  font-weight: 700 !important;
}
.${rootClass} .TH-user-name-settings-section-chevron {
  display: none !important;
  transition: transform .18s ease !important;
}
.${rootClass} .TH-user-name-settings-section.is-collapsible > .TH-user-name-settings-section-header {
  cursor: pointer !important;
}
.${rootClass} .TH-user-name-settings-section.is-collapsible > .TH-user-name-settings-section-header .TH-user-name-settings-section-chevron {
  display: inline-block !important;
}
.${rootClass} .TH-user-name-settings-section.is-collapsed > .TH-user-name-settings-section-content {
  display: none !important;
}
.${rootClass} .TH-user-name-settings-section.is-collapsed > .TH-user-name-settings-section-header .TH-user-name-settings-section-chevron {
  transform: rotate(-90deg) !important;
}
.${rootClass} .TH-user-name-settings-section-content {
  display: grid !important;
  gap: 9px !important;
  min-width: 0 !important;
  align-content: start !important;
}
.${rootClass} .TH-user-name-settings-floating .TH-user-name-settings-section-content {
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  align-items: stretch !important;
  gap: 10px !important;
}
.${rootClass} .TH-user-name-floating-group {
  display: grid !important;
  align-content: start !important;
  gap: 8px !important;
  min-width: 0 !important;
  padding: 10px 12px !important;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent) !important;
  border-radius: 12px !important;
}
.${rootClass} .TH-user-name-floating-group-title {
  font-size: 12px !important;
  font-weight: 700 !important;
  line-height: 1.4 !important;
}
.${rootClass} .TH-user-name-theme-custom {
  padding: 10px !important;
  gap: 8px !important;
  box-shadow: none !important;
}
.${rootClass} .TH-user-name-theme-toolbar {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) !important;
  gap: 8px !important;
}
.${rootClass} .TH-user-name-theme-toolbar-actions {
  display: grid !important;
  grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
  gap: 6px !important;
}
.${rootClass} .TH-user-name-theme-toolbar-actions button,
.${rootClass} .TH-user-name-custom-toolbar-actions button {
  min-height: 38px !important;
  min-width: 0 !important;
  width: 100% !important;
  padding: 7px 8px !important;
  white-space: nowrap !important;
}
.${rootClass} .TH-user-name-settings-footer {
  display: flex !important;
  justify-content: flex-end !important;
  align-items: center !important;
  gap: 10px !important;
  flex: 0 0 auto !important;
  padding: 12px 2px 0 !important;
}
.${rootClass} .TH-user-name-custom-toolbar {
  display: grid !important;
  grid-template-columns: minmax(180px, 280px) minmax(0, 1fr) !important;
  gap: 8px 12px !important;
  align-items: center !important;
}
.${rootClass} .TH-user-name-custom-toolbar-actions {
  display: grid !important;
  grid-template-columns: repeat(5, minmax(76px, 1fr)) !important;
  gap: 6px !important;
  align-items: center !important;
}
.${rootClass} .TH-user-name-custom-rule-toolbar {
  display: block !important;
  padding-top: 2px !important;
}
.${rootClass} .TH-user-name-custom-add-rule-row {
  display: flex !important;
  justify-content: flex-start !important;
  padding-top: 2px !important;
}
.${rootClass} .TH-user-name-custom-add-rule-row button {
  min-width: 150px !important;
  min-height: 38px !important;
}
.${rootClass} .TH-user-name-custom-table-header {
  position: sticky !important;
  top: 0 !important;
  z-index: 2 !important;
  padding: 8px 6px !important;
}
.${rootClass} .TH-user-name-custom-rule-row {
  padding: 7px 6px !important;
  border-top: 1px solid color-mix(in srgb, currentColor 13%, transparent) !important;
}
.${rootClass} .TH-user-name-custom-field {
  display: grid !important;
  min-width: 0 !important;
}
.${rootClass} .TH-user-name-custom-mobile-label {
  display: none !important;
}
.${rootClass} .TH-user-name-custom-input {
  width: 100% !important;
  min-width: 0 !important;
  min-height: 40px !important;
  max-height: 112px !important;
  resize: none !important;
  overflow: auto !important;
  line-height: 1.45 !important;
  white-space: pre-wrap !important;
  overflow-wrap: anywhere !important;
}
.${rootClass} .TH-user-name-replace-modal-body > *,
.${rootClass} .TH-user-name-replace-help-modal,
.${rootClass} .TH-user-name-custom-table-wrap {
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
}
.${rootClass} .TH-user-name-replace-help-overlay {
  width: 100vw !important;
  height: 100vh !important;
  height: 100dvh !important;
  overflow: auto !important;
  box-sizing: border-box !important;
  overscroll-behavior: contain !important;
  -webkit-overflow-scrolling: touch !important;
}
.${rootClass} .TH-user-name-replace-help-modal {
  width: min(560px, 100%) !important;
  max-width: 100% !important;
  max-height: 100% !important;
  overflow: auto !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}
@media (max-width: 900px) {
  .${rootClass} .TH-user-name-replace-modal {
    width: min(760px, calc(100vw - 24px)) !important;
    max-width: calc(100vw - 24px) !important;
  }
  .${rootClass} .TH-user-name-settings-overview {
    grid-template-columns: minmax(0, 1fr) !important;
  }
  .${rootClass} .TH-user-name-settings-section-wide {
    grid-column: auto !important;
  }
  .${rootClass} .TH-user-name-settings-floating .TH-user-name-settings-section-content {
    grid-template-columns: minmax(0, 1fr) !important;
  }
  .${rootClass} .TH-user-name-theme-toolbar-actions {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }
  .${rootClass} .TH-user-name-custom-toolbar {
    grid-template-columns: minmax(0, 1fr) !important;
  }
  .${rootClass} .TH-user-name-custom-toolbar-actions {
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
  }
}
@media (max-width: 720px) {
  .${rootClass} .TH-user-name-replace-overlay,
  .${rootClass} .TH-user-name-replace-help-overlay {
    align-items: flex-start !important;
    padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)) !important;
  }
  .${rootClass} .TH-user-name-replace-modal {
    width: 100% !important;
    max-width: 100% !important;
    max-height: 100% !important;
    border-radius: 16px !important;
    padding: 12px 10px 10px !important;
  }
  .${rootClass} .TH-user-name-replace-modal-body {
    gap: 8px !important;
  }
  .${rootClass} .TH-user-name-settings-section-chevron {
    display: inline-block !important;
  }
  .${rootClass} .TH-user-name-settings-section-header {
    cursor: pointer !important;
  }
  .${rootClass} .TH-user-name-settings-section.is-mobile-collapsed .TH-user-name-settings-section-content {
    display: none !important;
  }
  .${rootClass} .TH-user-name-settings-section.is-mobile-collapsed .TH-user-name-settings-section-chevron {
    transform: rotate(-90deg) !important;
  }
  .${rootClass} .TH-user-name-settings-floating .TH-user-name-settings-section-content {
    grid-template-columns: minmax(0, 1fr) !important;
  }
  .${rootClass} .TH-user-name-settings-footer {
    padding-top: 9px !important;
  }
  .${rootClass} .TH-user-name-settings-footer button {
    flex: 1 1 0 !important;
  }
  .${rootClass} .TH-user-name-custom-toolbar {
    grid-template-columns: minmax(0, 1fr) !important;
  }
  .${rootClass} .TH-user-name-custom-toolbar-actions {
    grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
    width: 100% !important;
  }
  .${rootClass} .TH-user-name-custom-toolbar-actions button {
    grid-column: span 2 !important;
  }
  .${rootClass} .TH-user-name-custom-toolbar-actions button:nth-child(4) {
    grid-column: 2 / span 2 !important;
  }
  .${rootClass} .TH-user-name-custom-rule-count {
    padding: 2px 4px !important;
  }
  .${rootClass} .TH-user-name-custom-add-rule-row {
    width: 100% !important;
  }
  .${rootClass} .TH-user-name-custom-add-rule {
    width: 100% !important;
  }
  .${rootClass} .TH-user-name-theme-toolbar-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
  .${rootClass} .TH-user-name-theme-palette-toggle {
    width: 100% !important;
  }
  .${rootClass} .TH-user-name-custom-table-wrap {
    overflow: visible !important;
  }
  .${rootClass} .TH-user-name-custom-table-header {
    display: none !important;
  }
  .${rootClass} .TH-user-name-custom-rule-row {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto auto !important;
    gap: 7px 9px !important;
    min-width: 0 !important;
    padding: 9px !important;
    border: 1px solid color-mix(in srgb, currentColor 16%, transparent) !important;
    border-radius: 13px !important;
  }
  .${rootClass} .TH-user-name-custom-field {
    grid-column: 1 / -1 !important;
    gap: 4px !important;
  }
  .${rootClass} .TH-user-name-custom-mobile-label {
    display: block !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    opacity: .72 !important;
  }
  .${rootClass} .TH-user-name-custom-enabled-cell {
    justify-self: start !important;
    gap: 6px !important;
  }
  .${rootClass} .TH-user-name-custom-blur-cell {
    grid-column: 2 !important;
    justify-self: end !important;
    justify-content: flex-end !important;
    gap: 6px !important;
  }
  .${rootClass} .TH-user-name-custom-rule-row > .TH-user-name-custom-flat-button:last-child {
    grid-column: 3 !important;
    justify-self: end !important;
  }
  .${rootClass} .TH-user-name-custom-enabled-cell .TH-user-name-custom-mobile-label,
  .${rootClass} .TH-user-name-custom-blur-cell .TH-user-name-custom-mobile-label {
    display: inline !important;
  }
  .${rootClass} .TH-user-name-custom-input {
    min-height: 38px !important;
    max-height: 96px !important;
  }
  .${rootClass} .TH-user-name-replace-help-modal {
    width: 100% !important;
    max-height: 100% !important;
    padding: 14px 12px !important;
  }
}
@supports not (height: 100dvh) {
  .${rootClass} .TH-user-name-replace-modal {
    max-height: calc(100vh - 28px) !important;
  }
  .${rootClass} .TH-user-name-replace-help-overlay {
    height: 100vh !important;
  }
}
`,
    )
    .appendTo(pDoc.head);
  const $priorityStyle = p$('<style>').appendTo(pDoc.head);
  const themedSections: any[] = [];
  const themedMetaTexts: any[] = [];
  const themedInputs: any[] = [];
  const flatButtons: any[] = [];
  const registerSection = ($el: any) => {
    themedSections.push($el);
    return $el;
  };

  const registerMeta = (text: string, $container: any) => {
    const $el = p$('<div>').text(text).css({ 'font-size': '12px', 'line-height': '1.6' }).appendTo($container);
    themedMetaTexts.push($el);
    return $el;
  };

  const registerInput = ($el: any) => {
    themedInputs.push($el);
    return $el;
  };

  const registerFlatButton = ($el: any) => {
    flatButtons.push($el);
    return $el;
  };

  const overlayStyle: Partial<CSSStyleDeclaration> = {
    position: 'fixed',
    left: '0',
    top: '0',
    right: '0',
    bottom: '0',
    width: '100vw',
    height: '100dvh',
    zIndex: '2147483600',
    display: 'none',
    background: 'transparent',
    boxSizing: 'border-box',
  };

  const modalStyle: Partial<CSSStyleDeclaration> = {
    width: 'min(1120px, calc(100vw - 32px))',
    maxWidth: 'calc(100vw - 32px)',
    margin: '0',
    borderRadius: '24px',
    padding: '18px 18px 16px',
    maxHeight: 'calc(100dvh - 24px)',
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
  };

  const inputStyle: Partial<CSSStyleDeclaration> = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '12px',
    border: '1px solid transparent',
    outline: 'none',
  };

  const btnStyle: Partial<CSSStyleDeclaration> = {
    padding: '8px 12px',
    borderRadius: '12px',
    border: '1px solid transparent',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  };

  const sectionStyle: Partial<CSSStyleDeclaration> = {
    borderRadius: '18px',
    padding: '12px 14px',
    display: 'grid',
    gap: '8px',
  };

  const createSettingsSection = (
    title: string,
    $container: any,
    options: {
      wide?: boolean;
      mobileCollapsed?: boolean;
      collapsible?: boolean;
      defaultCollapsed?: boolean;
      className?: string;
    } = {},
  ): { $section: any; $content: any } => {
    const $section = registerSection(
      p$('<section>')
        .addClass('TH-user-name-settings-section')
        .addClass(options.wide ? 'TH-user-name-settings-section-wide' : '')
        .addClass(options.mobileCollapsed ? 'is-mobile-collapsed' : '')
        .addClass(options.collapsible ? 'is-collapsible' : '')
        .addClass(options.collapsible && options.defaultCollapsed ? 'is-collapsed' : '')
        .addClass(options.className ?? '')
        .css(sectionStyle)
        .appendTo($container),
    );
    const $sectionHeader = p$('<div role="button" tabindex="0">')
      .addClass('TH-user-name-settings-section-header')
      .appendTo($section);
    p$('<span>').addClass('TH-user-name-settings-section-title').text(title).appendTo($sectionHeader);
    p$('<span aria-hidden="true">')
      .addClass('TH-user-name-settings-section-chevron')
      .text('⌄')
      .appendTo($sectionHeader);
    const $content = p$('<div>').addClass('TH-user-name-settings-section-content').appendTo($section);
    const toggleSection = (): boolean => {
      if (options.collapsible) {
        $section.toggleClass('is-collapsed');
        return true;
      }
      if (!pWin.matchMedia('(max-width: 720px)').matches) return false;
      $section.toggleClass('is-mobile-collapsed');
      return true;
    };
    $sectionHeader.on('click', toggleSection);
    $sectionHeader.on('keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (!toggleSection()) return;
      event.preventDefault();
    });
    return { $section, $content };
  };

  const $overlay = p$('<div>').addClass('TH-user-name-replace-overlay').css(overlayStyle).appendTo($root);
  const $modal = p$('<div>').addClass('TH-user-name-replace-modal').css(modalStyle).appendTo($overlay);

  const $header = p$('<div>')
    .css({
      display: 'flex',
      'justify-content': 'space-between',
      'align-items': 'flex-start',
      gap: '12px',
      'padding-bottom': '10px',
      'margin-bottom': '2px',
    })
    .appendTo($modal);

  const $headerText = p$('<div>')
    .css({ display: 'flex', gap: '7px', 'align-items': 'center', 'min-width': '0' })
    .appendTo($header);
  const $title = p$('<div>')
    .text('替换设置')
    .css({ 'font-size': '18px', 'font-weight': '700', 'letter-spacing': '0.04em' })
    .appendTo($headerText);
  const $btnHelp = registerFlatButton(
    p$('<button type="button" aria-label="使用帮助" title="使用帮助">')
      .text('?')
      .css({
        ...btnStyle,
        width: '26px',
        height: '26px',
        padding: '0',
        'border-radius': '999px',
        'font-size': '14px',
        'font-weight': '700',
        'line-height': '24px',
        flex: '0 0 auto',
      })
      .appendTo($headerText),
  );
  const $btnClose = registerFlatButton(p$('<button type="button">').text('关闭').css(btnStyle).appendTo($header));

  const $body = p$('<div>')
    .addClass('TH-user-name-replace-modal-body')
    .css({ display: 'grid', gap: '12px', minHeight: '0', overflow: 'auto', WebkitOverflowScrolling: 'touch' })
    .appendTo($modal);

  const $helpOverlay = p$('<div>')
    .addClass('TH-user-name-replace-help-overlay')
    .css({
      position: 'fixed',
      inset: '0',
      display: 'none',
      'align-items': 'center',
      'justify-content': 'center',
      padding:
        'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))',
      background: 'rgba(0, 0, 0, 0.28)',
      'z-index': '2147483602',
      'box-sizing': 'border-box',
    })
    .appendTo($root);
  const $helpModal = registerSection(
    p$('<div>')
      .addClass('TH-user-name-replace-help-modal')
      .css({
        ...sectionStyle,
        width: 'min(560px, calc(100vw - 28px))',
        'max-width': 'calc(100vw - 28px)',
        'max-height': 'calc(100dvh - 28px)',
        overflow: 'auto',
        padding: '16px',
        'font-family': '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
        '-webkit-overflow-scrolling': 'touch',
      })
      .appendTo($helpOverlay),
  );
  const $helpHeader = p$('<div>')
    .css({ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '12px' })
    .appendTo($helpModal);
  p$('<div>').text('使用帮助').css({ 'font-size': '17px', 'font-weight': '700' }).appendTo($helpHeader);
  const $btnHelpClose = registerFlatButton(
    p$('<button type="button">').text('知道了').css(btnStyle).appendTo($helpHeader),
  );

  p$('<div>').text('显示替换').css({ 'font-weight': '700', 'margin-top': '2px' }).appendTo($helpModal);
  registerMeta('未开启“同步替换正文内容”时，只改变聊天页面的显示，不会修改聊天记录或发送给模型的提示词。', $helpModal);
  registerMeta('纯显示替换也会应用到正则美化生成的同源状态栏，只遮盖状态栏里的显示文字。', $helpModal);
  registerMeta('名字输入可用 ,、，、、、;、；、/ 或换行分隔多个词；替换项留空时，对应名字会从显示中消失。', $helpModal);
  registerMeta(
    '替换项支持安全的行内格式：*斜体*、**粗体**、***粗斜体***、`代码` 或 <code>代码</code>。其他 HTML 会按普通文字显示。',
    $helpModal,
  );
  registerMeta('代码样式、代码块和独立的思维/推理内容区域中的名字也会参与显示替换。', $helpModal);
  registerMeta('每条规则的“模糊”是独立显示效果，可与文字格式、图片组合使用，不会把模糊样式写进聊天正文。', $helpModal);
  registerMeta(
    '“遮盖消息标题名字”默认关闭；开启后只替换楼层顶部的用户名或角色名，不影响日期和标题栏按钮。',
    $helpModal,
  );
  registerMeta(
    '“替换回声小剧场”默认关闭；开启后只处理小剧场的角色标题和正文，不会修改工具栏、筛选器等控件。',
    $helpModal,
  );

  p$('<div>').text('正文同步替换').css({ 'font-weight': '700', 'margin-top': '4px' }).appendTo($helpModal);
  const $contentSyncWarning = p$('<div>')
    .text('正文替换会直接写回聊天记录，因此会改变发送给模型的提示词。')
    .css({ 'font-size': '13px', 'font-weight': '700', 'line-height': '1.7' })
    .appendTo($helpModal);
  themedMetaTexts.push($contentSyncWarning);
  registerMeta('主要使用场景：', $helpModal);
  const $contentSyncCases = p$('<ol>')
    .css({ margin: '0', padding: '0 0 0 22px', display: 'grid', gap: '7px', 'font-size': '12px', 'line-height': '1.7' })
    .appendTo($helpModal);
  p$('<li>')
    .text('需要让某些词不发送给模型，例如去八股；这种情况最好关闭 {{user}} 和 {{char}} 的名字替换。')
    .appendTo($contentSyncCases);
  p$('<li>').text('需要 Repo 状态栏，用于替换状态栏里的名字。').appendTo($contentSyncCases);
  themedMetaTexts.push($contentSyncCases);
  registerMeta(
    '离开当前聊天或卸载脚本时，正文同步会自动关闭，并尝试恢复原文。（为了防止意外退出导致全文变更）',
    $helpModal,
  );

  p$('<div>').text('悬浮窗').css({ 'font-weight': '700', 'margin-top': '4px' }).appendTo($helpModal);
  registerMeta('关闭悬浮窗后，仍可前往酒馆助手的脚本设置，点击“替换设置”按钮重新打开本设置页。', $helpModal);
  registerMeta(
    '在设置中开启“显示‘同步正文替换’快捷开关”后，悬浮控件会增加一个同步开关；橙色表示正在同步替换正文。',
    $helpModal,
  );

  const $overviewGrid = p$('<div>').addClass('TH-user-name-settings-overview').appendTo($body);
  const { $content: $globalSec } = createSettingsSection('◉ 全局', $overviewGrid);
  const { $content: $appearanceSec } = createSettingsSection('◈ 颜色与外观', $overviewGrid, {
    mobileCollapsed: true,
  });
  const { $content: $floatingSec } = createSettingsSection('◇ 悬浮控件', $overviewGrid, {
    wide: true,
    collapsible: true,
    defaultCollapsed: true,
    className: 'TH-user-name-settings-floating',
  });

  const $enabledRow = p$('<label>').css({ display: 'flex', gap: '8px', 'align-items': 'center' }).appendTo($globalSec);
  const $enabled = p$('<input type="checkbox">').appendTo($enabledRow);
  p$('<span>').text('启用名称替换').appendTo($enabledRow);

  const $contentReplaceRow = p$('<label>')
    .css({ display: 'flex', gap: '8px', 'align-items': 'center' })
    .appendTo($globalSec);
  const $contentReplace = p$('<input type="checkbox">').appendTo($contentReplaceRow);
  p$('<span>').text('同步替换正文内容').appendTo($contentReplaceRow);

  const $headerNamesRow = p$('<label>')
    .css({ display: 'flex', gap: '8px', 'align-items': 'center' })
    .appendTo($globalSec);
  const $headerNames = p$('<input type="checkbox">').appendTo($headerNamesRow);
  p$('<span>').text('遮盖消息标题名字').appendTo($headerNamesRow);

  const $echoTheaterRow = p$('<label>')
    .css({ display: 'flex', gap: '8px', 'align-items': 'center' })
    .appendTo($globalSec);
  const $echoTheater = p$('<input type="checkbox">').appendTo($echoTheaterRow);
  p$('<span>').text('替换回声小剧场').appendTo($echoTheaterRow);

  registerMeta('替换显示模式', $globalSec);
  const displayModeGroupName = `th_user_name_replace_display_mode_${getScriptId()}`;
  const $displayModeRow = p$('<div>')
    .css({ display: 'flex', gap: '14px', 'align-items': 'center', 'flex-wrap': 'wrap' })
    .appendTo($globalSec);
  const $displayTextOnlyRow = p$('<label>')
    .css({ display: 'flex', gap: '6px', 'align-items': 'center' })
    .appendTo($displayModeRow);
  const $displayTextOnly = p$(`<input type="radio" name="${displayModeGroupName}" value="text_only">`).appendTo(
    $displayTextOnlyRow,
  );
  p$('<span>').text('仅文字').appendTo($displayTextOnlyRow);
  const $displayImageOnlyRow = p$('<label>')
    .css({ display: 'flex', gap: '6px', 'align-items': 'center' })
    .appendTo($displayModeRow);
  const $displayImageOnly = p$(`<input type="radio" name="${displayModeGroupName}" value="image_only">`).appendTo(
    $displayImageOnlyRow,
  );
  p$('<span>').text('仅图片').appendTo($displayImageOnlyRow);
  const $displayImageAndTextRow = p$('<label>')
    .css({ display: 'flex', gap: '6px', 'align-items': 'center' })
    .appendTo($displayModeRow);
  const $displayImageAndText = p$(
    `<input type="radio" name="${displayModeGroupName}" value="image_and_text">`,
  ).appendTo($displayImageAndTextRow);
  p$('<span>').text('图片+文字').appendTo($displayImageAndTextRow);

  registerMeta('颜色模板', $appearanceSec);
  const $themeSelect = registerInput(p$('<select>').css(inputStyle).appendTo($appearanceSec));
  THEME_PRESETS.forEach(theme => {
    p$('<option>').val(theme.key).text(theme.label).appendTo($themeSelect);
  });
  p$('<option>').val('tavern').text('自适应配色').appendTo($themeSelect);
  p$('<option>').val('custom').text('自定义颜色').appendTo($themeSelect);

  const $customThemeSec = registerSection(
    p$('<div>')
      .addClass('TH-user-name-theme-custom')
      .css({ ...sectionStyle, display: 'none' })
      .appendTo($appearanceSec),
  );
  p$('<div>').text('自定义颜色').css({ 'font-weight': '700' }).appendTo($customThemeSec);

  const $themeToolbar = p$('<div>')
    .addClass('TH-user-name-theme-toolbar')
    .css({ display: 'flex', gap: '8px', 'align-items': 'center', 'flex-wrap': 'wrap' })
    .appendTo($customThemeSec);
  const $themeProfileSelect = registerInput(
    p$('<select>')
      .css({ ...inputStyle, width: '100%' })
      .appendTo($themeToolbar),
  );
  const $themeToolbarActions = p$('<div>').addClass('TH-user-name-theme-toolbar-actions').appendTo($themeToolbar);
  const $btnAddThemeProfile = registerFlatButton(
    p$('<button type="button">').text('＋ 新建').css(btnStyle).appendTo($themeToolbarActions),
  );
  const $btnRenameThemeProfile = registerFlatButton(
    p$('<button type="button">').text('重命名').css(btnStyle).appendTo($themeToolbarActions),
  );
  const $btnDeleteThemeProfile = registerFlatButton(
    p$('<button type="button">').text('删除').css(btnStyle).appendTo($themeToolbarActions),
  );
  const $btnImportTheme = registerFlatButton(
    p$('<button type="button">').text('导入').css(btnStyle).appendTo($themeToolbarActions),
  );
  const $btnExportTheme = registerFlatButton(
    p$('<button type="button">').text('导出').css(btnStyle).appendTo($themeToolbarActions),
  );
  const $themeImportFile = p$('<input type="file" accept="application/json,.json">')
    .css({ display: 'none' })
    .appendTo($customThemeSec);

  const $btnToggleThemePalette = registerFlatButton(
    p$('<button type="button">')
      .addClass('TH-user-name-theme-palette-toggle')
      .text('编辑色板')
      .css({ ...btnStyle, justifySelf: 'start' })
      .appendTo($customThemeSec),
  );

  const $customThemeGrid = p$('<div>')
    .css({ display: 'none', gap: '10px', 'grid-template-columns': 'repeat(auto-fit, minmax(180px, 1fr))' })
    .appendTo($customThemeSec);

  const customThemeFields: Array<{ key: keyof ThemeCustomColors; label: string }> = [
    { key: 'bgPaper', label: '纸张底色' },
    { key: 'bgPaperDark', label: '渐变深色' },
    { key: 'noteBg', label: '便签底色' },
    { key: 'textMain', label: '主文字色' },
    { key: 'textSub', label: '副文字色' },
    { key: 'accentColor', label: '强调色' },
    { key: 'btnBg', label: '按钮底色' },
    { key: 'btnHover', label: '按钮悬停色' },
  ];
  const customThemeInputs = {} as Record<keyof ThemeCustomColors, any>;

  customThemeFields.forEach(field => {
    const $field = p$('<label>').css({ display: 'grid', gap: '6px' }).appendTo($customThemeGrid);
    p$('<span>').text(field.label).css({ 'font-size': '12px' }).appendTo($field);
    customThemeInputs[field.key] = registerInput(
      p$('<input type="color">')
        .css({
          ...inputStyle,
          padding: '4px',
          height: '42px',
          'min-width': '0',
        })
        .appendTo($field),
    );
  });

  const layoutGroupName = `th_user_name_replace_layout_${getScriptId()}`;
  const $layoutRow = p$('<div>')
    .css({ display: 'none', gap: '14px', 'align-items': 'center', 'flex-wrap': 'wrap' })
    .appendTo($floatingSec);
  const $layoutVerticalRow = p$('<label>')
    .css({ display: 'flex', gap: '6px', 'align-items': 'center' })
    .appendTo($layoutRow);
  const $layoutVertical = p$(`<input type="radio" name="${layoutGroupName}" value="vertical">`).appendTo(
    $layoutVerticalRow,
  );
  p$('<span>').text('竖排').appendTo($layoutVerticalRow);
  const $layoutHorizontalRow = p$('<label>')
    .css({ display: 'flex', gap: '6px', 'align-items': 'center' })
    .appendTo($layoutRow);
  const $layoutHorizontal = p$(`<input type="radio" name="${layoutGroupName}" value="horizontal">`).appendTo(
    $layoutHorizontalRow,
  );
  p$('<span>').text('横排').appendTo($layoutHorizontalRow);

  const $collapseVisibleRow = p$('<label>')
    .css({ display: 'none', gap: '8px', 'align-items': 'center' })
    .appendTo($floatingSec);
  const $collapseVisible = p$('<input type="checkbox">').appendTo($collapseVisibleRow);
  p$('<span>').text('旧版折叠按钮').appendTo($collapseVisibleRow);

  const $floatingToggleGroup = p$('<div>').addClass('TH-user-name-floating-group').appendTo($floatingSec);
  registerMeta('显示内容', $floatingToggleGroup).addClass('TH-user-name-floating-group-title');
  const $fabEnabledRow = p$('<label>')
    .css({ display: 'flex', gap: '8px', 'align-items': 'center' })
    .appendTo($floatingToggleGroup);
  const $fabEnabled = p$('<input type="checkbox">').appendTo($fabEnabledRow);
  p$('<span>').text('显示悬浮窗').appendTo($fabEnabledRow);

  const $fabContentSyncVisibleRow = p$('<label>')
    .css({ display: 'flex', gap: '8px', 'align-items': 'center' })
    .appendTo($floatingToggleGroup);
  const $fabContentSyncVisible = p$('<input type="checkbox">').appendTo($fabContentSyncVisibleRow);
  p$('<span>').text('显示“同步正文替换”快捷开关').appendTo($fabContentSyncVisibleRow);

  const $floatingPositionGroup = p$('<div>').addClass('TH-user-name-floating-group').appendTo($floatingSec);
  registerMeta('悬浮控件位置', $floatingPositionGroup).addClass('TH-user-name-floating-group-title');
  const dockSideGroupName = `th_user_name_replace_dock_side_${getScriptId()}`;
  const $dockSideRow = p$('<div>')
    .css({ display: 'flex', gap: '14px', 'align-items': 'center', 'flex-wrap': 'wrap' })
    .appendTo($floatingPositionGroup);
  const $dockLeftRow = p$('<label>')
    .css({ display: 'flex', gap: '6px', 'align-items': 'center' })
    .appendTo($dockSideRow);
  const $dockLeft = p$(`<input type="radio" name="${dockSideGroupName}" value="left">`).appendTo($dockLeftRow);
  p$('<span>').text('左侧').appendTo($dockLeftRow);
  const $dockRightRow = p$('<label>')
    .css({ display: 'flex', gap: '6px', 'align-items': 'center' })
    .appendTo($dockSideRow);
  const $dockRight = p$(`<input type="radio" name="${dockSideGroupName}" value="right">`).appendTo($dockRightRow);
  p$('<span>').text('右侧').appendTo($dockRightRow);

  const $compactDockRow = p$('<label>')
    .css({ display: 'none', gap: '8px', 'align-items': 'center' })
    .appendTo($floatingSec);
  const $compactDock = p$('<input type="checkbox">').appendTo($compactDockRow);
  p$('<span>').text('使用贴边小按钮模式').appendTo($compactDockRow);

  const $settingsActions = p$('<div>')
    .addClass('TH-user-name-settings-footer')
    .css({
      display: 'flex',
      gap: '10px',
      'justify-content': 'flex-end',
      'align-items': 'center',
      'padding-top': '4px',
    })
    .appendTo($modal);
  const $btnCancel = registerFlatButton(
    p$('<button type="button">').text('取消').css(btnStyle).appendTo($settingsActions),
  );
  const $btnSave = p$('<button type="button">')
    .text('保存')
    .css({ ...btnStyle, 'font-weight': '700' })
    .appendTo($settingsActions);

  const { $content: $customSec } = createSettingsSection('▦ 配置替换', $body, { collapsible: true });

  const $customToolbar = p$('<div>')
    .addClass('TH-user-name-custom-toolbar')
    .css({ display: 'flex', gap: '8px', 'align-items': 'center', 'flex-wrap': 'wrap' })
    .appendTo($customSec);
  const $profileSelect = registerInput(
    p$('<select>')
      .css({ ...inputStyle, width: 'min(260px, 100%)', flex: '1 1 180px' })
      .appendTo($customToolbar),
  );
  const $customToolbarActions = p$('<div>').addClass('TH-user-name-custom-toolbar-actions').appendTo($customToolbar);
  const $btnAddProfile = registerFlatButton(
    p$('<button type="button">').text('＋ 新建').css(btnStyle).appendTo($customToolbarActions),
  );
  const $btnRenameProfile = registerFlatButton(
    p$('<button type="button">').text('重命名').css(btnStyle).appendTo($customToolbarActions),
  );
  const $btnDeleteProfile = registerFlatButton(
    p$('<button type="button">').text('删除').css(btnStyle).appendTo($customToolbarActions),
  );
  const $btnImportCustom = registerFlatButton(
    p$('<button type="button">').text('导入').css(btnStyle).appendTo($customToolbarActions),
  );
  const $btnExportCustom = registerFlatButton(
    p$('<button type="button">').text('导出').css(btnStyle).appendTo($customToolbarActions),
  );
  const $customImportFile = p$('<input type="file" accept="application/json,.json">')
    .css({ display: 'none' })
    .appendTo($customSec);

  const $customRuleToolbar = p$('<div>').addClass('TH-user-name-custom-rule-toolbar').appendTo($customSec);
  const $ruleCount = p$('<span>')
    .addClass('TH-user-name-custom-rule-count')
    .css({ 'font-size': '12px', opacity: '0.72', alignSelf: 'center', padding: '0 4px' })
    .appendTo($customRuleToolbar);

  const $customTableWrap = p$('<div>')
    .addClass('TH-user-name-custom-table-wrap')
    .css({ overflow: 'visible', maxWidth: '100%', minWidth: '0' })
    .appendTo($customSec);
  const customGridStyle: Partial<CSSStyleDeclaration> = {
    display: 'grid',
    gridTemplateColumns: '52px repeat(3, minmax(0, 1fr)) 56px 48px',
    gap: '8px',
    alignItems: 'center',
    minWidth: '0',
  };
  p$('<div>')
    .addClass('TH-user-name-custom-table-header')
    .css({ ...customGridStyle, 'font-size': '12px', 'font-weight': '700', padding: '0 2px' })
    .append(p$('<div>').text('启用'))
    .append(p$('<div>').text('名字'))
    .append(p$('<div>').text('替换项'))
    .append(p$('<div>').text('图片 URL'))
    .append(p$('<div>').text('模糊'))
    .append(p$('<div>').text(''))
    .appendTo($customTableWrap);
  const $customRuleRows = p$('<div>').css({ display: 'grid', gap: '6px', marginTop: '6px' }).appendTo($customTableWrap);
  const $customAddRuleRow = p$('<div>').addClass('TH-user-name-custom-add-rule-row').appendTo($customSec);
  const $btnAddRule = registerFlatButton(
    p$('<button type="button">')
      .addClass('TH-user-name-custom-add-rule')
      .text('＋ 添加规则')
      .css(btnStyle)
      .appendTo($customAddRuleRow),
  );

  const readSelectedTheme = (): UiTheme => ($themeSelect.val() as UiTheme | undefined) ?? 'day';
  const readCustomThemeColors = (): ThemeCustomColors =>
    ThemeCustomColorsSchema.parse({
      bgPaper: String(customThemeInputs.bgPaper.val() ?? ''),
      bgPaperDark: String(customThemeInputs.bgPaperDark.val() ?? ''),
      textMain: String(customThemeInputs.textMain.val() ?? ''),
      textSub: String(customThemeInputs.textSub.val() ?? ''),
      accentColor: String(customThemeInputs.accentColor.val() ?? ''),
      noteBg: String(customThemeInputs.noteBg.val() ?? ''),
      btnBg: String(customThemeInputs.btnBg.val() ?? ''),
      btnHover: String(customThemeInputs.btnHover.val() ?? ''),
    });

  const writeCustomThemeColors = (colors: ThemeCustomColors) => {
    (Object.keys(customThemeInputs) as Array<keyof ThemeCustomColors>).forEach(key => {
      customThemeInputs[key].val(colors[key]);
    });
  };

  let customThemeProfileDrafts: CustomThemeProfile[] = [];
  let activeCustomThemeProfileId = DEFAULT_CUSTOM_THEME_PROFILE_ID;
  let customThemePaletteCollapsed = true;

  const getActiveThemeDraftProfile = (): CustomThemeProfile => {
    let profile = customThemeProfileDrafts.find(item => item.id === activeCustomThemeProfileId);
    if (profile) return profile;

    profile = customThemeProfileDrafts[0];
    if (profile) {
      activeCustomThemeProfileId = profile.id;
      return profile;
    }

    profile = {
      id: DEFAULT_CUSTOM_THEME_PROFILE_ID,
      name: '配色1',
      colors: ThemeCustomColorsSchema.parse({}),
    };
    customThemeProfileDrafts = [profile];
    activeCustomThemeProfileId = profile.id;
    return profile;
  };

  const syncActiveThemeDraftFromInputs = () => {
    const profile = getActiveThemeDraftProfile();
    profile.colors = readCustomThemeColors();
  };

  const syncThemeProfileSelect = () => {
    $themeProfileSelect.empty();
    customThemeProfileDrafts.forEach(profile => {
      p$('<option>').val(profile.id).text(profile.name).appendTo($themeProfileSelect);
    });
    $themeProfileSelect.val(activeCustomThemeProfileId);
  };

  const getSanitizedCustomThemeProfileDrafts = (): CustomThemeProfile[] =>
    normalizeCustomThemeProfiles(
      customThemeProfileDrafts.map((profile, index) => ({
        ...profile,
        name: profile.name.trim() || `配色${index + 1}`,
        colors: ThemeCustomColorsSchema.parse(profile.colors),
      })),
    );

  const syncThemePaletteVisibility = () => {
    $customThemeGrid.css('display', customThemePaletteCollapsed ? 'none' : 'grid');
    $btnToggleThemePalette.text(customThemePaletteCollapsed ? '编辑色板' : '收起色板');
  };

  const renderCustomThemeProfile = () => {
    const profile = getActiveThemeDraftProfile();
    writeCustomThemeColors(profile.colors);
    syncThemeProfileSelect();
    syncThemePaletteVisibility();
  };

  const saveImportedThemeSettings = (payload: unknown) => {
    const legacy = payload as any;
    if (Array.isArray(legacy?.custom_theme_profiles)) {
      const imported = ThemeSettingsExportSchema.parse(payload);
      customThemeProfileDrafts = normalizeCustomThemeProfiles(imported.custom_theme_profiles);
      activeCustomThemeProfileId =
        customThemeProfileDrafts.find(profile => profile.id === imported.active_custom_theme_profile_id)?.id ??
        customThemeProfileDrafts[0].id;
    } else {
      customThemeProfileDrafts = normalizeCustomThemeProfiles(
        [],
        ThemeCustomColorsSchema.parse(legacy?.custom_theme_colors ?? {}),
      );
      activeCustomThemeProfileId = customThemeProfileDrafts[0].id;
    }
    $themeSelect.val('custom');
    renderCustomThemeProfile();
    syncCustomThemeVisibility();
    applyTheme('custom', readCustomThemeColors());
  };

  let customProfileDrafts: CustomProfile[] = [];
  let activeCustomProfileId = DEFAULT_CUSTOM_PROFILE_ID;

  const getActiveDraftProfile = (): CustomProfile => {
    let profile = customProfileDrafts.find(item => item.id === activeCustomProfileId);
    if (profile) return profile;

    profile = customProfileDrafts[0];
    if (profile) {
      activeCustomProfileId = profile.id;
      return profile;
    }

    profile = { id: DEFAULT_CUSTOM_PROFILE_ID, name: '配置1', rules: getDefaultProfileRules() };
    customProfileDrafts = [profile];
    activeCustomProfileId = profile.id;
    return profile;
  };

  const readCustomRuleRows = (): ReplacementRule[] =>
    $customRuleRows
      .find('.TH-user-name-custom-rule-row')
      .toArray()
      .map((row: HTMLElement) => {
        const $row = p$(row);
        return {
          enabled: $row.find('[data-custom-field="enabled"]').prop('checked'),
          source: String($row.find('[data-custom-field="source"]').val() ?? ''),
          replacement_text: String($row.find('[data-custom-field="replacement_text"]').val() ?? ''),
          image_url: normalizeUrl(String($row.find('[data-custom-field="image_url"]').val() ?? '')),
          blurred: $row.find('[data-custom-field="blurred"]').prop('checked'),
        };
      });

  const syncActiveDraftFromRows = () => {
    const activeProfile = getActiveDraftProfile();
    activeProfile.rules = readCustomRuleRows();
  };

  const syncProfileSelect = () => {
    $profileSelect.empty();
    customProfileDrafts.forEach(profile => {
      p$('<option>').val(profile.id).text(profile.name).appendTo($profileSelect);
    });
    $profileSelect.val(activeCustomProfileId);
  };

  const measureCustomRuleTextarea = (element: HTMLTextAreaElement, isMobile: boolean) => {
    element.style.height = 'auto';
    return clamp(element.scrollHeight + 2, isMobile ? 38 : 40, isMobile ? 96 : 112);
  };

  const resizeCustomRuleRow = ($row: any) => {
    const textareas = $row.find('textarea.TH-user-name-custom-input').toArray() as HTMLTextAreaElement[];
    const isMobile = pWin.matchMedia('(max-width: 720px)').matches;
    const heights = textareas.map(element => measureCustomRuleTextarea(element, isMobile));
    const sharedDesktopHeight = Math.max(40, ...heights);
    textareas.forEach((element, index) => {
      element.style.height = `${isMobile ? heights[index] : sharedDesktopHeight}px`;
    });
  };

  const resizeAllCustomRuleTextareas = () => {
    $customRuleRows.find('.TH-user-name-custom-rule-row').each((_idx: number, row: HTMLElement) => {
      resizeCustomRuleRow(p$(row));
    });
  };

  const refreshRuleCount = () => {
    const count = $customRuleRows.find('.TH-user-name-custom-rule-row').length;
    $ruleCount.text(`${count} 条规则`);
  };

  const addCustomRuleRow = (rule: Partial<ReplacementRule> = {}) => {
    const $row = p$('<div>').addClass('TH-user-name-custom-rule-row').css(customGridStyle).appendTo($customRuleRows);

    const $enabledCell = p$('<label>')
      .addClass('TH-user-name-custom-enabled-cell')
      .css({ display: 'flex', alignItems: 'center', justifyContent: 'center' })
      .appendTo($row);
    p$('<input type="checkbox">')
      .attr('data-custom-field', 'enabled')
      .prop('checked', rule.enabled ?? true)
      .appendTo($enabledCell);
    p$('<span>').addClass('TH-user-name-custom-mobile-label').text('启用').appendTo($enabledCell);

    const appendRuleTextField = (
      label: string,
      field: 'source' | 'replacement_text' | 'image_url',
      placeholder: string,
      value: string,
    ) => {
      const $field = p$('<label>').addClass('TH-user-name-custom-field').appendTo($row);
      p$('<span>').addClass('TH-user-name-custom-mobile-label').text(label).appendTo($field);
      const $textarea = p$('<textarea rows="1">')
        .addClass('TH-user-name-custom-input')
        .attr('data-custom-field', field)
        .attr('placeholder', placeholder)
        .val(value)
        .css({ ...inputStyle, minWidth: '0' })
        .appendTo($field);
      $textarea.on('input', () => resizeCustomRuleRow($row));
      return $textarea;
    };

    appendRuleTextField('名字', 'source', 'Alice, Al, 艾丽丝', String(rule.source ?? ''));
    appendRuleTextField(
      '替换项',
      'replacement_text',
      '**粗体** / *斜体* / <code>代码</code>',
      String(rule.replacement_text ?? ''),
    );
    appendRuleTextField('图片 URL', 'image_url', 'https://...', String(rule.image_url ?? ''));

    const $blurredCell = p$('<label>')
      .addClass('TH-user-name-custom-blur-cell')
      .attr('title', '对这一条规则的替换结果应用 4px 高斯模糊')
      .css({ display: 'flex', alignItems: 'center', justifyContent: 'center' })
      .appendTo($row);
    p$('<input type="checkbox">')
      .attr('data-custom-field', 'blurred')
      .prop('checked', rule.blurred ?? false)
      .appendTo($blurredCell);
    p$('<span>').addClass('TH-user-name-custom-mobile-label').text('模糊').appendTo($blurredCell);

    const $delete = p$('<button type="button">')
      .addClass('TH-user-name-custom-flat-button')
      .attr({ title: '删除这条规则', 'aria-label': '删除这条规则' })
      .text('删除')
      .css({ ...btnStyle, width: '48px', minWidth: '48px', padding: '8px 0' })
      .appendTo($row);
    $delete.on('click', () => {
      $row.remove();
      if ($customRuleRows.find('.TH-user-name-custom-rule-row').length === 0) addCustomRuleRow();
      refreshRuleCount();
      applyTheme(readSelectedTheme(), readCustomThemeColors());
    });
    refreshRuleCount();
    pWin.requestAnimationFrame(resizeAllCustomRuleTextareas);
  };

  const renderCustomRules = () => {
    const profile = getActiveDraftProfile();
    $customRuleRows.empty();
    const rules = profile.rules.length > 0 ? profile.rules : getDefaultProfileRules();
    rules.forEach(rule => addCustomRuleRow(rule));
    refreshRuleCount();
    syncProfileSelect();
  };

  const saveImportedCustomSettings = (payload: unknown) => {
    const imported = CustomSettingsExportSchema.parse(payload);
    customProfileDrafts = normalizeCustomProfiles(imported.custom_profiles, '');
    activeCustomProfileId =
      customProfileDrafts.find(profile => profile.id === imported.active_custom_profile_id)?.id ??
      customProfileDrafts[0].id;
    renderCustomRules();
    applyTheme(readSelectedTheme(), readCustomThemeColors());
  };

  const getSanitizedCustomProfileDrafts = (): CustomProfile[] =>
    normalizeCustomProfiles(
      customProfileDrafts.map((profile, index) => ({
        ...profile,
        name: profile.name.trim() || `配置${index + 1}`,
        rules: profile.rules.map(normalizeReplacementRule).filter(rule => rule.source.trim().length > 0),
      })),
      '',
    );

  const syncCustomThemeVisibility = () => {
    $customThemeSec.css('display', readSelectedTheme() === 'custom' ? 'grid' : 'none');
    if (readSelectedTheme() === 'custom') renderCustomThemeProfile();
  };

  const applyTheme = (theme: UiTheme, customColors?: ThemeCustomColors) => {
    const palette = getThemePalette(theme, customColors, pDoc);
    const scopedRoot = `.${rootClass}`;

    $priorityStyle.text(`
${scopedRoot} select,
${scopedRoot} input[type="text"],
${scopedRoot} input[type="color"],
${scopedRoot} textarea,
${scopedRoot} button {
  box-sizing: border-box !important;
  font-family: inherit !important;
  opacity: 1 !important;
  text-shadow: none !important;
}
${scopedRoot} select,
${scopedRoot} input[type="text"],
${scopedRoot} input[type="color"],
${scopedRoot} textarea,
${scopedRoot} .TH-user-name-custom-input {
  border: 1px solid ${palette.lineColor} !important;
  background: ${palette.noteBg} !important;
  color: ${palette.textMain} !important;
  box-shadow: inset 0 1px 0 ${palette.bgPaper} !important;
}
${scopedRoot} input[type="checkbox"] {
  position: static !important;
  appearance: none !important;
  -webkit-appearance: none !important;
  display: inline-block !important;
  flex: 0 0 17px !important;
  width: 17px !important;
  height: 17px !important;
  min-width: 17px !important;
  min-height: 17px !important;
  margin: 0 !important;
  padding: 0 !important;
  opacity: 1 !important;
  visibility: visible !important;
  pointer-events: auto !important;
  vertical-align: middle !important;
  border: 1.5px solid ${palette.lineColor} !important;
  border-radius: 4px !important;
  background-color: ${palette.noteBg} !important;
  background-image: none !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  background-size: 12px 12px !important;
  box-shadow: inset 0 1px 1px ${palette.shadowColor} !important;
  transform: none !important;
  filter: none !important;
}
${scopedRoot} input[type="checkbox"]:checked {
  border-color: ${palette.accentColor} !important;
  background-color: ${palette.accentColor} !important;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.2 8.2 6.4 11.2 12.8 4.8' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") !important;
}
${scopedRoot} input[type="checkbox"]:focus-visible {
  outline: 2px solid ${palette.accentColor} !important;
  outline-offset: 2px !important;
}
${scopedRoot} input[type="radio"] {
  position: static !important;
  appearance: auto !important;
  -webkit-appearance: auto !important;
  display: inline-block !important;
  flex: 0 0 15px !important;
  width: 15px !important;
  height: 15px !important;
  min-width: 15px !important;
  min-height: 15px !important;
  margin: 0 !important;
  opacity: 1 !important;
  visibility: visible !important;
  pointer-events: auto !important;
  vertical-align: middle !important;
  background-image: none !important;
  transform: none !important;
  filter: none !important;
  accent-color: ${palette.accentColor} !important;
}
${scopedRoot} label {
  width: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  opacity: 1 !important;
}
${scopedRoot} .TH-user-name-custom-rule-row {
  display: grid !important;
}
${scopedRoot} .TH-user-name-custom-flat-button,
${scopedRoot} button {
  border: 1px solid ${palette.lineColor} !important;
  opacity: 1 !important;
}
`);

    $modal.css({
      background: `linear-gradient(180deg, ${palette.noteBg} 0%, ${palette.bgPaper} 24%, ${palette.bgPaperDark} 100%)`,
      color: palette.textMain,
      border: `1px solid ${palette.lineColor}`,
      boxShadow: `0 24px 80px ${palette.shadowColor}`,
    });
    $header.css('border-bottom', `1px dashed ${palette.lineColor}`);
    $title.css('color', palette.textMain);

    themedSections.forEach($section => {
      $section.css({
        border: `1px solid ${palette.lineColor}`,
        background: `linear-gradient(180deg, ${palette.noteBg} 0%, ${palette.bgPaper} 100%)`,
        boxShadow: `0 10px 24px ${palette.shadowColor}`,
      });
    });

    themedMetaTexts.forEach($el => {
      $el.css('color', palette.textSub);
    });
    $contentSyncWarning.css('color', palette.accentColor);

    themedInputs.forEach($input => {
      $input.css({
        border: `1px solid ${palette.lineColor}`,
        background: palette.noteBg,
        color: palette.textMain,
        boxShadow: `inset 0 1px 0 ${palette.bgPaper}`,
      });
    });
    $root.find('.TH-user-name-custom-input').css({
      border: `1px solid ${palette.lineColor}`,
      background: palette.noteBg,
      color: palette.textMain,
      boxShadow: `inset 0 1px 0 ${palette.bgPaper}`,
    });
    $root.find('.TH-user-name-custom-table-header').css({
      background: palette.bgPaperDark,
      color: palette.textMain,
      borderBottom: `1px solid ${palette.lineColor}`,
    });
    $root.find('.TH-user-name-custom-rule-row').css({
      background: rgbaFromCssColor(palette.noteBg, 0.56, pDoc),
    });
    $settingsActions.css('border-top', `1px dashed ${palette.lineColor}`);

    flatButtons.forEach($button => {
      $button.css({
        background: palette.btnBg,
        color: palette.textMain,
        border: `1px solid ${palette.lineColor}`,
        boxShadow: `0 8px 20px ${palette.shadowColor}`,
      });
    });
    $root.find('.TH-user-name-custom-flat-button').css({
      background: palette.btnBg,
      color: palette.textMain,
      border: `1px solid ${palette.lineColor}`,
      boxShadow: `0 8px 20px ${palette.shadowColor}`,
    });

    $btnSave.css({
      background: palette.accentColor,
      color: palette.saveText,
      border: `1px solid ${palette.accentColor}`,
      boxShadow: `0 12px 24px ${palette.shadowColor}`,
    });
  };

  const closeHelp = () => $helpOverlay.css('display', 'none');
  const openHelp = () => $helpOverlay.css('display', 'flex');
  const close = () => {
    closeHelp();
    $overlay.removeClass('TH-user-name-replace-open');
  };

  const open = () => {
    const s = getSettings();
    $enabled.prop('checked', s.enabled);
    $contentReplace.prop('checked', s.replace_message_content);
    $headerNames.prop('checked', s.replace_message_header_names);
    $echoTheater.prop('checked', s.replace_echo_theater);
    const displayMode = getDisplayReplaceMode(s);
    $displayTextOnly.prop('checked', displayMode === 'text_only');
    $displayImageOnly.prop('checked', displayMode === 'image_only');
    $displayImageAndText.prop('checked', displayMode === 'image_and_text');
    $themeSelect.val(s.ui_theme);
    customThemeProfileDrafts = normalizeCustomThemeProfiles(s.custom_theme_profiles, s.custom_theme_colors);
    activeCustomThemeProfileId =
      customThemeProfileDrafts.find(profile => profile.id === s.active_custom_theme_profile_id)?.id ??
      customThemeProfileDrafts[0].id;
    customThemePaletteCollapsed = s.custom_theme_palette_collapsed;
    renderCustomThemeProfile();
    $layoutVertical.prop('checked', s.fab_layout === 'vertical');
    $layoutHorizontal.prop('checked', s.fab_layout === 'horizontal');
    $collapseVisible.prop('checked', s.fab_show_collapse_button);
    $fabEnabled.prop('checked', isFloatingWindowEnabled(s));
    $fabContentSyncVisible.prop('checked', s.fab_show_content_sync_button);
    $dockLeft.prop('checked', s.fab_pos_x < 0.5);
    $dockRight.prop('checked', s.fab_pos_x >= 0.5);
    $compactDock.prop('checked', s.fab_compact_dock);

    customProfileDrafts = normalizeCustomProfilesForSettings(s).map(profile => ({
      ...profile,
      rules: profile.rules.map(normalizeReplacementRule),
    }));
    activeCustomProfileId =
      customProfileDrafts.find(profile => profile.id === s.active_custom_profile_id)?.id ?? customProfileDrafts[0].id;
    renderCustomRules();

    syncCustomThemeVisibility();
    applyTheme(s.ui_theme, getActiveThemeDraftProfile().colors);
    $overlay.addClass('TH-user-name-replace-open');
    pWin.requestAnimationFrame(resizeAllCustomRuleTextareas);
  };

  const save = () => {
    const current = getSettings();
    syncActiveDraftFromRows();
    syncActiveThemeDraftFromInputs();
    const custom_profiles = getSanitizedCustomProfileDrafts();
    const custom_theme_profiles = getSanitizedCustomThemeProfileDrafts();
    activeCustomProfileId =
      custom_profiles.find(profile => profile.id === activeCustomProfileId)?.id ?? custom_profiles[0].id;
    activeCustomThemeProfileId =
      custom_theme_profiles.find(profile => profile.id === activeCustomThemeProfileId)?.id ??
      custom_theme_profiles[0].id;
    const display_replace_mode: DisplayReplaceMode = $displayTextOnly.prop('checked')
      ? 'text_only'
      : $displayImageAndText.prop('checked')
        ? 'image_and_text'
        : 'image_only';
    const next = SettingsSchema.parse({
      ...current,
      enabled: $enabled.prop('checked'),
      replace_message_content: $contentReplace.prop('checked'),
      replace_message_header_names: $headerNames.prop('checked'),
      replace_echo_theater: $echoTheater.prop('checked'),
      image_replace_whole_word: display_replace_mode === 'image_only',
      display_replace_mode,
      ui_theme: readSelectedTheme(),
      custom_theme_colors: (
        custom_theme_profiles.find(profile => profile.id === activeCustomThemeProfileId) ?? custom_theme_profiles[0]
      ).colors,
      active_custom_theme_profile_id: activeCustomThemeProfileId,
      custom_theme_profiles,
      custom_theme_palette_collapsed: customThemePaletteCollapsed,

      user_enabled: false,
      user_replacement_text: '',
      user_image_url: '',

      char_enabled: false,
      char_replacement_text: '',
      char_image_url: '',

      custom_enabled: true,
      active_custom_profile_id: activeCustomProfileId,
      custom_profiles: custom_profiles,
      custom_rules_raw: serializeCustomRulesRaw(
        (custom_profiles.find(profile => profile.id === activeCustomProfileId) ?? custom_profiles[0]).rules,
      ),

      fab_layout: $layoutHorizontal.prop('checked') ? 'horizontal' : 'vertical',
      fab_show_collapse_button: $collapseVisible.prop('checked'),
      fab_show_content_sync_button: $fabContentSyncVisible.prop('checked'),
      fab_enabled: $fabEnabled.prop('checked'),
      fab_auto_show: $fabEnabled.prop('checked'),
      fab_pos_x: $dockRight.prop('checked') ? 0.985 : 0.015,
      fab_compact_dock: $compactDock.prop('checked'),
      fab_expanded: false,
    });

    setSettings(next);
    afterSave();
    toastr.success('已保存设置');
    close();
  };

  $themeSelect.on('change', () => {
    syncCustomThemeVisibility();
    applyTheme(readSelectedTheme(), readCustomThemeColors());
  });
  $themeProfileSelect.on('change', () => {
    syncActiveThemeDraftFromInputs();
    activeCustomThemeProfileId = String($themeProfileSelect.val() ?? activeCustomThemeProfileId);
    renderCustomThemeProfile();
    applyTheme(readSelectedTheme(), readCustomThemeColors());
  });
  $btnAddThemeProfile.on('click', () => {
    syncActiveThemeDraftFromInputs();
    const nextIndex = customThemeProfileDrafts.length + 1;
    const profile = {
      id: createCustomThemeProfileId(),
      name: `配色${nextIndex}`,
      colors: ThemeCustomColorsSchema.parse(readCustomThemeColors()),
    };
    customThemeProfileDrafts.push(profile);
    activeCustomThemeProfileId = profile.id;
    renderCustomThemeProfile();
    applyTheme(readSelectedTheme(), readCustomThemeColors());
  });
  $btnRenameThemeProfile.on('click', () => {
    const profile = getActiveThemeDraftProfile();
    const nextName = pWin.prompt('配色名称', profile.name)?.trim();
    if (!nextName) return;

    profile.name = nextName;
    syncThemeProfileSelect();
  });
  $btnDeleteThemeProfile.on('click', () => {
    if (customThemeProfileDrafts.length <= 1) {
      toastr.warning('至少保留一个配色');
      return;
    }

    const profile = getActiveThemeDraftProfile();
    if (!pWin.confirm(`删除“${profile.name}”？`)) return;

    customThemeProfileDrafts = customThemeProfileDrafts.filter(item => item.id !== profile.id);
    activeCustomThemeProfileId = customThemeProfileDrafts[0].id;
    renderCustomThemeProfile();
    applyTheme(readSelectedTheme(), readCustomThemeColors());
  });
  $btnToggleThemePalette.on('click', () => {
    customThemePaletteCollapsed = !customThemePaletteCollapsed;
    syncThemePaletteVisibility();
  });
  Object.values(customThemeInputs).forEach(($input: any) => {
    $input.on('input change', () => {
      if (readSelectedTheme() !== 'custom') return;
      syncActiveThemeDraftFromInputs();
      applyTheme('custom', readCustomThemeColors());
    });
  });
  $btnExportTheme.on('click', () => {
    syncActiveThemeDraftFromInputs();
    const exportData = buildThemeSettingsExport(activeCustomThemeProfileId, getSanitizedCustomThemeProfileDrafts());
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = pDoc.createElement('a');
    anchor.href = url;
    anchor.download = '用户名替换美化设置.json';
    pDoc.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  $btnImportTheme.on('click', () => {
    ($themeImportFile[0] as HTMLInputElement | undefined)?.click();
  });
  $themeImportFile.on('change', () => {
    const input = $themeImportFile[0] as HTMLInputElement | undefined;
    const file = input?.files?.[0];
    if (!file) return;

    file
      .text()
      .then(raw => {
        saveImportedThemeSettings(JSON.parse(raw));
        toastr.success('已导入美化设置，保存后生效');
      })
      .catch(error => {
        console.error(`${LOG_PREFIX} 美化设置导入失败`, error);
        toastr.error('导入失败，请检查 JSON 文件');
      })
      .finally(() => {
        if (input) input.value = '';
      });
  });
  $profileSelect.on('change', () => {
    syncActiveDraftFromRows();
    activeCustomProfileId = String($profileSelect.val() ?? activeCustomProfileId);
    renderCustomRules();
    applyTheme(readSelectedTheme(), readCustomThemeColors());
  });
  $btnAddProfile.on('click', () => {
    syncActiveDraftFromRows();
    const nextIndex = customProfileDrafts.length + 1;
    const profile = { id: createCustomProfileId(), name: `配置${nextIndex}`, rules: getDefaultProfileRules() };
    customProfileDrafts.push(profile);
    activeCustomProfileId = profile.id;
    renderCustomRules();
    applyTheme(readSelectedTheme(), readCustomThemeColors());
  });
  $btnRenameProfile.on('click', () => {
    const profile = getActiveDraftProfile();
    const nextName = pWin.prompt('配置名称', profile.name)?.trim();
    if (!nextName) return;

    profile.name = nextName;
    syncProfileSelect();
  });
  $btnDeleteProfile.on('click', () => {
    if (customProfileDrafts.length <= 1) {
      toastr.warning('至少保留一个配置');
      return;
    }

    const profile = getActiveDraftProfile();
    if (!pWin.confirm(`删除“${profile.name}”？`)) return;

    customProfileDrafts = customProfileDrafts.filter(item => item.id !== profile.id);
    activeCustomProfileId = customProfileDrafts[0].id;
    renderCustomRules();
    applyTheme(readSelectedTheme(), readCustomThemeColors());
  });
  $btnAddRule.on('click', () => {
    addCustomRuleRow();
    applyTheme(readSelectedTheme(), readCustomThemeColors());
  });
  $btnExportCustom.on('click', () => {
    syncActiveDraftFromRows();
    const exportData = CustomSettingsExportSchema.parse({
      ...buildCustomSettingsExport({
        ...getSettings(),
        custom_enabled: true,
        active_custom_profile_id: activeCustomProfileId,
        custom_profiles: getSanitizedCustomProfileDrafts(),
      }),
    });
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = pDoc.createElement('a');
    anchor.href = url;
    anchor.download = '用户名替换自定义设置.json';
    pDoc.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  $btnImportCustom.on('click', () => {
    ($customImportFile[0] as HTMLInputElement | undefined)?.click();
  });
  $customImportFile.on('change', () => {
    const input = $customImportFile[0] as HTMLInputElement | undefined;
    const file = input?.files?.[0];
    if (!file) return;

    file
      .text()
      .then(raw => {
        saveImportedCustomSettings(JSON.parse(raw));
        toastr.success('已导入自定义设置，保存后生效');
      })
      .catch(error => {
        console.error(`${LOG_PREFIX} 自定义设置导入失败`, error);
        toastr.error('导入失败，请检查 JSON 文件');
      })
      .finally(() => {
        if (input) input.value = '';
      });
  });
  $btnClose.on('click', close);
  $btnCancel.on('click', close);
  $btnSave.on('click', save);
  $btnHelp.on('click', openHelp);
  $btnHelpClose.on('click', closeHelp);
  $helpOverlay.on('click', (e: any) => {
    if (e.target === $helpOverlay[0]) closeHelp();
  });
  $overlay.on(
    'pointerdown pointermove pointerup pointercancel mousedown mousemove mouseup touchstart touchmove touchend touchcancel click',
    (e: any) => {
      if (e.target === $overlay[0]) {
        e.stopPropagation?.();
      }
    },
  );

  const settingsResizeNamespace = `.TH_user_name_replace_settings_${getScriptId()}`;
  p$(pWin).on(`resize${settingsResizeNamespace}`, resizeAllCustomRuleTextareas);

  p$(pDoc).on(`keydown.TH_user_name_replace_${getScriptId()}`, (e: any) => {
    if (e.key !== 'Escape') return;
    if ($helpOverlay.css('display') !== 'none') {
      closeHelp();
    } else {
      close();
    }
  });

  return {
    open,
    destroy: () => {
      p$(pWin).off(`resize${settingsResizeNamespace}`);
      p$(pDoc).off(`keydown.TH_user_name_replace_${getScriptId()}`);
      $priorityStyle.remove();
      $layoutStyle.remove();
      $toastStyle.remove();
      $root.remove();
    },
  };
}

function buildFloatingToggle(
  getSettings: () => Settings,
  setSettings: (next: Settings) => void,
  reapply: () => void,
  openSettings: () => void,
): { refresh: () => void; destroy: () => void } {
  const ns = `.TH_user_name_replace_fab_${getScriptId()}`;
  const p$ = (window.parent as any).$ ?? $;
  const pDoc = window.parent?.document ?? document;
  const pWin = window.parent ?? window;

  const root = pDoc.createElement('div');
  root.className = `TH-user-name-replace-fab-root-${getScriptId()}`;
  pDoc.body.appendChild(root);

  const $root = p$(root);

  const $panel = p$('<div>')
    .css({
      position: 'fixed',
      left: '0',
      top: '0',
      right: 'auto',
      bottom: 'auto',
      zIndex: '100',
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: '4px',
      padding: '0',
      border: '0',
      background: 'transparent',
      boxShadow: 'none',
      pointerEvents: 'auto',
      touchAction: 'none',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      width: 'auto',
      height: 'auto',
      overflow: 'visible',
      transition: 'opacity 120ms ease, transform 120ms ease',
    })
    .appendTo($root);

  const $buttonGroup = p$('<div>')
    .css({
      display: 'flex',
      gap: '4px',
      alignItems: 'center',
      justifyContent: 'center',
    })
    .appendTo($panel);

  const $handle = p$('<div>')
    .attr({ role: 'button', tabindex: '0' })
    .css({
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '34px',
      height: '54px',
      borderRadius: '3px',
      cursor: 'pointer',
      lineHeight: '1',
      touchAction: 'none',
      boxSizing: 'border-box',
      background: 'transparent',
    })
    .appendTo($panel);
  const $grip = p$('<span>')
    .css({
      position: 'absolute',
      top: '3px',
      bottom: '3px',
      left: '13px',
      width: '8px',
      borderRadius: '3px',
    })
    .appendTo($handle);
  const $stateDot = p$('<span>')
    .css({
      position: 'absolute',
      left: '15px',
      top: '7px',
      width: '5px',
      height: '5px',
      borderRadius: '50%',
    })
    .appendTo($handle);
  const $handleDots: any[] = [];
  for (const top of [17, 27]) {
    const $dot = p$('<span>')
      .css({
        position: 'absolute',
        left: '16px',
        top: `${top + 3}px`,
        width: '3px',
        height: '3px',
        borderRadius: '50%',
        background: 'currentColor',
        opacity: '0.72',
      })
      .appendTo($handle);
    $handleDots.push($dot);
  }

  const commonBtnStyle: Partial<CSSStyleDeclaration> = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '0',
    cursor: 'pointer',
    borderRadius: '6px',
    width: '28px',
    height: '28px',
    padding: '0',
    lineHeight: '1',
    boxSizing: 'border-box',
  };

  const iconStyle: Partial<CSSStyleDeclaration> = {
    width: '17px',
    height: '17px',
    display: 'block',
    pointerEvents: 'none',
  };

  const createSvgIcon = (paths: string) =>
    p$(
      `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        ${paths}
      </svg>`,
    )
      .css(iconStyle)
      .attr({
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2.4',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });

  const $toggle = p$('<button type="button" aria-label="Toggle replacement">')
    .css({ ...commonBtnStyle })
    .append(
      createSvgIcon(`
        <path d="M12 2.5v9"></path>
        <path d="M7.1 5.9a8 8 0 1 0 9.8 0"></path>
      `),
    )
    .appendTo($buttonGroup);

  const $contentSyncToggle = p$('<button type="button" aria-label="Toggle content sync replacement">')
    .css({ ...commonBtnStyle })
    .append(
      createSvgIcon(`
        <path d="M7 7h7a4 4 0 0 1 4 4v1"></path>
        <path d="m15 9 3 3 3-3"></path>
        <path d="M17 17h-7a4 4 0 0 1-4-4v-1"></path>
        <path d="m9 15-3-3-3 3"></path>
      `),
    )
    .appendTo($buttonGroup);

  const $settings = p$('<button type="button" aria-label="Settings">')
    .css({ ...commonBtnStyle })
    .append(
      createSvgIcon(`
        <path d="M4 7h4"></path>
        <path d="M12 7h8"></path>
        <path d="M4 17h8"></path>
        <path d="M16 17h4"></path>
        <circle cx="10" cy="7" r="2"></circle>
        <circle cx="14" cy="17" r="2"></circle>
      `),
    )
    .appendTo($buttonGroup);

  const panelEl = $panel[0] as HTMLElement;

  function getViewportSize() {
    return {
      w: pDoc.documentElement.clientWidth || pWin.innerWidth,
      h: pDoc.documentElement.clientHeight || pWin.innerHeight,
    };
  }

  function getPanelSize() {
    const rect = panelEl.getBoundingClientRect();
    return { w: rect.width || 70, h: rect.height || 46 };
  }

  function getAnchorBounds(): {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
  } | null {
    const { w: vw, h: vh } = getViewportSize();
    const horizontalSafe = 0;
    const verticalSafe = 4;
    const selectors = ['#chat', '#chat .mes:last-child', '.mes.last_mes', '#send_form', '#send_textarea'];
    for (const selector of selectors) {
      const el = pDoc.querySelector(selector);
      const rect = el?.getBoundingClientRect();
      if (!rect || rect.width <= 80 || rect.height <= 40) continue;

      const left = clamp(rect.left, horizontalSafe, Math.max(horizontalSafe, vw - horizontalSafe));
      const right = clamp(rect.right, horizontalSafe, Math.max(horizontalSafe, vw - horizontalSafe));
      const top = clamp(Math.max(rect.top, verticalSafe), verticalSafe, Math.max(verticalSafe, vh - verticalSafe));
      const bottom = clamp(Math.min(rect.bottom, vh - verticalSafe), top + 40, Math.max(top + 40, vh - verticalSafe));
      const width = right - left;
      const height = bottom - top;
      if (width > 80 && height > 40) return { left, right, top, bottom, width, height };
    }
    return null;
  }

  function applyEdgePosition() {
    const { w: vw, h: vh } = getViewportSize();
    const { w: pw, h: ph } = getPanelSize();
    const anchor = getAnchorBounds();
    const margin = 0;
    let x = vw - pw;
    let y = vh - ph - 92;

    if (anchor) {
      const dockRight = getSettings().fab_pos_x >= 0.5;
      x = dockRight ? anchor.right - pw : anchor.left;
      y = anchor.top + getSettings().fab_pos_y * anchor.height - ph / 2;
    }

    x = clamp(x, margin, Math.max(margin, vw - pw - margin));
    y = clamp(y, 4, Math.max(4, vh - ph - 4));
    $panel.css({
      left: `${x}px`,
      top: `${y}px`,
      right: 'auto',
      bottom: 'auto',
      width: 'auto',
      height: 'auto',
    });
  }

  function savePosByPixel(_x: number, y: number) {
    const anchor = getAnchorBounds();
    const current = getSettings();
    const x01 = current.fab_pos_x >= 0.5 ? 0.985 : 0.015;
    const y01 = anchor
      ? clamp((y + getPanelSize().h / 2 - anchor.top) / anchor.height, 0.03, 0.97)
      : clamp(getViewportSize().h > 0 ? y / getViewportSize().h : 0.5, 0, 1);

    const next = SettingsSchema.parse({
      ...current,
      fab_pos_x: x01,
      fab_pos_y: y01,
    });
    setSettings(next);
  }

  function onRelayout() {
    applyEdgePosition();
  }

  function applyFloatingTheme(settings: Settings) {
    const palette = getResolvedThemePalette(settings, pDoc);
    const iconColor = getTavernReferenceTextColor(pDoc) ?? palette.saveText;
    const contentSyncActive = isContentSyncActive(settings);
    $grip.css({
      background: rgbaFromCssColor(palette.textMain, 0.42, pDoc),
      color: palette.saveText,
    });
    $stateDot.css(
      'background',
      contentSyncActive ? CONTENT_SYNC_ACTIVE_COLOR : settings.enabled ? '#22c55e' : '#ef4444',
    );
    $toggle.css({
      background: contentSyncActive
        ? CONTENT_SYNC_ACTIVE_COLOR
        : settings.enabled
          ? palette.accentColor
          : rgbaFromCssColor(palette.textMain, 0.52, pDoc),
      color: iconColor,
      boxShadow: `0 6px 16px ${palette.shadowColor}`,
      textShadow: `0 1px 2px ${palette.shadowColor}`,
    });
    $contentSyncToggle.css({
      background: contentSyncActive ? CONTENT_SYNC_ACTIVE_COLOR : rgbaFromCssColor(palette.textMain, 0.52, pDoc),
      color: iconColor,
      boxShadow: `0 6px 16px ${palette.shadowColor}`,
      textShadow: `0 1px 2px ${palette.shadowColor}`,
    });
    $settings.css({
      background: rgbaFromCssColor(palette.textMain, 0.6, pDoc),
      color: iconColor,
      boxShadow: `0 6px 16px ${palette.shadowColor}`,
      textShadow: `0 1px 2px ${palette.shadowColor}`,
    });
  }

  function updateFloatingSettings(patch: Partial<Settings>): Settings {
    const next = SettingsSchema.parse({ ...getSettings(), ...patch });
    setSettings(next);
    return next;
  }

  function setCompactExpanded(expanded: boolean) {
    const s = getSettings();
    if (s.fab_expanded === expanded) return;
    updateFloatingSettings({ fab_expanded: expanded });
    refresh();
  }

  const refresh = () => {
    const s = getSettings();
    const dockRight = s.fab_pos_x >= 0.5;
    const expanded = s.fab_expanded;
    applyFloatingTheme(s);
    $grip.css(dockRight ? { left: 'auto', right: '0' } : { left: '0', right: 'auto' });
    $stateDot.css(dockRight ? { left: 'auto', right: '2px' } : { left: '2px', right: 'auto' });
    $handleDots.forEach($dot => {
      $dot.css(dockRight ? { left: 'auto', right: '3px' } : { left: '3px', right: 'auto' });
    });
    $panel.css({
      flexDirection: dockRight ? 'row' : 'row-reverse',
      alignItems: 'center',
      gap: expanded ? '4px' : '0',
      opacity: expanded ? '1' : '0.58',
      transform: 'none',
      right: 'auto',
      bottom: 'auto',
      width: 'auto',
      height: 'auto',
    });
    $handle.css('display', 'flex');
    $handle.attr('title', expanded ? 'Collapse controls, drag to move' : 'Expand controls, drag to move');
    $buttonGroup.css({
      flexDirection: 'row',
      display: expanded ? 'flex' : 'none',
    });
    $contentSyncToggle.css('display', s.fab_show_content_sync_button ? 'flex' : 'none');
    $toggle.attr('title', s.enabled ? '关闭替换' : '开启替换');
    $contentSyncToggle.attr('title', isContentSyncActive(s) ? '关闭同步正文替换' : '开启同步正文替换');
    $settings.attr('title', '替换设置');
    setTimeout(onRelayout, 0);
  };

  setTimeout(onRelayout, 0);

  // 拖拽
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let startTop = 0;
  let dragStartTarget: HTMLElement | null = null;

  function getPoint(ev: any): { x: number; y: number } {
    if (ev.touches && ev.touches[0]) return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
    if (ev.changedTouches && ev.changedTouches[0])
      return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
    return { x: ev.clientX ?? 0, y: ev.clientY ?? 0 };
  }

  const onDragStart = (ev: any) => {
    const target = ev.target as HTMLElement;
    if (target && (target.tagName === 'BUTTON' || target.closest('button'))) return;

    const p = getPoint(ev);
    const rect = panelEl.getBoundingClientRect();

    dragging = true;
    moved = false;
    startX = p.x;
    startY = p.y;
    startTop = rect.top;
    dragStartTarget = target ?? null;

    ev.preventDefault?.();
    ev.stopPropagation?.();
  };

  const onDragMove = (ev: any) => {
    if (!dragging) return;

    const p = getPoint(ev);
    const dx = p.x - startX;
    const dy = p.y - startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;

    const { w: pw, h: ph } = getPanelSize();
    const anchor = getAnchorBounds();
    const margin = 6;
    let nx: number;
    let ny = startTop + dy;

    if (anchor) {
      const dockRight = getSettings().fab_pos_x >= 0.5;
      nx = dockRight ? anchor.right - pw : anchor.left;
      ny = clamp(ny, anchor.top + margin, Math.max(anchor.top + margin, anchor.bottom - ph - margin));
    } else {
      const { w: vw, h: vh } = getViewportSize();
      nx = getSettings().fab_pos_x >= 0.5 ? vw - pw : 0;
      ny = clamp(ny, margin, Math.max(margin, vh - ph - margin));
    }

    $panel.css({
      left: `${nx}px`,
      top: `${ny}px`,
      right: 'auto',
      bottom: 'auto',
      width: 'auto',
      height: 'auto',
    });

    ev.preventDefault?.();
    ev.stopPropagation?.();
  };

  const onDragEnd = (ev: any) => {
    if (!dragging) return;
    dragging = false;

    const rect = panelEl.getBoundingClientRect();
    savePosByPixel(rect.left, rect.top);

    if (ev.type === 'touchend' && !moved && dragStartTarget && $handle[0].contains(dragStartTarget)) {
      updateFloatingSettings({ fab_expanded: !getSettings().fab_expanded });
      refresh();
    }
    dragStartTarget = null;
    if (ev.type === 'touchend' || ev.type === 'touchcancel') moved = false;

    ev.preventDefault?.();
    ev.stopPropagation?.();
  };

  const onHandleTouchEnd = (ev: any) => {
    if (!dragging || moved || !dragStartTarget || !$handle[0].contains(dragStartTarget)) return;

    dragging = false;
    const rect = panelEl.getBoundingClientRect();
    savePosByPixel(rect.left, rect.top);
    updateFloatingSettings({ fab_expanded: !getSettings().fab_expanded });
    refresh();
    dragStartTarget = null;
    moved = false;

    ev.preventDefault?.();
    ev.stopPropagation?.();
  };

  // 用 panel 空白区拖拽
  $panel.on(`mousedown${ns}`, onDragStart);
  $panel.on(`touchstart${ns}`, onDragStart);
  $handle.on(`touchend${ns}`, onHandleTouchEnd);

  p$(pDoc).on(`mousemove${ns}`, onDragMove);
  p$(pDoc).on(`touchmove${ns}`, onDragMove);

  p$(pDoc).on(`mouseup${ns}`, onDragEnd);
  p$(pDoc).on(`touchend${ns}`, onDragEnd);
  p$(pDoc).on(`touchcancel${ns}`, onDragEnd);

  const toggleReplacement = () => {
    const s = getSettings();
    const next = getToggledReplacementSettings(s);
    setSettings(next);
    void reapply();
    refresh();
    toastr.info(next.enabled ? '名称替换：已开启' : '名称替换：已关闭');
  };

  const toggleContentSyncReplacement = () => {
    const next = getToggledContentSyncSettings(getSettings());
    setSettings(next);
    void reapply();
    refresh();
    toastr.info(isContentSyncActive(next) ? '同步正文替换：已开启' : '同步正文替换：已关闭');
  };

  const openSettingsPanel = () => {
    openSettings();
  };

  // 点击按钮
  $toggle.on(`click${ns}`, (ev: any) => {
    if (moved) {
      moved = false;
      ev.preventDefault?.();
      return;
    }
    toggleReplacement();
  });

  $toggle.on(`touchend${ns}`, (ev: any) => {
    ev.preventDefault?.();
    ev.stopPropagation?.();
    if (moved) {
      moved = false;
      return;
    }
    toggleReplacement();
  });

  $contentSyncToggle.on(`click${ns}`, (ev: any) => {
    if (moved) {
      moved = false;
      ev.preventDefault?.();
      return;
    }
    toggleContentSyncReplacement();
  });

  $contentSyncToggle.on(`touchend${ns}`, (ev: any) => {
    ev.preventDefault?.();
    ev.stopPropagation?.();
    if (moved) {
      moved = false;
      return;
    }
    toggleContentSyncReplacement();
  });

  $settings.on(`click${ns}`, (ev: any) => {
    if (moved) {
      moved = false;
      ev.preventDefault?.();
      return;
    }
    openSettingsPanel();
  });

  $settings.on(`touchend${ns}`, (ev: any) => {
    ev.preventDefault?.();
    ev.stopPropagation?.();
    if (moved) {
      moved = false;
      return;
    }
    openSettingsPanel();
  });

  $handle.on(`click${ns}`, (ev: any) => {
    if (moved) {
      moved = false;
      ev.preventDefault?.();
      return;
    }
    const s = getSettings();
    updateFloatingSettings({ fab_expanded: !s.fab_expanded });
    refresh();
  });

  $handle.on(`keydown${ns}`, (ev: any) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault?.();
    const s = getSettings();
    updateFloatingSettings({ fab_expanded: !s.fab_expanded });
    refresh();
  });

  const onOutsidePointer = (ev: any) => {
    const s = getSettings();
    if (!s.fab_expanded) return;
    const target = ev.target as Node | null;
    if (target && panelEl.contains(target)) return;
    setCompactExpanded(false);
  };

  // 视口变化时，按百分比重算位置，避免“只显示一截”
  p$(pWin).on(`resize${ns}`, onRelayout);
  p$(pWin).on(`orientationchange${ns}`, onRelayout);
  p$(pDoc).on(`mousedown${ns}`, onOutsidePointer);
  p$(pDoc).on(`touchstart${ns}`, onOutsidePointer);

  refresh();

  return {
    refresh,
    destroy: () => {
      p$(pWin).off(`resize${ns}`);
      p$(pWin).off(`orientationchange${ns}`);

      $panel.off(ns);
      $handle.off(ns);
      $buttonGroup.off(ns);
      $toggle.off(ns);
      $contentSyncToggle.off(ns);
      $settings.off(ns);
      p$(pDoc).off(`mousedown${ns}`);
      p$(pDoc).off(`touchstart${ns}`);
      p$(pDoc).off(`mousemove${ns}`);
      p$(pDoc).off(`touchmove${ns}`);
      p$(pDoc).off(`mouseup${ns}`);
      p$(pDoc).off(`touchend${ns}`);
      p$(pDoc).off(`touchcancel${ns}`);

      $root.remove();
    },
  };
}

function buildFloatingUi(
  getSettings: () => Settings,
  setSettings: (next: Settings) => void,
  reapply: () => void,
): { refresh: () => void; openSettings: () => void; destroy: () => void } {
  let destroyed = false;
  let fab: ReturnType<typeof buildFloatingToggle> | null = null;

  const syncFloatingToggle = () => {
    if (destroyed) return;

    if (!isFloatingWindowEnabled(getSettings())) {
      fab?.destroy();
      fab = null;
      return;
    }

    if (!fab) {
      fab = buildFloatingToggle(getSettings, setSettings, reapply, () => ui.open());
      return;
    }

    fab.refresh();
  };

  const ui = buildSettingsOverlay(getSettings, setSettings, () => {
    void reapply();
    syncFloatingToggle();
  });

  syncFloatingToggle();

  return {
    refresh: syncFloatingToggle,
    openSettings: () => {
      ui.open();
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      fab?.destroy();
      fab = null;
      ui.destroy();
    },
  };
}

function init() {
  console.info(`${LOG_PREFIX} 已加载`);
  const variables: Variables = VariablesSchema.parse(getVariables({ type: 'script', script_id: getScriptId() }));

  const getSettings = () => variables.user_name_replace;

  const persistSettings = () => {
    insertOrAssignVariables(
      { user_name_replace: variables.user_name_replace },
      { type: 'script', script_id: getScriptId() },
    );
  };

  const setSettings = (next: Settings) => {
    variables.user_name_replace = next;
    persistSettings();
  };

  let destroyed = false;
  const parent$ = (window.parent as any).$ ?? $;
  const pWin = window.parent ?? window;
  const pDoc = pWin.document ?? document;
  const echoTheaterEnhancer = createEchoTheaterEnhancer(getSettings, pDoc, pWin);
  const ParentIntersectionObserver = (pWin as any).IntersectionObserver as typeof IntersectionObserver | undefined;
  const ParentMutationObserver = (pWin as any).MutationObserver as typeof MutationObserver | undefined;
  const pendingDisplayedMessageRefreshIds = new Set<number>();
  const observedDisplayedMessageElements = new Map<number, Element>();
  let displayedMessageRefreshChain = Promise.resolve();
  let displayedMessageObserver: IntersectionObserver | null = null;
  let nestedMessageIframeMountObserver: MutationObserver | null = null;

  const collectMountedMessageIframes = (node: Node, frames: Set<HTMLIFrameElement>) => {
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (element.tagName === 'IFRAME') frames.add(element as HTMLIFrameElement);
    element.querySelectorAll<HTMLIFrameElement>('iframe').forEach(frame => frames.add(frame));
  };

  const applyToNewlyMountedMessageIframes = (frames: Iterable<HTMLIFrameElement>) => {
    if (destroyed) return;

    const messages = new Set<HTMLElement>();
    for (const frame of frames) {
      if (!frame.closest('.mes_text, .mes_reasoning')) continue;
      const message = frame.closest<HTMLElement>('#chat > .mes');
      if (message) messages.add(message);
    }
    if (messages.size === 0) return;

    const settings = getSettings();
    const matcher = compileMatcher(buildRules(settings));
    messages.forEach(message => {
      applyToNestedMessageIframes(parent$(message), matcher, settings);
    });
  };

  if (ParentMutationObserver && pDoc.body) {
    nestedMessageIframeMountObserver = new ParentMutationObserver(mutations => {
      const frames = new Set<HTMLIFrameElement>();
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => collectMountedMessageIframes(node, frames));
      });
      applyToNewlyMountedMessageIframes(frames);
    });
    nestedMessageIframeMountObserver.observe(pDoc.body, { childList: true, subtree: true });
  }

  const clearPendingDisplayedMessageRefresh = (message_id: number) => {
    pendingDisplayedMessageRefreshIds.delete(message_id);
    const observedElement = observedDisplayedMessageElements.get(message_id);
    if (observedElement) {
      displayedMessageObserver?.unobserve(observedElement);
      observedDisplayedMessageElements.delete(message_id);
    }
  };

  const refreshDisplayedMessageLazily = (message_id: number) => {
    clearPendingDisplayedMessageRefresh(message_id);
    displayedMessageRefreshChain = displayedMessageRefreshChain.then(async () => {
      if (destroyed) return;
      try {
        await refreshOneMessage(message_id);
        if (!destroyed) applyToMessageId(message_id, getSettings());
      } catch (error) {
        console.error(`${LOG_PREFIX} 懒刷新正则楼层失败`, message_id, error);
      }
    });
  };

  if (ParentIntersectionObserver) {
    displayedMessageObserver = new ParentIntersectionObserver(
      (entries: IntersectionObserverEntry[]) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const message_id = Number(entry.target.getAttribute('mesid'));
          if (!isValidMessageId(message_id) || !pendingDisplayedMessageRefreshIds.has(message_id)) return;
          refreshDisplayedMessageLazily(message_id);
        });
      },
      { root: null, rootMargin: '120px 0px' },
    );
  }

  const queueChangedDisplayedMessagesForRefresh = (patches: ChatMessagePatch[]) => {
    patches.filter(doesPatchChangeDisplayedContent).forEach(patch => {
      const $mes = parent$(`#chat > .mes[mesid='${patch.message_id}']`);
      const element = $mes[0] as Element | undefined;
      if (!element) return;

      clearPendingDisplayedMessageRefresh(patch.message_id);
      pendingDisplayedMessageRefreshIds.add(patch.message_id);
      observedDisplayedMessageElements.set(patch.message_id, element);
      if (displayedMessageObserver) {
        displayedMessageObserver.observe(element);
      } else {
        refreshDisplayedMessageLazily(patch.message_id);
      }
    });
  };

  const clearAllPendingDisplayedMessageRefreshes = () => {
    displayedMessageObserver?.disconnect();
    pendingDisplayedMessageRefreshIds.clear();
    observedDisplayedMessageElements.clear();
  };

  const reapply = async () => {
    restoreAll();
    const s = getSettings();
    let patches: ChatMessagePatch[];
    if (s.enabled && s.replace_message_content) {
      patches = await syncAllPersistentMessageContent(s);
    } else {
      patches = await restoreAllPersistentMessageContent(s);
    }
    queueChangedDisplayedMessagesForRefresh(patches);
    applyToAllVisible(s);
    echoTheaterEnhancer.reapply();
  };

  const pendingMessageIds = new Set<number>();
  const scheduleApplyToMessage = (message_id: number) => {
    if (destroyed || !isValidMessageId(message_id)) return;
    if (pendingMessageIds.has(message_id)) return;
    clearPendingDisplayedMessageRefresh(message_id);
    pendingMessageIds.add(message_id);

    setTimeout(() => {
      void (async () => {
        try {
          if (destroyed) return;
          const s = getSettings();
          let patches: ChatMessagePatch[];
          if (s.enabled && s.replace_message_content) {
            patches = await syncPersistentMessageContent(message_id, s);
          } else {
            patches = await restorePersistentMessageContent(message_id, s);
          }
          queueChangedDisplayedMessagesForRefresh(patches);
          applyToMessageId(message_id, s);
        } catch (error) {
          console.error(`${LOG_PREFIX} 楼层同步失败`, message_id, error);
        } finally {
          pendingMessageIds.delete(message_id);
        }
      })();
    }, 0);
  };

  const rerenderAll = () => {
    pendingMessageIds.clear();
    clearAllPendingDisplayedMessageRefreshes();
    restoreAll();
    void reapply().catch(error => {
      console.error(`${LOG_PREFIX} 全量同步失败`, error);
    });
  };

  const stopList: Array<() => void> = [];
  const pagehideNs = `.TH_user_name_replace_${getScriptId()}`;
  let floatingUi: ReturnType<typeof buildFloatingUi> | null = null;

  const ensureFloatingUi = () => {
    if (floatingUi) return floatingUi;
    floatingUi = buildFloatingUi(getSettings, setSettings, reapply);
    return floatingUi;
  };

  const destroyFloatingUi = () => {
    floatingUi?.destroy();
    floatingUi = null;
  };

  const disablePersistentContentSync = (): Settings | null => {
    const current = getSettings();
    if (!current.replace_message_content) return null;

    const next = SettingsSchema.parse({
      ...current,
      replace_message_content: false,
    });
    setSettings(next);
    floatingUi?.refresh();
    return current;
  };

  const restoreAndDisablePersistentContentSync = async (reason: string) => {
    const restoreSettings = disablePersistentContentSync();
    if (!restoreSettings) return;

    try {
      await restoreAllPersistentMessageContent(restoreSettings);
      console.info(`${LOG_PREFIX} ${reason}，已关闭正文同步并恢复原文`);
    } catch (error) {
      console.error(`${LOG_PREFIX} ${reason}时恢复正文失败`, error);
    }
  };

  const handleChatChanged = () => {
    void (async () => {
      await restoreAndDisablePersistentContentSync('切换聊天');
      if (destroyed) return;
      rerenderAll();
    })().catch(error => {
      console.error(`${LOG_PREFIX} 切换聊天同步失败`, error);
    });
  };

  const toggleReplacementFromScriptButton = () => {
    const next = getToggledReplacementSettings(getSettings());
    setSettings(next);
    floatingUi?.refresh();
    void reapply().catch(error => {
      console.error(`${LOG_PREFIX} 快捷切换替换失败`, error);
    });
    toastr.info(next.enabled ? '名称替换：已开启' : '名称替换：已关闭');
  };

  const toggleContentSyncFromScriptButton = () => {
    const next = getToggledContentSyncSettings(getSettings());
    setSettings(next);
    floatingUi?.refresh();
    void reapply().catch(error => {
      console.error(`${LOG_PREFIX} 快捷切换正文同步失败`, error);
    });
    toastr.info(isContentSyncActive(next) ? '同步正文替换：已开启' : '同步正文替换：已关闭');
  };

  appendInexistentScriptButtons([
    { name: FLOATING_PANEL_BUTTON_NAME, visible: true },
    { name: REPLACEMENT_TOGGLE_BUTTON_NAME, visible: true },
    { name: CONTENT_SYNC_TOGGLE_BUTTON_NAME, visible: true },
  ]);
  stopList.push(
    eventOn(getButtonEvent(FLOATING_PANEL_BUTTON_NAME), () => {
      ensureFloatingUi().openSettings();
    }).stop,
  );
  stopList.push(eventOn(getButtonEvent(REPLACEMENT_TOGGLE_BUTTON_NAME), toggleReplacementFromScriptButton).stop);
  stopList.push(eventOn(getButtonEvent(CONTENT_SYNC_TOGGLE_BUTTON_NAME), toggleContentSyncFromScriptButton).stop);

  // 设置面板始终保留，悬浮窗则由 fab_enabled 控制；关闭后仍可通过脚本按钮重新打开设置。
  ensureFloatingUi();

  // 纯显示层替换：仅改 DOM，不改聊天数据
  stopList.push(
    eventMakeLast(tavern_events.USER_MESSAGE_RENDERED, (message_id: number) => {
      scheduleApplyToMessage(message_id);
    }).stop,
  );

  stopList.push(
    eventMakeLast(tavern_events.CHARACTER_MESSAGE_RENDERED, (message_id: number) => {
      scheduleApplyToMessage(message_id);
    }).stop,
  );

  stopList.push(
    eventMakeLast(tavern_events.MESSAGE_UPDATED, (message_id: number) => {
      scheduleApplyToMessage(message_id);
    }).stop,
  );

  stopList.push(
    eventMakeLast(tavern_events.MESSAGE_SWIPED, (message_id: number) => {
      scheduleApplyToMessage(message_id);
    }).stop,
  );

  // 气泡脚本会重建正文 DOM；它完成后再补一次纯显示层替换，避免生成新正文时名称被覆盖回原样。
  stopList.push(
    eventMakeLast(FHB_MESSAGE_RENDERED_EVENT, (message_id: number) => {
      if (destroyed || !isValidMessageId(message_id)) return;
      setTimeout(() => {
        if (!destroyed) applyToMessageId(message_id, getSettings());
      }, 0);
    }).stop,
  );

  stopList.push(
    eventOn(tavern_events.MESSAGE_DELETED, () => {
      rerenderAll();
    }).stop,
  );

  stopList.push(
    eventOn(tavern_events.MESSAGE_SWIPE_DELETED, (event_data: { messageId: number }) => {
      scheduleApplyToMessage(event_data.messageId);
    }).stop,
  );

  stopList.push(
    eventOn(tavern_events.MORE_MESSAGES_LOADED, () => {
      void reapply().catch(error => {
        console.error(`${LOG_PREFIX} 历史消息同步失败`, error);
      });
    }).stop,
  );

  stopList.push(eventOn(tavern_events.CHAT_CHANGED, handleChatChanged).stop);

  void reapply().catch(error => {
    console.error(`${LOG_PREFIX} 初始化同步失败`, error);
  });

  const cleanup = () => {
    if (destroyed) return;
    void restoreAndDisablePersistentContentSync('卸载脚本');
    destroyed = true;
    for (const stop of stopList) stop();
    pendingMessageIds.clear();
    clearAllPendingDisplayedMessageRefreshes();
    nestedMessageIframeMountObserver?.disconnect();
    nestedMessageIframeMountObserver = null;
    destroyNestedIframeDisplayEnhancements(true);
    echoTheaterEnhancer.destroy(true);
    restoreAll();
    destroyFloatingUi();
    $(window).off(`pagehide${pagehideNs}`);
    console.info(`${LOG_PREFIX} 已卸载`);
  };

  $(window).on(`pagehide${pagehideNs}`, cleanup);
}

$(() => {
  errorCatched(init)();
});
