type PseudoKind = 'before' | 'after';
type StyleRoot = Document | ShadowRoot;

const GENERATED_TEXT_ATTRIBUTE = 'data-th-user-name-generated-text';
const GENERATED_STYLE_ATTRIBUTE = 'data-th-user-name-generated-style';
const GENERATED_HOST_ATTRIBUTES = {
  before: 'data-th-user-name-generated-before',
  after: 'data-th-user-name-generated-after',
} as const;
const generatedStyles = new WeakMap<StyleRoot, HTMLStyleElement>();
const generatedSelectorCache = new WeakMap<StyleRoot, { signature: string; selectors: Map<string, Set<PseudoKind>> }>();

/** 只接受实际显示的 CSS 字符串；图标、计数器、图片等 content 保持原样。 */
export function readGeneratedContent(value: string): string | null {
  let text = '';
  let index = 0;
  let found = false;
  while (index < value.length) {
    while (/\s/.test(value[index] ?? '') && index < value.length) index++;
    if (index === value.length || value[index] === '/') break;
    const quote = value[index];
    if (quote !== '"' && quote !== "'") return null;
    index++;
    found = true;
    let closed = false;
    while (index < value.length) {
      const char = value[index++];
      if (char === quote) {
        closed = true;
        break;
      }
      if (char !== '\\') {
        text += char;
        continue;
      }
      const escape = value.slice(index).match(/^([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?|^(\r\n|[\n\f\r])|^([\s\S])/i);
      if (!escape) return null;
      index += escape[0].length;
      if (escape[1]) {
        const point = Number.parseInt(escape[1], 16);
        text += String.fromCodePoint(
          point === 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff) ? 0xfffd : point,
        );
      } else if (escape[3]) {
        text += escape[3];
      }
    }
    if (!closed) return null;
  }
  return found ? text : null;
}

function getStyleRoot(root: HTMLElement): StyleRoot | null {
  const scope = root.getRootNode();
  if (scope.nodeType === 9 || (scope.nodeType === 11 && 'host' in scope)) return scope as StyleRoot;
  return null;
}

function ensureGeneratedStyle(scope: StyleRoot, doc: Document) {
  const existing = generatedStyles.get(scope);
  if (existing?.isConnected) return;
  const style = doc.createElement('style');
  style.setAttribute(GENERATED_STYLE_ATTRIBUTE, '');
  style.textContent =
    `[${GENERATED_TEXT_ATTRIBUTE}]{all:initial!important;}\n` +
    (['before', 'after'] as const)
      .map(
        pseudo =>
          `:is(#TH-user-name-generated-priority, [${GENERATED_HOST_ATTRIBUTES[pseudo]}])::${pseudo}{content:none!important;}`,
      )
      .join('\n');
  if (scope.nodeType === 9) ((scope as Document).head ?? (scope as Document).documentElement).appendChild(style);
  else scope.appendChild(style);
  generatedStyles.set(scope, style);
}

export function restoreGeneratedContent(root: HTMLElement) {
  root.querySelectorAll(`[${GENERATED_TEXT_ATTRIBUTE}]`).forEach(element => element.remove());
  for (const attribute of Object.values(GENERATED_HOST_ATTRIBUTES)) {
    if (root.hasAttribute(attribute)) root.removeAttribute(attribute);
    root.querySelectorAll(`[${attribute}]`).forEach(element => element.removeAttribute(attribute));
  }
  const scope = getStyleRoot(root);
  if (!scope || scope.querySelector(`[${GENERATED_HOST_ATTRIBUTES.before}], [${GENERATED_HOST_ATTRIBUTES.after}]`))
    return;
  generatedStyles.get(scope)?.remove();
  generatedStyles.delete(scope);
}

const PSEUDO_TEXT_STYLES = [
  'display',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-variant',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'color',
  'white-space',
  'vertical-align',
  'text-align',
  'text-decoration',
  'text-transform',
  'direction',
  'writing-mode',
] as const;
const PSEUDO_LAYOUT_DEFAULTS: Record<string, string> = {
  position: 'static',
  top: 'auto',
  right: 'auto',
  bottom: 'auto',
  left: 'auto',
  'z-index': 'auto',
  float: 'none',
  clear: 'none',
  'box-sizing': 'content-box',
  width: 'auto',
  height: 'auto',
  'min-width': '0px',
  'min-height': '0px',
  'max-width': 'none',
  'max-height': 'none',
  'margin-top': '0px',
  'margin-right': '0px',
  'margin-bottom': '0px',
  'margin-left': '0px',
  'padding-top': '0px',
  'padding-right': '0px',
  'padding-bottom': '0px',
  'padding-left': '0px',
  'background-color': 'rgba(0, 0, 0, 0)',
  'background-image': 'none',
  opacity: '1',
  visibility: 'visible',
  transform: 'none',
  filter: 'none',
  'flex-grow': '0',
  'flex-shrink': '1',
  'flex-basis': 'auto',
  order: '0',
  'align-self': 'auto',
};

export function materializeGeneratedContent(
  root: HTMLElement,
  ruleSignature: string,
  hasMatch: (text: string) => boolean,
  shouldSkip: (element: HTMLElement) => boolean,
) {
  const scope = getStyleRoot(root);
  const view = root.ownerDocument.defaultView;
  if (!scope || !view) return;
  const cached = generatedSelectorCache.get(scope);
  const selectors = cached?.signature === ruleSignature ? cached.selectors : new Map<string, Set<PseudoKind>>();
  const readRules = (sheet: CSSStyleSheet) => {
    try {
      const visit = (rules: CSSRuleList) => {
        Array.from(rules).forEach(rule => {
          const styled = rule as CSSStyleRule;
          if (styled.selectorText && styled.style) {
            const value = styled.style.getPropertyValue('content');
            if (!value) return;
            const literal = readGeneratedContent(value);
            if (literal !== null && !hasMatch(literal)) return;
            if (literal === null && !/\b(?:attr|var)\(/i.test(value)) return;
            const pseudos = [...styled.selectorText.matchAll(/::?(before|after)\b/gi)];
            if (pseudos.length === 0) return;
            const selector = styled.selectorText.replace(/::?(before|after)\b/gi, '');
            const kinds = selectors.get(selector) ?? new Set<PseudoKind>();
            pseudos.forEach(match => kinds.add(match[1].toLowerCase() as PseudoKind));
            selectors.set(selector, kinds);
          } else if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
          else if ('styleSheet' in rule && (rule as CSSImportRule).styleSheet)
            readRules((rule as CSSImportRule).styleSheet!);
        });
      };
      if (!sheet.disabled) visit(sheet.cssRules);
    } catch {
      // 跨域样式表不允许读取 CSSOM；不改写其内容。
    }
  };
  if (cached?.signature !== ruleSignature) {
    [...Array.from(scope.styleSheets), ...scope.adoptedStyleSheets].forEach(readRules);
    generatedSelectorCache.set(scope, { signature: ruleSignature, selectors });
    // 同一轮多个楼层共享 CSS 扫描结果；下一轮重读，兼容插件动态修改样式表。
    view.queueMicrotask(() => generatedSelectorCache.delete(scope));
  }
  const candidates = new Map<HTMLElement, Set<PseudoKind>>();
  selectors.forEach((kinds, selector) => {
    try {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(selector));
      if (root.matches(selector)) elements.push(root);
      elements.forEach(element => {
        if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || shouldSkip(element)) return;
        const current = candidates.get(element) ?? new Set<PseudoKind>();
        kinds.forEach(kind => current.add(kind));
        candidates.set(element, current);
      });
    } catch {
      // 例如只适用于 Shadow DOM 的 :host 选择器，普通容器不能直接查询。
    }
  });
  const entries: Array<{ element: HTMLElement; pseudo: PseudoKind; text: string; style: CSSStyleDeclaration }> = [];
  candidates.forEach((kinds, element) => {
    kinds.forEach(pseudo => {
      if (element.hasAttribute(GENERATED_HOST_ATTRIBUTES[pseudo])) return;
      const style = view.getComputedStyle(element, `::${pseudo}`);
      const text = readGeneratedContent(style.content);
      if (style.display !== 'none' && text !== null && hasMatch(text)) entries.push({ element, pseudo, text, style });
    });
  });
  if (entries.length === 0) return;
  ensureGeneratedStyle(scope, root.ownerDocument);
  entries.forEach(({ element, pseudo, text, style }) => {
    const span = root.ownerDocument.createElement('span');
    span.setAttribute(GENERATED_TEXT_ATTRIBUTE, pseudo);
    PSEUDO_TEXT_STYLES.forEach(property =>
      span.style.setProperty(property, style.getPropertyValue(property), 'important'),
    );
    Object.entries(PSEUDO_LAYOUT_DEFAULTS).forEach(([property, fallback]) => {
      const value = style.getPropertyValue(property);
      if (value && value !== fallback) span.style.setProperty(property, value, 'important');
    });
    span.textContent = text;
    element.setAttribute(GENERATED_HOST_ATTRIBUTES[pseudo], '');
    if (pseudo === 'before') element.prepend(span);
    else element.append(span);
  });
}
