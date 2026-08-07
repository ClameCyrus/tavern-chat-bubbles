<script setup lang="ts">
import {
  APPEARANCE_ACTORS,
  DECO_ACTORS,
  DECO_CORNERS,
  createAppearanceExport,
  normalizeAppearanceConfig,
  parseAppearanceConfigText,
  type AppearanceActor,
  type AppearanceConfig,
  type DecoActor,
  type DecoCorner,
} from './appearance-config';
import ColorField from './ColorField.vue';
import ImageField from './ImageField.vue';

interface PanelApi {
  load: () => Promise<{ book: string; config: AppearanceConfig }>;
  save: (config: AppearanceConfig) => Promise<{ book: string }>;
  close: () => void;
}

const props = defineProps<{ api: PanelApi }>();
const config = ref<AppearanceConfig>(normalizeAppearanceConfig({}));
const book = ref('');
const busy = ref(false);
const dirty = ref(false);
const message = ref('正在读取世界书…');
const messageKind = ref<'info' | 'success' | 'error'>('info');
const importRef = ref<HTMLInputElement | null>(null);
const overlayRef = ref<HTMLElement | null>(null);
const prefersDark = ref(false);
let themeObserver: MutationObserver | null = null;
let themeMedia: MediaQueryList | null = null;
let syncThemeState: (() => void) | null = null;
let ready = false;

const actorLabels: Record<AppearanceActor, string> = { user: '玩家', char: '主角色', npc: 'NPC' };
const decoActorLabels: Record<DecoActor, string> = { all: '全部兜底', user: '玩家', char: '主角色', npc: 'NPC' };
const cornerLabels: Record<DecoCorner, string> = { tl: '左上', tr: '右上', bl: '左下', br: '右下' };
const borderStyles = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'none', 'slash'];

watch(config, () => {
  if (ready) dirty.value = true;
}, { deep: true });

function notify(text: string, kind: 'info' | 'success' | 'error' = 'info') {
  message.value = text;
  messageKind.value = kind;
}

async function load() {
  busy.value = true;
  try {
    const result = await props.api.load();
    ready = false;
    config.value = normalizeAppearanceConfig(result.config);
    book.value = result.book;
    dirty.value = false;
    notify(`已读取世界书「${result.book}」`, 'success');
    await nextTick();
    ready = true;
  } catch (error) {
    notify(error instanceof Error ? error.message : '读取世界书失败。', 'error');
  } finally {
    busy.value = false;
  }
}

async function save() {
  busy.value = true;
  try {
    const result = await props.api.save(normalizeAppearanceConfig(config.value));
    book.value = result.book;
    dirty.value = false;
    notify(`已保存到世界书「${result.book}」并应用`, 'success');
  } catch (error) {
    notify(error instanceof Error ? error.message : '保存配置失败。', 'error');
  } finally {
    busy.value = false;
  }
}

function addNpcAvatar() {
  config.value.npc_avatars.push({ name: '', url: '' });
}

function addNpcAlias() {
  config.value.npc_aliases.push({ canonical: '', aliases: '' });
}

function exportConfig() {
  const blob = new Blob([JSON.stringify(createAppearanceExport(config.value), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `聊天气泡外观配置-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  notify('配置已导出。', 'success');
}

async function importConfig(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    let next: AppearanceConfig;
    try {
      next = normalizeAppearanceConfig(JSON.parse(text));
    } catch {
      next = parseAppearanceConfigText(text);
    }
    config.value = next;
    notify(`已导入「${file.name}」，保存后才会写入世界书。`, 'success');
  } catch {
    notify('导入失败：文件不是有效的 JSON 或外观配置文本。', 'error');
  }
}

const previewDark = computed(() => config.value.theme === 'dark' || (config.value.theme === 'auto' && prefersDark.value));
const previewAccent = computed(() => previewDark.value
  ? (config.value.accent_dark || '#57a3c9')
  : (config.value.accent_light || '#2b6d8c'));
const previewAccent2 = computed(() => previewDark.value
  ? (config.value.accent2_dark || '#c9a45c')
  : (config.value.accent2_light || '#97722c'));
const previewTheme = computed(() => previewDark.value ? {
  bg: '#15181c', ink: '#eceae4', meta: 'rgba(236,234,228,.58)',
  userBg: 'linear-gradient(135deg,#22262c,#14171b)', userText: '#f2f0ea', userBorder: `color-mix(in srgb,${previewAccent2.value} 34%,transparent)`,
  charBg: 'linear-gradient(135deg,#1f2a31,#181d22 55%,#1e262c)', charText: '#eceae4', charBorder: `color-mix(in srgb,${previewAccent2.value} 44%,transparent)`,
  npcBg: '#1e2024', npcText: '#eceae4', npcBorder: 'rgba(236,234,228,.16)',
} : {
  bg: '#f6efe4', ink: '#1b1d20', meta: 'rgba(27,29,32,.58)',
  userBg: 'linear-gradient(135deg,#1d2126,#2a3038)', userText: '#f4f2ec', userBorder: `color-mix(in srgb,${previewAccent2.value} 34%,transparent)`,
  charBg: 'linear-gradient(135deg,#f2f8fb,#e9f1f6 55%,#f6fbfd)', charText: '#23262a', charBorder: `color-mix(in srgb,${previewAccent2.value} 48%,transparent)`,
  npcBg: '#fffdf8', npcText: '#23262a', npcBorder: 'rgba(27,29,32,.16)',
});

const previewSurfaceStyle = computed(() => ({
  ...(config.value.theme === 'auto'
    ? { background: 'var(--fhbc-preview-bg)', color: 'var(--fhbc-ink)' }
    : { background: previewTheme.value.bg, color: previewTheme.value.ink }),
  '--fhbc-preview-accent': previewAccent.value,
  '--fhbc-preview-accent2': previewAccent2.value,
}));

const previewMetaColor = computed(() => config.value.theme === 'auto'
  ? 'var(--fhbc-muted)'
  : previewTheme.value.meta);

const previewMessageStyle = computed(() => ({
  gap: `${config.value.message_gap}px`,
  margin: `${config.value.message_spacing}px 0`,
  zoom: String(config.value.message_scale),
}));

const previewAvatarStyle = computed(() => ({
  width: `${config.value.avatar_size}px`,
  height: `${config.value.avatar_size}px`,
}));

const previewColumnStyle = computed(() => ({
  maxWidth: `min(${config.value.bubble_max_width_percent}%, ${config.value.bubble_max_width_px}px)`,
}));

function normalizePreviewLength(value: string, property: 'border-width' | 'border-radius', fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return trimmed === '0' ? '0' : `${trimmed}px`;
  return CSS.supports(property, trimmed) ? trimmed : fallback;
}

function bubbleStyle(actor: AppearanceActor): Record<string, string> {
  const custom = config.value.bubble[actor];
  const theme = previewTheme.value;
  const prefix = actor === 'user' ? 'user' : actor === 'char' ? 'char' : 'npc';
  const background = custom.background || theme[`${prefix}Bg` as keyof typeof theme];
  const color = custom.text || theme[`${prefix}Text` as keyof typeof theme];
  const borderColor = custom.border || theme[`${prefix}Border` as keyof typeof theme];
  const slash = custom.border_style === 'slash';
  const style = {
    background,
    color,
    fontSize: `${config.value.bubble_font_size}px`,
    lineHeight: String(config.value.bubble_line_height),
    padding: `${config.value.bubble_padding_y}px ${config.value.bubble_padding_x}px`,
    borderColor,
    borderStyle: slash ? 'solid' : (custom.border_style || 'solid'),
    borderWidth: normalizePreviewLength(custom.border_width, 'border-width', '1px'),
    borderRadius: normalizePreviewLength(custom.border_radius, 'border-radius', '14px'),
  };
  const actorStyle = actor === 'char'
    ? { ...style, borderLeftWidth: '3px', borderLeftColor: custom.border || previewAccent.value }
    : style;
  if (slash) {
    return {
      ...actorStyle,
      borderImage: `repeating-linear-gradient(45deg,${borderColor} 0 6px,transparent 6px 12px) 1`,
    };
  }
  return actorStyle;
}

function avatarFor(actor: AppearanceActor): string {
  if (actor === 'user') return config.value.user_avatar;
  if (actor === 'char') return config.value.char_avatar;
  return config.value.npc_avatars[0]?.url || '';
}

function decoFor(actor: AppearanceActor, corner: DecoCorner): string {
  return config.value.deco[actor][corner] || config.value.deco.all[corner];
}

function decoStyle(corner: DecoCorner): Record<string, string> {
  const offset = config.value.deco_offset;
  const style: Record<string, string> = { width: config.value.deco_size || '32px' };
  if (corner.includes('t')) style.top = '0'; else style.bottom = '0';
  if (corner.includes('l')) style.left = '0'; else style.right = '0';
  const x = corner.includes('l') ? -offset : offset;
  const y = corner.includes('t') ? -offset : offset;
  style.transform = `translate(${x}%,${y}%)`;
  return style;
}

onMounted(() => {
  const panelDocument = overlayRef.value?.ownerDocument || document;
  const panelWindow = panelDocument.defaultView || window;
  themeMedia = panelWindow.matchMedia('(prefers-color-scheme: dark)');
  syncThemeState = () => {
    const hostTheme = panelDocument.documentElement.dataset.fhbcTheme;
    prefersDark.value = hostTheme ? hostTheme === 'dark' : Boolean(themeMedia?.matches);
  };
  syncThemeState();
  themeMedia.addEventListener?.('change', syncThemeState);
  themeObserver = new MutationObserver(syncThemeState);
  themeObserver.observe(panelDocument.documentElement, { attributes: true, attributeFilter: ['data-fhbc-theme'] });
  void load();
});

onUnmounted(() => {
  themeObserver?.disconnect();
  if (syncThemeState) themeMedia?.removeEventListener?.('change', syncThemeState);
});
</script>

<template>
  <div ref="overlayRef" class="fhbc-overlay" @mousedown.self="api.close">
    <main class="fhbc-panel" role="dialog" aria-modal="true" aria-label="聊天气泡外观配置">
      <header class="fhbc-header">
        <div>
          <p class="fhbc-eyebrow">CHAT BUBBLE STUDIO</p>
          <h1>外观配置面板</h1>
          <p class="fhbc-book">{{ book ? `当前世界书 · ${book}` : '正在定位当前世界书' }}</p>
        </div>
        <div class="fhbc-header-actions">
          <button type="button" class="fhbc-button ghost" :disabled="busy" @click="importRef?.click()">导入</button>
          <button type="button" class="fhbc-button ghost" :disabled="busy" @click="exportConfig">导出</button>
          <button type="button" class="fhbc-close" aria-label="关闭" @click="api.close">×</button>
          <input ref="importRef" class="fhbc-hidden" type="file" accept=".json,.txt,text/plain,application/json" @change="importConfig" />
        </div>
      </header>

      <div class="fhbc-scroll">
        <p class="fhbc-notice" :class="messageKind">{{ message }}</p>

        <details class="fhbc-section">
          <summary>基础主题与配色</summary>
          <div class="fhbc-section-body">
            <div class="fhbc-grid cols-3">
              <label class="fhbc-field"><span>配色模式</span><select v-model="config.theme" class="fhbc-input"><option value="auto">跟随酒馆</option><option value="dark">深色</option><option value="light">浅色</option></select></label>
              <label class="fhbc-field"><span>流式渲染</span><select v-model="config.stream_mode" class="fhbc-input"><option value="defer">生成后渲染（推荐）</option><option value="live">边生成边渲染</option></select></label>
              <label class="fhbc-field"><span>折叠起始条数</span><input v-model.number="config.collapse_min" class="fhbc-input" type="number" min="1" max="99" /></label>
            </div>
            <div class="fhbc-grid cols-2">
              <ColorField v-model="config.accent_dark" label="深色 · 主色" fallback="#57a3c9" />
              <ColorField v-model="config.accent2_dark" label="深色 · 点缀色" fallback="#c9a45c" />
              <ColorField v-model="config.accent_light" label="浅色 · 主色" fallback="#2b6d8c" />
              <ColorField v-model="config.accent2_light" label="浅色 · 点缀色" fallback="#97722c" />
            </div>
          </div>
        </details>

        <details class="fhbc-section">
          <summary>气泡样式</summary>
          <div class="fhbc-section-body">
            <article v-for="actor in APPEARANCE_ACTORS" :key="actor" class="fhbc-subcard">
              <h3>{{ actorLabels[actor] }}</h3>
              <div class="fhbc-grid cols-3">
                <ColorField v-model="config.bubble[actor].background" label="背景" :fallback="actor === 'user' ? '#252a31' : '#eef5f8'" />
                <ColorField v-model="config.bubble[actor].text" label="文字" :fallback="actor === 'user' ? '#f4f2ec' : '#23262a'" />
                <ColorField v-model="config.bubble[actor].border" label="边框" fallback="#97722c" />
                <label class="fhbc-field"><span>边框样式</span><select v-model="config.bubble[actor].border_style" class="fhbc-input"><option value="">默认</option><option v-for="style in borderStyles" :key="style" :value="style">{{ style }}</option></select></label>
                <label class="fhbc-field"><span>边框粗细</span><input v-model="config.bubble[actor].border_width" class="fhbc-input" placeholder="如 1.5px" /></label>
                <label class="fhbc-field"><span>气泡圆角</span><input v-model="config.bubble[actor].border_radius" class="fhbc-input" placeholder="如 14px；0 为直角" /></label>
              </div>
            </article>
          </div>
        </details>

        <details class="fhbc-section">
          <summary>尺寸与排版</summary>
          <div class="fhbc-section-body">
            <div class="fhbc-grid cols-3">
              <label class="fhbc-field wide"><span>整体缩放：{{ Math.round(config.message_scale * 100) }}%</span><input v-model.number="config.message_scale" class="fhbc-range" type="range" min="0.5" max="2" step="0.05" /><small>同时缩放气泡、头像、名称及特殊消息</small></label>
              <label class="fhbc-field"><span>正文字号（px）</span><input v-model.number="config.bubble_font_size" class="fhbc-input" type="number" min="8" max="40" step="0.5" /></label>
              <label class="fhbc-field"><span>行高（倍数）</span><input v-model.number="config.bubble_line_height" class="fhbc-input" type="number" min="1" max="3" step="0.05" /></label>
              <label class="fhbc-field"><span>水平内边距（px）</span><input v-model.number="config.bubble_padding_x" class="fhbc-input" type="number" min="0" max="48" step="1" /></label>
              <label class="fhbc-field"><span>垂直内边距（px）</span><input v-model.number="config.bubble_padding_y" class="fhbc-input" type="number" min="0" max="48" step="1" /></label>
              <label class="fhbc-field"><span>最大宽度比例（%）</span><input v-model.number="config.bubble_max_width_percent" class="fhbc-input" type="number" min="30" max="100" step="1" /></label>
              <label class="fhbc-field"><span>最大宽度上限（px）</span><input v-model.number="config.bubble_max_width_px" class="fhbc-input" type="number" min="160" max="1200" step="10" /></label>
              <label class="fhbc-field"><span>头像尺寸（px）</span><input v-model.number="config.avatar_size" class="fhbc-input" type="number" min="20" max="120" step="1" /></label>
              <label class="fhbc-field"><span>头像与气泡间距（px）</span><input v-model.number="config.message_gap" class="fhbc-input" type="number" min="0" max="48" step="1" /></label>
              <label class="fhbc-field"><span>消息上下间距（px）</span><input v-model.number="config.message_spacing" class="fhbc-input" type="number" min="0" max="80" step="1" /></label>
            </div>
          </div>
        </details>

        <details class="fhbc-section">
          <summary>头像与本地图片</summary>
          <div class="fhbc-section-body">
            <ImageField v-model="config.user_avatar" label="玩家头像" @error="text => notify(text, 'error')" />
            <ImageField v-model="config.char_avatar" label="主角色头像" @error="text => notify(text, 'error')" />
            <article class="fhbc-subcard">
              <div class="fhbc-row-head"><h3>NPC 头像</h3><button type="button" class="fhbc-mini-button" @click="addNpcAvatar">＋ 添加 NPC</button></div>
              <div v-if="!config.npc_avatars.length" class="fhbc-empty">尚未设置 NPC 头像。</div>
              <div v-for="(item, index) in config.npc_avatars" :key="index" class="fhbc-dynamic-row">
                <input v-model="item.name" class="fhbc-input fhbc-name-input" placeholder="NPC 名称" />
                <ImageField v-model="item.url" :label="item.name || `NPC ${index + 1}`" @error="text => notify(text, 'error')" />
                <button type="button" class="fhbc-icon-button" title="删除" @click="config.npc_avatars.splice(index, 1)">×</button>
              </div>
            </article>
          </div>
        </details>

        <details class="fhbc-section">
          <summary>四角装饰图片</summary>
          <div class="fhbc-section-body">
            <div class="fhbc-grid cols-3">
              <label class="fhbc-field"><span>装饰宽度</span><input v-model="config.deco_size" class="fhbc-input" placeholder="如 40px；留空自适应" /></label>
              <label class="fhbc-field wide"><span>外移比例：{{ config.deco_offset }}</span><input v-model.number="config.deco_offset" class="fhbc-range" type="range" min="-100" max="100" step="1" /><small>负值向内，正值向外</small></label>
            </div>
            <article v-for="actor in DECO_ACTORS" :key="actor" class="fhbc-subcard">
              <h3>{{ decoActorLabels[actor] }}</h3>
              <div class="fhbc-grid cols-2">
                <ImageField v-for="corner in DECO_CORNERS" :key="corner" v-model="config.deco[actor][corner]" :label="cornerLabels[corner]" @error="text => notify(text, 'error')" />
              </div>
            </article>
          </div>
        </details>

        <details class="fhbc-section">
          <summary>媒体、别名与高级选项</summary>
          <div class="fhbc-section-body">
            <div class="fhbc-grid cols-3">
              <label class="fhbc-field"><span>表情包宽度</span><input v-model="config.sticker_size" class="fhbc-input" placeholder="如 120px" /></label>
              <label class="fhbc-field"><span>image 自动生图</span><select v-model="config.image_auto_generate" class="fhbc-input"><option :value="true">开启</option><option :value="false">关闭（仅显示文字）</option></select></label>
              <label class="fhbc-field"><span>随机图片宽度</span><input v-model.number="config.image_width" class="fhbc-input" type="number" min="32" max="4096" :disabled="!config.image_auto_generate" /></label>
              <label class="fhbc-field"><span>随机图片高度</span><input v-model.number="config.image_height" class="fhbc-input" type="number" min="32" max="4096" :disabled="!config.image_auto_generate" /></label>
              <label class="fhbc-field wide"><span>主角色别名</span><input v-model="config.char_aliases" class="fhbc-input" placeholder="多个别名用逗号分隔" /></label>
            </div>
            <article class="fhbc-subcard">
              <div class="fhbc-row-head"><h3>NPC 别名</h3><button type="button" class="fhbc-mini-button" @click="addNpcAlias">＋ 添加别名组</button></div>
              <div v-if="!config.npc_aliases.length" class="fhbc-empty">尚未设置 NPC 别名。</div>
              <div v-for="(item, index) in config.npc_aliases" :key="index" class="fhbc-alias-row">
                <input v-model="item.canonical" class="fhbc-input" placeholder="标准名" />
                <input v-model="item.aliases" class="fhbc-input" placeholder="别名1, 别名2" />
                <button type="button" class="fhbc-icon-button" title="删除" @click="config.npc_aliases.splice(index, 1)">×</button>
              </div>
            </article>
          </div>
        </details>

        <section class="fhbc-preview-section">
          <div class="fhbc-preview-heading"><div><p class="fhbc-eyebrow">LIVE PREVIEW</p><h2>气泡预览</h2></div><span>修改会即时显示在这里</span></div>
          <div class="fhbc-preview" :style="previewSurfaceStyle">
            <div v-for="actor in APPEARANCE_ACTORS" :key="actor" class="fhbc-preview-message" :class="{ user: actor === 'user' }" :style="previewMessageStyle">
              <div class="fhbc-preview-avatar" :style="previewAvatarStyle">
                <img v-if="avatarFor(actor)" :src="avatarFor(actor)" alt="" />
                <span v-else>{{ actor === 'user' ? '我' : actor === 'char' ? '角' : 'N' }}</span>
              </div>
              <div class="fhbc-preview-col" :style="previewColumnStyle">
                <div class="fhbc-preview-meta" :style="{ color: previewMetaColor }">{{ actorLabels[actor] }} · 21:18</div>
                <div class="fhbc-preview-wrap">
                  <div class="fhbc-preview-bubble" :style="bubbleStyle(actor)">{{ actor === 'user' ? '好，马上来。' : actor === 'char' ? '现在' : '收到。' }}</div>
                  <img v-for="corner in DECO_CORNERS" v-show="decoFor(actor, corner)" :key="corner" class="fhbc-preview-deco" :src="decoFor(actor, corner)" alt="" :style="decoStyle(corner)" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer class="fhbc-footer">
        <span v-if="dirty" class="fhbc-dirty">● 有尚未保存的修改</span><span v-else class="fhbc-saved">配置已同步</span>
        <div>
          <button type="button" class="fhbc-button ghost" :disabled="busy" @click="load">重新读取</button>
          <button type="button" class="fhbc-button primary" :disabled="busy" @click="save">{{ busy ? '处理中…' : '保存到世界书并应用' }}</button>
        </div>
      </footer>
    </main>
  </div>
</template>

<style>
:root{--fhbc-ink:var(--SmartThemeBodyColor,#e9edf2);--fhbc-muted:var(--SmartThemeEmColor,color-mix(in srgb,var(--fhbc-ink) 62%,transparent));--fhbc-accent:var(--SmartThemeQuoteColor,#75bad8);--fhbc-surface:var(--SmartThemeBlurTintColor,#121a22);--fhbc-chat:var(--SmartThemeChatTintColor,var(--fhbc-surface));--fhbc-border:var(--SmartThemeBorderColor,color-mix(in srgb,var(--fhbc-ink) 16%,transparent));--fhbc-panel:color-mix(in srgb,var(--fhbc-surface) 96%,var(--fhbc-ink) 4%);--fhbc-control:color-mix(in srgb,var(--fhbc-surface) 72%,transparent);--fhbc-soft:color-mix(in srgb,var(--fhbc-accent) 7%,transparent);--fhbc-accent-soft:color-mix(in srgb,var(--fhbc-accent) 16%,transparent);--fhbc-preview-bg:color-mix(in srgb,var(--fhbc-surface) 82%,var(--fhbc-chat))}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100dvh;max-height:100dvh;overflow:hidden;background:transparent}button,input,select{font:inherit}
.fhbc-overlay{width:100%;height:100%;padding:clamp(10px,3vw,28px);display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--fhbc-surface) 42%,transparent);backdrop-filter:blur(10px);font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif;color:var(--fhbc-ink)}
.fhbc-panel{width:min(1080px,100%);height:min(880px,calc(100dvh - clamp(20px,6vw,56px)));min-height:0;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--fhbc-border);border-radius:22px;background:var(--fhbc-panel);box-shadow:0 32px 90px rgba(0,0,0,.48),inset 0 1px color-mix(in srgb,var(--fhbc-ink) 8%,transparent)}
.fhbc-header,.fhbc-footer{flex:none;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 22px;background:color-mix(in srgb,var(--fhbc-surface) 82%,transparent)}.fhbc-header{border-bottom:1px solid var(--fhbc-border)}.fhbc-footer{border-top:1px solid var(--fhbc-border)}
.fhbc-header h1,.fhbc-preview-heading h2{margin:2px 0 0;font-family:Georgia,'Songti SC',serif;font-weight:600;letter-spacing:.04em}.fhbc-header h1{font-size:24px}.fhbc-preview-heading h2{font-size:20px}.fhbc-eyebrow{margin:0;color:var(--fhbc-accent);font-size:10px;letter-spacing:.24em}.fhbc-book{margin:5px 0 0;color:var(--fhbc-muted);font-size:12px}.fhbc-header-actions{display:flex;align-items:center;gap:8px}
.fhbc-scroll{min-height:0;flex:1;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch;padding:18px 22px 28px;scrollbar-width:none;-ms-overflow-style:none}.fhbc-scroll::-webkit-scrollbar{display:none;width:0;height:0}.fhbc-notice{position:sticky;top:0;z-index:5;margin:0 0 12px;padding:9px 12px;border:1px solid color-mix(in srgb,var(--fhbc-accent) 36%,transparent);border-radius:10px;background:color-mix(in srgb,var(--fhbc-surface) 94%,transparent);color:var(--fhbc-accent);font-size:12px;box-shadow:0 6px 16px rgba(0,0,0,.18)}.fhbc-notice.success{border-color:rgba(42,155,101,.42);color:#62c995}.fhbc-notice.error{border-color:rgba(218,70,88,.45);color:#ee7180}
.fhbc-section{margin-bottom:12px;overflow:hidden;border:1px solid var(--fhbc-border);border-radius:14px;background:var(--fhbc-soft)}.fhbc-section>summary{padding:14px 16px;cursor:pointer;list-style:none;font-family:Georgia,'Songti SC',serif;font-size:16px;color:var(--fhbc-ink)}.fhbc-section>summary::-webkit-details-marker{display:none}.fhbc-section>summary::after{content:'＋';float:right;color:var(--fhbc-accent)}.fhbc-section[open]>summary::after{content:'－'}.fhbc-section[open]>summary{border-bottom:1px solid var(--fhbc-border)}.fhbc-section-body{padding:16px;display:flex;flex-direction:column;gap:14px}
.fhbc-grid{display:grid;gap:12px}.fhbc-grid.cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.fhbc-grid.cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.fhbc-field,.fhbc-color-field,.fhbc-image-field{display:flex;flex-direction:column;gap:7px;min-width:0;color:var(--fhbc-muted);font-size:12px}.fhbc-field.wide{grid-column:span 2}.fhbc-color-control,.fhbc-image-control{display:flex;align-items:center;gap:7px;min-width:0}
.fhbc-input{width:100%;min-width:0;height:37px;padding:0 10px;color:var(--fhbc-ink);background:var(--fhbc-control);border:1px solid var(--fhbc-border);border-radius:9px;outline:none;transition:.2s}.fhbc-input::placeholder{color:var(--fhbc-muted);opacity:.72}.fhbc-input:focus{border-color:var(--fhbc-accent);box-shadow:0 0 0 3px var(--fhbc-accent-soft)}select.fhbc-input{cursor:pointer}.fhbc-color-picker{width:42px;height:37px;padding:3px;flex:none;border:1px solid var(--fhbc-border);border-radius:9px;background:var(--fhbc-control);cursor:pointer}.fhbc-range{width:100%;accent-color:var(--fhbc-accent)}.fhbc-field small{color:var(--fhbc-muted)}
.fhbc-subcard{padding:13px;border:1px solid var(--fhbc-border);border-radius:12px;background:color-mix(in srgb,var(--fhbc-surface) 28%,transparent)}.fhbc-subcard h3{margin:0 0 11px;font-size:13px;color:var(--fhbc-ink)}.fhbc-row-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.fhbc-row-head h3{margin:0}.fhbc-dynamic-row{display:grid;grid-template-columns:150px minmax(0,1fr) 32px;align-items:end;gap:10px;margin-top:12px}.fhbc-alias-row{display:grid;grid-template-columns:minmax(100px,.55fr) minmax(160px,1fr) 32px;gap:10px;margin-top:10px}.fhbc-empty{padding:12px;color:var(--fhbc-muted);text-align:center;font-size:12px;border:1px dashed var(--fhbc-border);border-radius:9px}
.fhbc-image-head{display:flex;justify-content:space-between;gap:8px}.fhbc-local-tag{color:#42b77e;font-size:10px}.fhbc-image-preview{width:37px;height:37px;display:grid;place-items:center;flex:none;overflow:hidden;border:1px solid var(--fhbc-border);border-radius:9px;background:var(--fhbc-control);color:var(--fhbc-muted);font-size:10px}.fhbc-image-preview img{width:100%;height:100%;object-fit:cover}
.fhbc-button,.fhbc-mini-button,.fhbc-icon-button,.fhbc-close{border:1px solid var(--fhbc-border);color:var(--fhbc-ink);background:var(--fhbc-soft);cursor:pointer;transition:.2s}.fhbc-button:hover,.fhbc-mini-button:hover,.fhbc-icon-button:hover,.fhbc-close:hover{border-color:var(--fhbc-accent);background:var(--fhbc-accent-soft)}.fhbc-button{height:37px;padding:0 14px;border-radius:9px}.fhbc-button.primary{border-color:var(--fhbc-accent);background:var(--fhbc-accent);color:var(--fhbc-surface);font-weight:700}.fhbc-button:disabled{opacity:.5;cursor:wait}.fhbc-mini-button{height:32px;padding:0 10px;border-radius:8px;white-space:nowrap;font-size:11px}.fhbc-icon-button,.fhbc-close{display:grid;place-items:center;padding:0;border-radius:8px}.fhbc-icon-button{width:32px;height:37px;font-size:18px}.fhbc-close{width:37px;height:37px;font-size:24px}.fhbc-hidden{display:none}
.fhbc-preview-section{margin-top:20px}.fhbc-preview-heading{display:flex;align-items:end;justify-content:space-between;margin-bottom:10px}.fhbc-preview-heading span{color:var(--fhbc-muted);font-size:11px}.fhbc-preview{min-height:300px;padding:22px clamp(14px,4vw,38px);border:1px solid var(--fhbc-border);border-radius:16px;transition:.25s}.fhbc-preview-message{display:flex;align-items:flex-start;gap:11px;margin:16px 0}.fhbc-preview-message.user{flex-direction:row-reverse}.fhbc-preview-avatar{width:42px;height:42px;display:grid;place-items:center;flex:none;overflow:hidden;border:1.5px solid var(--fhbc-preview-accent2,#c9a45c);border-radius:50%;background:linear-gradient(135deg,var(--fhbc-preview-accent,#367793),color-mix(in srgb,var(--fhbc-preview-accent,#367793) 28%,#111));box-shadow:0 3px 12px rgba(0,0,0,.28),0 0 0 2px color-mix(in srgb,var(--fhbc-preview-accent) 28%,transparent);color:#fff;font-family:Georgia,serif;transition:.2s}.fhbc-preview-avatar img{width:100%;height:100%;object-fit:cover}.fhbc-preview-col{display:flex;flex-direction:column;align-items:flex-start;gap:5px;max-width:70%}.fhbc-preview-message.user .fhbc-preview-col{align-items:flex-end}.fhbc-preview-meta{font-size:10px;letter-spacing:.12em;text-transform:uppercase}.fhbc-preview-wrap{position:relative;width:fit-content;max-width:100%}.fhbc-preview-bubble{width:fit-content;max-width:100%;padding:10px 14px;border-radius:14px;line-height:1.55;word-break:break-word;box-shadow:0 8px 20px rgba(0,0,0,.2);transition:.2s}.fhbc-preview-deco{position:absolute;height:auto;z-index:2;pointer-events:none;filter:drop-shadow(0 3px 5px rgba(0,0,0,.25))}
.fhbc-dirty{color:#d79630;font-size:12px}.fhbc-saved{color:#42b77e;font-size:12px}.fhbc-footer>div{display:flex;gap:9px}
@media(max-width:720px){.fhbc-overlay{padding:0}.fhbc-panel{height:100dvh;max-height:100dvh;border-radius:0;border-left:0;border-right:0}.fhbc-header,.fhbc-footer{padding:13px 14px}.fhbc-header h1{font-size:20px}.fhbc-book{max-width:46vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fhbc-header-actions .fhbc-button{padding:0 9px}.fhbc-scroll{padding:12px 12px 24px}.fhbc-grid.cols-2,.fhbc-grid.cols-3{grid-template-columns:1fr}.fhbc-field.wide{grid-column:auto}.fhbc-dynamic-row{grid-template-columns:1fr 32px}.fhbc-dynamic-row>.fhbc-name-input{grid-column:1/-1}.fhbc-alias-row{grid-template-columns:1fr 32px}.fhbc-alias-row>input:nth-child(2){grid-column:1/2}.fhbc-footer>div{flex-direction:row}.fhbc-button.primary{min-width:176px}.fhbc-preview{padding:18px 12px}.fhbc-preview-col{max-width:76%}}
@media(max-width:480px){.fhbc-footer>.fhbc-dirty,.fhbc-footer>.fhbc-saved{display:none}.fhbc-footer>div{width:100%}.fhbc-footer .fhbc-button{flex:1;padding:0 8px}.fhbc-button.primary{min-width:0}}
</style>
