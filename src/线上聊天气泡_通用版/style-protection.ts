// 只增强气泡自己的规则；外部主题和状态栏的样式保持原样。
// display 的行内开关用于图片回退，opacity/transform 由动画控制，不能提升为 !important。
const INLINE_OR_ANIMATED = new Set(['display', 'opacity', 'transform']);

function splitCss(text: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '\\') {
      index++;
      continue;
    }
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (char === separator && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function scopeSelector(selector: string): string {
  selector = selector.trim();
  const pseudo = selector.match(/::[\w-]+$/)?.[0] ?? '';
  const target = pseudo ? selector.slice(0, -pseudo.length) : selector;
  return `#chat .mes .mes_text :is(${target})${pseudo}`;
}

export function protectBubbleStyles(css: string): string {
  // 模板中的叶子规则逐条增强，保留媒体条件与 keyframes。
  // 不经过 CSSOM 重写：含 var() 的复合声明在 CSSOM 中可能展开为空的长属性。
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, selector: string, declarations: string) => {
    if (!selector.includes('.fhb-')) return rule;
    const scoped = splitCss(selector, ',').map(scopeSelector).join(',');
    const protectedDeclarations = splitCss(declarations, ';')
      .map(declaration => {
        const colon = declaration.indexOf(':');
        if (colon < 0) return declaration;
        const property = declaration.slice(0, colon).trim();
        if (INLINE_OR_ANIMATED.has(property) || /!important\s*$/i.test(declaration)) return declaration;
        return `${declaration.trim()} !important`;
      })
      .join(';');
    return `${scoped}{${protectedDeclarations}}`;
  });
}
