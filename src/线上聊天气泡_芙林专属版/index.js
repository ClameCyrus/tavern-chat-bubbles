// ============================================================
// 芙林_聊天气泡_专属版 v12
// 变更：用户名替换在气泡渲染后自动补应用；消息编辑完成后可靠重渲染；用户气泡内文字左对齐
// v11：角标跟随气泡、短句自适应收缩、头像悬浮放大与透明头像回退修复
// 功能基线：通用版 v14.7 的单书相关部分（不含跨世界书去重与缺失条目分书写入）
// 皮肤：芙林专属玫瑰藤蔓框、丝绒金线气泡、玫瑰水印、火漆水印、名字玫瑰标记、红金调色
// 注入：单卡单书直写，无群聊闸门、无文件探测、不创建聊天书、不跨卡
// ============================================================
const FHB_STYLE_ID = 'fhb-style-flynn';
const FHB_MESSAGE_RENDERED_EVENT = 'fhb_message_rendered';

function initFlynnChatBubbles() {
  const CONF_VERSION = 'v15';

  const CONFIG = {
    // —— 以下带 * 的项均可被世界书「外观配置」条目覆盖，注释掉即回退到此处默认 ——
    USER_AVATAR: '', // *
    CHAR_AVATAR: '', // *
    NPC_AVATARS: {}, // *
    NPC_ALIASES: {}, // * npc_aliases.<标准名> = 别名1, 别名2

    // 【芙林专属】accent 系列映射丝绒红（red），accent2 系列映射鎏金（gold）
    ACCENT_DARK: '', // *
    ACCENT_LIGHT: '', // *
    ACCENT2_DARK: '', // *
    ACCENT2_LIGHT: '', // *

    // 【芙林专属】主角别名清单，配置条目里的 char_aliases 是追加，不会替换本清单
    charAliases: ['flynn', '芙林', 'red', '大少', '少爷', 'flynn harlow', '芙林·哈洛', '{{char}}', 'char'],
    charNameFallback: 'Char',
    CHAR_EXTRA_ALIASES: [], // *

    DECO: {}, // * deco.<user|char|npc|all>.<tl|tr|bl|br>
    DECO_SIZE: '', // * 装饰宽度
    DECO_OFFSET: '', // * 装饰外移比例 -100~100
    BUBBLE: {}, // * bubble.<user|char|npc>.<bg|tx|bd|bs|bw>

    STICKER_SIZE: '', // *
    theme: 'auto', // *
    imgW: 640, // *
    imgH: 400, // *
    collapseMin: 3, // *
    STREAM_MODE: 'defer', // * defer | live

    // —— 世界书注入（脚本级，不走配置条目）——
    AUTO_INJECT_WI: true,
    WI_TARGET: '', // 高级用户可强制指定这本世界书的书名
    WI_FORCE_UPDATE: true,
    WI_DEPTH: 0,
    WI_ORDER: 800,

    INJECT_STICKER_WI: true,
    INJECT_CONFIG_WI: true,
    STICKER_SYNC_NAMES: true,
    STICKER_MAP: {},

    types: [
      'text',
      'voice',
      'transfer',
      'redpacket',
      'image',
      'sticker',
      'call',
      'location',
      'file',
      'system',
      'typing',
    ],
    userAliases: ['user', '我', 'me', '{{user}}', '{{user}}'],
    // 【芙林专属】群名兜底关键词保留「赢家」
    groupHint: /群|组|队|聊|局|会|赢家|club|crew|squad|group|team|party|chat|room/i,
  };

  // 出厂快照：用于「注释掉配置即回退」
  const CONFIGURABLE_KEYS = [
    'USER_AVATAR',
    'CHAR_AVATAR',
    'NPC_AVATARS',
    'NPC_ALIASES',
    'ACCENT_DARK',
    'ACCENT_LIGHT',
    'ACCENT2_DARK',
    'ACCENT2_LIGHT',
    'CHAR_EXTRA_ALIASES',
    'DECO',
    'DECO_SIZE',
    'DECO_OFFSET',
    'BUBBLE',
    'STICKER_SIZE',
    'theme',
    'imgW',
    'imgH',
    'collapseMin',
    'STREAM_MODE',
  ];
  const FACTORY = {};
  CONFIGURABLE_KEYS.forEach(k => {
    const v = CONFIG[k];
    FACTORY[k] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
  });
  function resetConfigurables() {
    CONFIGURABLE_KEYS.forEach(k => {
      const v = FACTORY[k];
      CONFIG[k] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    });
  }

  let PW = window;
  let PD = document;
  try {
    if (window.parent && window.parent.document) {
      PW = window.parent;
      PD = window.parent.document;
    }
  } catch (e) {
    console.warn('[聊天气泡] 跨域受限，降级至当前环境。');
  }

  const ctx = { userName: '', charName: '', userAvatar: '', charAvatar: '' };
  const STK = { map: {}, loaded: false, book: '', busy: false, confVer: '', lastWrite: 0, quiet: 0 };
  const GEN = { active: false, timer: null, poller: null };

  // ---------- 基础工具 ----------
  function lowerName(n) {
    return (n || '').trim().toLowerCase();
  }
  function stripTags(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '');
  }

  function cleanName(s) {
    return stripTags(s)
      .replace(/&lt;|&gt;|&amp;lt;|&amp;gt;/gi, '')
      .replace(/[<>]/g, '')
      .replace(/^\s*{{\s*/, '')
      .replace(/\s*}}\s*$/, '')
      .trim();
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeHTML(s).replace(/"/g, '&quot;');
  }
  function attrRaw(s) {
    return String(s == null ? '' : s).replace(/"/g, '&quot;');
  }
  function unescapeText(s) {
    return String(s == null ? '' : s)
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }

  const escapeForST = str => {
    if (typeof str !== 'string') return str;
    return str.replace(/(\\+)?([|{}])/g, (m, slashes, char) => {
      const s = slashes || '';
      return s + s + '\\' + char;
    });
  };

  function toastMsg(text, sev) {
    if (typeof triggerSlash === 'function') triggerSlash(`/echo severity=${sev || 'info'} ${escapeForST(text)}`);
  }

  // ---------- 编辑与生成守卫 ----------
  function anyEditing() {
    try {
      return !!PD.getElementById('curEditTextarea');
    } catch (e) {
      return false;
    }
  }

  function isEditing(textEl) {
    try {
      if (!textEl) return true;
      if (textEl.querySelector('textarea')) return true;
      const mes = textEl.closest ? textEl.closest('.mes') : null;
      const ta = PD.getElementById('curEditTextarea');
      if (ta) {
        const editingMes = ta.closest ? ta.closest('.mes') : null;
        if (!mes || !editingMes || mes === editingMes) return true;
      }
      if (mes && mes.querySelector('#curEditTextarea')) return true;
    } catch (e) {}
    return false;
  }

  function streamMode() {
    return CONFIG.STREAM_MODE === 'live' ? 'live' : 'defer';
  }

  function isGenerating() {
    if (GEN.active) return true;
    try {
      const s = PD.getElementById('mes_stop');
      if (s && s.offsetParent !== null) return true;
    } catch (e) {}
    return false;
  }

  function lastMesText() {
    try {
      const el = PD.querySelector('#chat .mes.last_mes .mes_text');
      if (el) return el;
      const list = PD.querySelectorAll('#chat .mes .mes_text');
      return list.length ? list[list.length - 1] : null;
    } catch (e) {
      return null;
    }
  }

  // live 模式下的单次流式转换：该楼永久关闭入场动画，避免逐字重建时跳动
  function liveTick() {
    if (anyEditing()) return;
    const el = lastMesText();
    if (!el) return;
    el.dataset.fhbNoanim = '1';
    transformElement(el, { force: true });
    restickerAll();
  }

  // ---------- 名称解析 ----------
  function scrapeName(isUser) {
    try {
      const sels = [`#chat .mes[is_user="${isUser}"] .name_text`, `#chat .mes[is_user="${isUser}"] .ch_name`];
      for (const sel of sels) {
        const el = PD.querySelector(sel);
        if (!el) continue;
        const sp = el.querySelector('[data-th-user-name-original]');
        if (sp && sp.getAttribute('data-th-user-name-original')) {
          return sp.getAttribute('data-th-user-name-original').trim();
        }
        if (el.textContent.trim()) return el.textContent.trim();
      }
    } catch (e) {}
    return '';
  }

  function resolveNames() {
    try {
      const st = PW.SillyTavern;
      const c = st && typeof st.getContext === 'function' ? st.getContext() : null;
      if (c) {
        if (typeof c.name1 === 'string' && c.name1.trim()) ctx.userName = c.name1.trim();
        if (typeof c.name2 === 'string' && c.name2.trim()) ctx.charName = c.name2.trim();
      }
    } catch (e) {}
    try {
      if (!ctx.userName && typeof PW.name1 === 'string' && PW.name1.trim()) ctx.userName = PW.name1.trim();
      if (!ctx.charName && typeof PW.name2 === 'string' && PW.name2.trim()) ctx.charName = PW.name2.trim();
    } catch (e) {}
    if (!ctx.userName) {
      const n = scrapeName(true);
      if (n) ctx.userName = n;
    }
    if (!ctx.charName) {
      const n = scrapeName(false);
      if (n) ctx.charName = n;
    }
  }

  // ---------- 头像解析 ----------
  function normalizeAvatarUrl(v, prefix) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (/^(https?:|data:|blob:|\/)/i.test(s)) return s;
    if (s.indexOf('/') !== -1) return s;
    return prefix + s;
  }

  function userAvatarFromGlobals() {
    try {
      const st = PW.SillyTavern;
      const c = st && typeof st.getContext === 'function' ? st.getContext() : null;
      if (c) {
        const av = c.userAvatar || (c.user && c.user.avatar);
        const url = normalizeAvatarUrl(av, 'User Avatars/');
        if (url) return url;
      }
    } catch (e) {}
    try {
      const url = normalizeAvatarUrl(PW.user_avatar, 'User Avatars/');
      if (url) return url;
    } catch (e) {}
    return '';
  }

  function charAvatarFromGlobals() {
    try {
      const st = PW.SillyTavern;
      const c = st && typeof st.getContext === 'function' ? st.getContext() : null;
      if (c && c.characters && (c.characterId || c.characterId === 0)) {
        const ch = c.characters[c.characterId];
        const url = ch ? normalizeAvatarUrl(ch.avatar, 'characters/') : '';
        if (url) return url;
      }
    } catch (e) {}
    try {
      const chid = PW.this_chid;
      if (PW.characters && (chid || chid === 0) && PW.characters[chid]) {
        const url = normalizeAvatarUrl(PW.characters[chid].avatar, 'characters/');
        if (url) return url;
      }
    } catch (e) {}
    return '';
  }

  function panelImg(isUser) {
    const sels = isUser
      ? [
          '#persona_management_button img',
          '#user_avatar_block .avatar-container.selected img',
          '#user_avatar_block img',
          '#avatar_user img',
        ]
      : ['#character_popup img', '#avatar_load_preview', '#char_avatar img'];
    for (const sel of sels) {
      try {
        const im = PD.querySelector(sel);
        if (im && im.getAttribute('src')) return im.src;
      } catch (e) {}
    }
    return '';
  }

  function lastChatImg(isUser) {
    const sels = [
      `#chat .mes[is_user="${isUser}"] .mesAvatarWrapper img`,
      `#chat .mes[is_user="${isUser}"] .avatar img`,
      `#chat .mes[is_user="${isUser}"] img`,
    ];
    for (const sel of sels) {
      try {
        const els = PD.querySelectorAll(sel);
        for (let i = els.length - 1; i >= 0; i--) {
          const im = els[i];
          if (!im || !im.getAttribute('src')) continue;
          if (im.closest && im.closest('.mes_text')) continue;
          return im.src;
        }
      } catch (e) {}
    }
    return '';
  }

  function npcCanonicalName(name) {
    const cleaned = cleanName(name);
    const needle = lowerName(cleaned);
    if (!needle) return cleaned;

    const aliases = CONFIG.NPC_ALIASES || {};
    for (const rawCanonical of Object.keys(aliases)) {
      const canonical = cleanName(rawCanonical);
      if (!canonical) continue;
      if (lowerName(canonical) === needle) return canonical;

      const list = Array.isArray(aliases[rawCanonical]) ? aliases[rawCanonical] : [];
      if (list.some(alias => lowerName(cleanName(alias)) === needle)) return canonical;
    }
    return cleaned;
  }

  function npcAvatarUrl(rawName, dispName) {
    const tbl = CONFIG.NPC_AVATARS || {};
    const canonical = npcCanonicalName(dispName || rawName);
    const cands = [lowerName(cleanName(rawName)), lowerName(cleanName(dispName)), lowerName(canonical)].filter(Boolean);
    for (const k of Object.keys(tbl)) {
      if (!tbl[k]) continue;
      if (cands.includes(lowerName(k))) return tbl[k];
    }
    for (const k of Object.keys(tbl)) {
      if (!tbl[k]) continue;
      const lk = lowerName(k);
      if (!lk) continue;
      for (const c of cands) {
        if (c.includes(lk) || lk.includes(c)) return tbl[k];
      }
    }
    return '';
  }

  function resolveContext() {
    resolveNames();
    ctx.userAvatar = CONFIG.USER_AVATAR || userAvatarFromGlobals() || panelImg(true) || lastChatImg(true);
    ctx.charAvatar = CONFIG.CHAR_AVATAR || charAvatarFromGlobals() || panelImg(false) || lastChatImg(false);
  }

  // ---------- 身份判定 ----------
  function isUserSender(name) {
    const n = lowerName(cleanName(name));
    if (!n) return false;
    if (CONFIG.userAliases.map(cleanName).map(lowerName).includes(n)) return true;
    if (ctx.userName && n === lowerName(ctx.userName)) return true;
    return false;
  }

  function isCharSender(name) {
    const n = lowerName(cleanName(name));
    if (!n) return false;
    const list = CONFIG.charAliases.concat(CONFIG.CHAR_EXTRA_ALIASES || []);
    if (list.map(cleanName).map(lowerName).filter(Boolean).includes(n)) return true;
    if (ctx.charName && n === lowerName(ctx.charName)) return true;
    return false;
  }

  function senderKind(name) {
    if (isUserSender(name)) return 'user';
    if (isCharSender(name)) return 'char';
    return 'npc';
  }

  function displayName(name) {
    const kind = senderKind(name);
    if (kind === 'user') return ctx.userName || 'user';
    if (kind === 'char') return ctx.charName || CONFIG.charNameFallback;
    return npcCanonicalName(name);
  }

  // ---------- 头像与藤蔓框 ----------
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
    return Math.abs(h);
  }

  function initials(name) {
    const t = (name || '?').trim();
    const latinWords = t.match(/[A-Za-z]+/g);
    if (latinWords && latinWords.length) {
      if (latinWords.length >= 2) return (latinWords[0][0] + latinWords[1][0]).toUpperCase();
      return latinWords[0].slice(0, 2).toUpperCase();
    }
    return t.slice(0, 2);
  }

  function npcGradient(name) {
    const h = hashStr(name) % 360;
    return `linear-gradient(135deg,hsl(${h},45%,40%) 0%,hsl(${(h + 36) % 360},55%,26%) 100%)`;
  }

  // 【芙林专属】玫瑰藤蔓头像框（恒定慢转，无悬停变化）
  function rose(cx, cy, r) {
    return `<g class="fhb-rose" transform="translate(${cx} ${cy})">
            <circle class="fhb-rose-bud" cx="0" cy="0" r="${r}"/>
            <path class="fhb-rose-swirl" d="M-${r * 0.45} 0a${r * 0.45} ${r * 0.45} 0 1 1 ${r * 0.9} 0.2a${r * 0.72} ${r * 0.72} 0 0 1-${r * 1.2} 0.4"/>
            <path class="fhb-rose-sepal" d="M-${r + 1} ${r * 0.7}l-${r * 0.9} ${r * 0.5}M${r + 1} ${r * 0.7}l${r * 0.9} ${r * 0.5}"/>
        </g>`;
  }

  function roseFrame() {
    return `<svg class="fhb-vine" viewBox="0 0 72 72" aria-hidden="true">
            <circle class="fhb-vine-ring" cx="36" cy="36" r="33"/>
            <g class="fhb-vine-arc">
                <path class="fhb-vine-stem" d="M36 3.6A32.4 32.4 0 0 1 68.4 36"/>
                <path class="fhb-vine-stem" d="M36 68.4A32.4 32.4 0 0 1 3.6 36"/>
                <path class="fhb-leaf" d="M60.5 15.5c3.6-2.6 7-2.2 8.6 0.6-2.4 3.2-5.8 3.6-8.6-0.6z"/>
                <path class="fhb-leaf" d="M11.5 56.5c-3.6 2.6-7 2.2-8.6-0.6 2.4-3.2 5.8-3.6 8.6 0.6z"/>
                <path class="fhb-thorn" d="M52 8.5l2.6-3.2M19 63l-2.6 3.2"/>
                ${rose(36, 4.2, 4.2)}
                ${rose(64.6, 48, 3.4)}
                ${rose(7.4, 24, 3.4)}
            </g>
        </svg>`;
  }

  function avatarHTML(kind, rawName) {
    const disp = displayName(rawName);
    const src = kind === 'user' ? ctx.userAvatar : kind === 'char' ? ctx.charAvatar : npcAvatarUrl(rawName, disp);
    const style = kind === 'npc' ? ` style="background:${npcGradient(cleanName(disp))}"` : '';
    const fallbackStyle = src ? ' style="display:none"' : '';
    const img = src
      ? `<img class="fhb-av" src="${escapeAttr(src)}" alt="" loading="lazy" onerror="this.style.display='none';var p=this.previousElementSibling;if(p)p.style.display='flex'">`
      : '';
    const frame = kind === 'char' ? roseFrame() : '';
    return `<div class="fhb-avwrap fhb-w-${kind}">${frame}<div class="fhb-avatar fhb-av-${kind}"${style}><span class="fhb-avi"${fallbackStyle}>${escapeHTML(initials(disp))}</span>${img}</div></div>`;
  }

  // ---------- 四角装饰 ----------
  function decoHTML(kind) {
    const d = CONFIG.DECO || {};
    const who = d[kind] || {};
    const all = d.all || {};
    let s = '';
    ['tl', 'tr', 'bl', 'br'].forEach(c => {
      const url = who[c] || all[c];
      if (!url) return;
      s += `<span class="fhb-deco fhb-deco-${c}"><img src="${escapeAttr(url)}" alt="" loading="lazy" onerror="var w=this.closest('.fhb-deco');if(w)w.remove();"></span>`;
    });
    return s;
  }

  function applyDecos() {
    if (anyEditing()) return;
    PD.querySelectorAll('.fhb-msg[data-kind]').forEach(m => {
      const col = m.querySelector('.fhb-col');
      if (!col) return;
      let wrap = col.querySelector(':scope > .fhb-bubble-wrap');
      if (!wrap) {
        const visual = Array.from(col.children).find(
          n => n.classList && (n.classList.contains('fhb-bubble') || n.classList.contains('fhb-fig')),
        );
        if (!visual) return;
        wrap = PD.createElement('div');
        wrap.className = 'fhb-bubble-wrap';
        visual.replaceWith(wrap);
        wrap.appendChild(visual);
      }
      col.querySelectorAll('.fhb-deco').forEach(n => n.remove());
      const html = decoHTML(m.dataset.kind);
      if (html) wrap.insertAdjacentHTML('beforeend', html);
    });
  }

  // ---------- SVG 图标 ----------
  const ICON = {
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5l8 5.5-8 5.5z" fill="currentColor"/></svg>',
    phone:
      '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M164.9 24.6c-7.7-18.6-28-28.5-47.4-23.2l-88 24C12.1 30.2 0 46 0 64C0 311.4 200.6 512 448 512c18 0 33.8-12.1 38.6-29.5l24-88c5.3-19.4-4.6-39.7-23.2-47.4l-96-40c-16.3-6.8-35.2-2.1-46.3 11.6L304.7 368C234.3 334.7 177.3 277.7 144 207.3L193.3 167c13.7-11.1 18.4-30 11.6-46.3l-40-96z"/></svg>',
    video:
      '<svg viewBox="0 0 576 512" aria-hidden="true"><path fill="currentColor" d="M0 128C0 92.7 28.7 64 64 64H320c35.3 0 64 28.7 64 64V384c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V128zM559.1 99.8c10.4 5.6 16.9 16.4 16.9 28.2V384c0 11.8-6.5 22.6-16.9 28.2s-23 5-32.9-1.6l-96-64L416 337.1V320 192 174.9l14.2-9.5 96-64c9.8-6.5 22.4-7.2 32.9-1.6z"/></svg>',
    file: '<svg viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M64 0C28.7 0 0 28.7 0 64V448c0 35.3 28.7 64 64 64H320c35.3 0 64-28.7 64-64V160H256c-17.7 0-32-14.3-32-32V0H64zM256 0V128H384L256 0zM112 256H272c8.8 0 16 7.2 16 16s-7.2 16-16 16H112c-8.8 0-16-7.2-16-16s7.2-16 16-16zm0 64H272c8.8 0 16 7.2 16 16s-7.2 16-16 16H112c-8.8 0-16-7.2-16-16s7.2-16 16-16z"/></svg>',
    envelope:
      '<svg viewBox="0 0 40 32" aria-hidden="true"><rect x="1.5" y="3.5" width="37" height="25" rx="4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M3 6l17 11L37 6" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
    coin: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.2 8.6c-.6-1-1.8-1.6-3.2-1.6-1.9 0-3.4 1.1-3.4 2.6 0 3.1 6.9 1.7 6.9 4.8 0 1.5-1.5 2.6-3.5 2.6-1.5 0-2.8-.7-3.4-1.8M12 5.4v13.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    check:
      '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>',
    imgph:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v8.2l4.2-4.2 3 3L17 7.2 20 10.2V6H4zm5 3.5A1.5 1.5 0 1 1 10.5 8 1.5 1.5 0 0 1 9 9.5z"/></svg>',
    arrow:
      '<svg class="fhb-arr" viewBox="0 0 16 10" aria-hidden="true"><path d="M0 5h13M10 1.5L13.5 5 10 8.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    dots: '<svg class="fhb-dots" viewBox="0 0 38 12" aria-hidden="true"><circle cx="7" cy="6" r="3.2"/><circle cx="19" cy="6" r="3.2"/><circle cx="31" cy="6" r="3.2"/></svg>',
    // 【芙林专属】名字前的玫瑰标记
    roseTiny:
      '<svg viewBox="0 0 12 12" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.05" stroke-linecap="round"><path d="M6 3.1c-1.3 0-2.2.9-2.2 2S4.8 7.2 6.1 7.2s2.4-1 2.4-2.3S7.4 2.5 5.9 2.5 3.1 3.7 3.1 5.2"/><path d="M6.2 7.6v2.7"/><path d="M5 9.2c-1-.2-1.6-.7-1.8-1.5 1-.2 1.7.3 1.8 1.5z"/></g></svg>',
  };

  // ============================================================
  // 世界书模块（单卡单书直写：无闸门、无聊天书创建、无跨卡处理）
  // ============================================================
  const MACRO_CHAR = '{' + '{char}}';

  const FORMAT_TEXT = `<party_chat_format>
# 线上聊天输出格式

当剧情中角色通过手机、社交软件、短信、群聊等线上方式交流时，聊天内容必须以固定格式逐条输出，每行一条，行与行之间用空行隔开，禁止包裹在代码块中。非线上对话场景不得使用本格式，保持正常正文叙述。聊天块前后可以正常穿插中文叙事描写。

本格式适用于剧情里任何两个人（或一群人）之间的线上对话，包括：角色与{{user}}的私聊、${MACRO_CHAR}与NPC的私聊、NPC之间的私聊、多人参与的群聊、对某个角色手机屏幕的描写。若涉及多方对话，一律按实际说话的人填写发送方。角色名不限制语言。

【固定格式】
[类型|发送方|接收方|内容|附加|时间]
- 附加与时间可省略：可为 [类型|发送方|接收方|内容|时间] 或 [类型|发送方|接收方|内容]。
- 每条聊天条目必须顶格独立成行，行首禁止加空格或缩进。
- 任一字段内部禁止出现竖线与方括号。
- 时间统一使用 24 小时制 HH:MM，如 23:14。
- 发送方写法：{{user}}一方写 {{user}}；其余一律写该角色的名字（与剧情中的称呼一致）。
- 接收方写法：发给{{user}}时写 {{user}}；发给其他角色写对方名字；群聊写固定群名。
- text 类型的语言风格遵循角色卡自身设定（如角色卡要求双语台词，则照旧成对写入内容字段）。

【类型语义】
- text：内容为消息文本；附加可写状态词（已读/未读/送达失败），无则留空。
- voice：内容为语音的听觉转写文字；附加为时长，如 12"。
- transfer：内容为金额数字，如 500.00；附加为转账备注。
- redpacket：内容为红包祝福语；附加为状态（已领取/待领取）。
- image：内容为一句中文图片描述；附加为一到三个英文取图关键词，逗号分隔，如 bar,neon,night。
- sticker：内容为一个表情包名称、表情符号或颜文字；附加可写贴纸吐槽文字。若存在表情包名录，优先从名录中挑选名称填入内容字段。
- call：内容为通话结果，如 通话时长 3:24 或 未接听；附加写 语音通话 或 视频通话。
- location：内容为地点名；附加为所在区域或街区。
- file：内容为文件名；附加为文件大小或说明。
- system：内容为系统提示，如 某人 撤回了一条消息；接收方字段留空。
- typing：内容与附加留空，表示对方正在输入，用于制造停顿与悬念。

【输出示例】（名字仅为格式演示，实际输出使用剧情中的真实角色名）

[text|芙林|{{user}}|你在哪里？楼下风很大。|已读|23:14]

[sticker|{{user}}|芙林|🙄|翻个大白眼|23:15]

[typing|芙林|{{user}}|23:16]

[text|Robin|Mika|明天老地方，别迟到。|已读|21:07]

[system|Robin||Robin 邀请 Mika 加入了群聊|22:03]

[redpacket|Robin|周末小队|恭贺乔迁！|待领取|22:04]

[image|Mika|周末小队|凌晨三点的吧台只剩霓虹还亮着|bar,neon,night|22:07]
</party_chat_format>`;

  const STICKER_LIB_DEFAULT = `# ============================================
# 表情包链接库
# 本条目请保持关闭（灰灯），它不会发给 AI，只供脚本读取。
# ============================================
#
# 作用：把「表情包名字」和「图片直链」绑定起来。
# AI 在 sticker 消息的内容字段写了这里的名字，气泡就会显示对应图片。
#
# 写法：一行一个，名字在前，链接在后，中间用两个减号隔开。
# 分隔符也可以用 | 或 = 或全角冒号，效果一样。
# 行首加 # 表示注释，该行不生效。
#
# 名字可以是中文、英文、颜文字，只要 AI 抄得准就行。
# 改完这里之后，点脚本按钮「注入/更新世界书」，
# 脚本会把新名单同步进「表情包名录」条目，AI 才知道有哪些可用。
#
# 下面四行是示例，可直接删掉换成你自己的：

不对劲--https://files.catbox.moe/itw2h1.png
啧--https://files.catbox.moe/w206rr.png
哭哭--https://files.catbox.moe/rw1cfk.png
讨好--https://files.catbox.moe/7fwfte.png`;

  const CONFIG_LIB_DEFAULT = `# ============================================================
# 聊天气泡 · 外观配置    模板版本 ${CONF_VERSION}
# 本条目请保持关闭（灰灯），它不会发给 AI，只供脚本读取。
# ============================================================
#
# 【怎么用】
# 1. 每一行的写法是：键 = 值
# 2. 行首带 # 的是注释行，不生效。想启用某一项，把这一行开头的 # 删掉。
# 3. 想恢复默认，把这一行重新加上 # 注释掉，或者把等号后面清空。
# 4. 改完之后回到聊天界面，点脚本按钮「注入/更新世界书」，立刻生效。
# 5. 值不用加引号。填链接就填图片直链（结尾是 .png/.jpg/.gif 那种）。
#
# 【专属说明】
# 玫瑰藤蔓头像框、丝绒金线气泡、玫瑰水印是芙林专属造型，固定存在，
# 不在这里提供开关；但底色、边框、四角装饰都可以用下面的键叠加自定义。
#
# ------------------------------------------------------------
# 一、头像
# ------------------------------------------------------------
# 留空 = 自动抓取酒馆里当前的用户头像和角色头像，一般不用填。
# 只有想让聊天气泡里用另一张图时才填。

user_avatar =
char_avatar =

# NPC 头像：键名是 npc. 加上角色在聊天记录里的名字。
# 没配置的 NPC 会自动生成一个带首字母的渐变色头像。
# 示例（删掉 # 才生效）：
# npc.Teddy = https://你的图床/teddy.png
# npc.Mara = https://你的图床/mara.png

# ------------------------------------------------------------
# 二、主题色
# ------------------------------------------------------------
# accent 是丝绒红主色（dark/light 各一），accent2 是鎏金点缀色。
# 红用于头像光环、语音播放键、图标底色；金用于名字、边线、已读标记。
# dark 结尾的在深色主题下生效，light 结尾的在浅色主题下生效。

accent_dark = #ff3b4e
accent2_dark = #d8a33d
accent_light = #c8102e
accent2_light = #a07c22

# ------------------------------------------------------------
# 三、气泡填充与边框
# ------------------------------------------------------------
# 键名格式：bubble.谁.属性
#   谁    ：user = 你自己    char = 芙林    npc = 其他配角
#   属性  ：
#     background   气泡底色。可填纯色 #223344，也可填渐变 linear-gradient(...)
#                  填渐变时气泡的小尖角会自动隐藏（渐变没法对齐尖角）
#     text         气泡里的文字颜色
#     border       边框颜色
#     border_style 边框样式：solid 实线 / dashed 虚线 / dotted 点线 /
#                  double 双线 / groove 凹槽 / ridge 凸边 / none 无边 /
#                  slash 45度斜纹（注意：斜纹会让气泡圆角失效）
#     border_width 边框粗细，如 1px、1.5px、2px
# 芙林气泡左边的红色饰线是专属造型，保持固定，其余边都可自定义。
# 示例（删掉 # 才生效）：

# bubble.user.background = linear-gradient(135deg,#241d17,#14100c)
# bubble.user.border = #d8a33d
# bubble.user.border_style = dashed
# bubble.char.background = #2e161b
# bubble.char.text = #f0e9d9
# bubble.npc.border_style = dotted

# ------------------------------------------------------------
# 四、气泡四角装饰图
# ------------------------------------------------------------
# 在气泡的四个角挂小图或 gif（比如玫瑰、缎带、贴纸），不挡点击。
# 键名格式：deco.谁.角位
#   谁    ：user = 你自己   char = 芙林   npc = 其他配角
#           all  = 兜底，上面三个没单独配置时都用它
#   角位  ：tl = 左上角   tr = 右上角
#           bl = 左下角   br = 右下角
# 建议用透明底的小图，宽度 120px 以内。
# 示例（删掉 # 才生效）：

# deco.char.tr = https://你的图床/rosebud.gif
# deco.user.tl = https://你的图床/ribbon.png
# deco.all.br = https://你的图床/star.png

# 装饰图宽度。留空用默认（跟随屏幕，约 28~40px）。填法：40px
# deco_size =

# 装饰图往气泡外面挪多少，填 -100 到 100 的数字，默认 40。
# 负数 = 往气泡内侧收；0 = 对齐气泡角；40 = 一半骑在角上；70 以上会明显飘在外面。
# 数字按装饰图自己的尺寸计算，调整装饰大小时位置不会跑偏。
# deco_offset = 40

# ------------------------------------------------------------
# 五、其它
# ------------------------------------------------------------
# 配色跟随：auto 自动判断你的酒馆是深色还是浅色 / dark 强制深色 / light 强制浅色
theme = auto

# 表情包图片宽度，留空为自适应。填法：120px
sticker_size =

# image 类型随机配图的尺寸，宽x高
image_size = 640x400

# 旁观者之间的对话（不涉及你的那些）达到几条，就折叠成一张可展开的卡片
collapse_min = 3

# 追加的主角别名，多个用逗号隔开。
# 脚本已内置芙林常用称呼（芙林/flynn/red/大少/少爷/flynn harlow/芙林·哈洛），
# 只有出现清单之外的新昵称时才需要填这里。
char_aliases =

# NPC 别名：点号后写希望统一显示的标准名，等号后写它的其它叫法。
# 多个别名用逗号隔开；匹配时忽略大小写。别名会共用标准名配置的头像。
# 示例：以下配置会把 朱利安、Jules 和小朱都显示为「Julian」。
# npc_aliases.Julian = 朱利安, Jules, 小朱

# 流式生成时的渲染方式：
#   defer = 生成过程中先显示原始文字，生成结束后一次性变成气泡（不闪，推荐）
#   live  = 边生成边变气泡，会有轻微跳动，但能提前看到效果
stream_mode = defer`;

  function stickerListText(names) {
    const list = names && names.length ? names.join('、') : '（暂未配置）';
    return `<sticker_library>
# 可用表情包名录

在 sticker 类型消息中，内容字段可以直接填写下列表情包名称，系统会自动替换为对应的表情包图片。名称必须与下列完全一致，不要自造、不要加引号或额外符号。

可用名称：${list}

若当前情绪没有合适的名称，也可以退回使用单个 emoji 或颜文字。表情包不需要每条消息都用，在情绪转折、装傻、嘴硬、耍赖等时刻穿插使用效果最好。
</sticker_library>`;
  }

  const SPEC = {
    format: {
      title: '【聊天气泡】线上聊天输出格式',
      enabled: true,
      constant: true,
      order: CONFIG.WI_ORDER,
      depth: CONFIG.WI_DEPTH,
      verifyPos: true,
      respectEnabled: false,
      uid: null,
    },
    list: {
      title: '【聊天气泡】表情包名录',
      enabled: true,
      constant: true,
      order: Math.max(0, CONFIG.WI_ORDER - 1),
      depth: CONFIG.WI_DEPTH,
      verifyPos: true,
      respectEnabled: true,
      uid: null,
    },
    lib: {
      title: '【聊天气泡·数据】表情包链接库',
      enabled: false,
      constant: false,
      order: 100,
      depth: 4,
      verifyPos: false,
      respectEnabled: false,
      uid: null,
    },
    conf: {
      title: '【聊天气泡·数据】外观配置',
      enabled: false,
      constant: false,
      order: 100,
      depth: 4,
      verifyPos: false,
      respectEnabled: false,
      uid: null,
    },
  };

  const API = {
    read: typeof getWorldbook === 'function' ? getWorldbook : null,
    getEntries:
      typeof getWorldbookEntries === 'function'
        ? getWorldbookEntries
        : typeof getLorebookEntries === 'function'
          ? getLorebookEntries
          : null,
    createEntries:
      typeof createWorldbookEntries === 'function'
        ? createWorldbookEntries
        : typeof createLorebookEntries === 'function'
          ? createLorebookEntries
          : null,
    setEntries:
      typeof setWorldbookEntries === 'function'
        ? setWorldbookEntries
        : typeof setLorebookEntries === 'function'
          ? setLorebookEntries
          : null,
    updateWith: typeof updateWorldbookWith === 'function' ? updateWorldbookWith : null,
  };

  function entryTitle(e) {
    return String((e && (e.name != null ? e.name : e.comment)) || '').trim();
  }

  // ---------- 解析角色绑定的世界书名（单卡单书，不做存在性探测，不做聊天书兜底） ----------
  async function resolveBookName() {
    if (CONFIG.WI_TARGET && CONFIG.WI_TARGET.trim()) return CONFIG.WI_TARGET.trim();

    if (typeof getCharWorldbookNames === 'function') {
      const tries = [
        () => getCharWorldbookNames('current'),
        () => getCharWorldbookNames({ type: 'all' }),
        () => getCharWorldbookNames(),
      ];
      for (const fn of tries) {
        try {
          const r = await fn();
          if (!r) continue;
          if (typeof r === 'string' && r.trim()) return r.trim();
          if (r.primary && String(r.primary).trim()) return String(r.primary).trim();
          if (Array.isArray(r.additional) && r.additional.length) return String(r.additional[0]).trim();
        } catch (e) {}
      }
    } else if (typeof getCharLorebooks === 'function') {
      try {
        const r = await getCharLorebooks('current');
        if (typeof r === 'string' && r.trim()) return r.trim();
        if (r && r.primary) return String(r.primary).trim();
      } catch (e) {}
    }

    if (typeof triggerSlash === 'function') {
      try {
        const n = String((await triggerSlash('/getcharbook')) || '').trim();
        if (n && n !== 'undefined' && n !== 'null') return n;
      } catch (e) {}
    }
    return '';
  }

  async function listEntries(book) {
    // 优先使用现代接口 getWorldbook，旧接口链作为回退
    if (API.read) {
      try {
        const r = await API.read(book);
        if (Array.isArray(r)) return r;
      } catch (e) {}
    }
    if (!API.getEntries) return null;
    try {
      const r = await API.getEntries(book);
      if (Array.isArray(r)) return r;
      if (r && Array.isArray(r.entries)) return r.entries;
    } catch (e) {}
    return null;
  }

  async function findEntry(book, title) {
    const list = await listEntries(book);
    if (list) {
      const hit = list.find(e => entryTitle(e) === title);
      if (hit) return { uid: hit.uid, entry: hit };
      return null;
    }
    if (typeof triggerSlash === 'function') {
      try {
        const r = String(
          (await triggerSlash(`/findentry file="${escapeForST(book)}" field=comment ${escapeForST(title)}`)) || '',
        ).trim();
        if (/^\d+$/.test(r)) return { uid: Number(r), entry: null };
      } catch (e) {}
    }
    return null;
  }

  async function readEntryContent(book, title) {
    const found = await findEntry(book, title);
    if (!found) return null;
    if (found.entry && typeof found.entry.content === 'string') return found.entry.content;
    if (typeof triggerSlash === 'function') {
      try {
        const c = await triggerSlash(`/getentryfield file="${escapeForST(book)}" field=content ${found.uid}`);
        if (typeof c === 'string') return c;
      } catch (e) {}
    }
    return null;
  }

  // ---------- 条目对象构造 ----------
  function newStyleEntry(spec, content) {
    return {
      name: spec.title,
      comment: spec.title,
      enabled: !!spec.enabled,
      strategy: {
        type: spec.constant ? 'constant' : 'selective',
        keys: [],
        keys_secondary: { logic: 'and_any', keys: [] },
      },
      position: { type: 'at_depth', role: 'system', depth: spec.depth, order: spec.order },
      recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null },
      probability: 100,
      content: content,
    };
  }

  function oldStyleEntry(spec, content) {
    return {
      comment: spec.title,
      enabled: !!spec.enabled,
      disable: !spec.enabled,
      type: spec.constant ? 'constant' : 'selective',
      constant: !!spec.constant,
      keys: [],
      key: [],
      position: 4,
      depth: spec.depth,
      order: spec.order,
      role: 'system',
      prevent_recursion: true,
      exclude_recursion: true,
      content: content,
    };
  }

  function mergePatch(origin, spec, content) {
    const o = Object.assign({}, origin || {});
    o.content = content;

    // 名录类条目：开关状态完全交给用户，脚本只同步内容与位置；
    // 但若历史写入把开关存成了字符串（如 "false"），先按布尔语义归一化，避免被误判为「已关闭」
    const keepEnabled = !!spec.respectEnabled && !!origin;
    if (keepEnabled) {
      let dis = !spec.enabled;
      if ('disable' in origin) dis = toToggleBool(origin.disable);
      else if ('enabled' in origin) dis = !toToggleBool(origin.enabled);
      o.disable = dis;
      o.enabled = !dis;
    } else {
      o.enabled = !!spec.enabled;
      o.disable = !spec.enabled;
    }

    if (spec.title) {
      if ('name' in o) o.name = spec.title;
      o.comment = spec.title;
    }

    const p = o.position;
    if (p && typeof p === 'object') {
      o.position = Object.assign({}, p, { type: 'at_depth', role: 'system', depth: spec.depth, order: spec.order });
      if ('order' in o) o.order = spec.order;
      if ('depth' in o) o.depth = spec.depth;
    } else if (typeof p === 'number' || typeof p === 'string') {
      o.position = 4;
      o.depth = spec.depth;
      o.order = spec.order;
      o.role = typeof o.role === 'number' ? 0 : 'system';
    } else {
      o.position = { type: 'at_depth', role: 'system', depth: spec.depth, order: spec.order };
      o.depth = spec.depth;
      o.order = spec.order;
      o.role = 'system';
    }
    return o;
  }

  async function helperCreate(book, spec, content) {
    if (!API.createEntries) return false;
    try {
      await API.createEntries(book, [newStyleEntry(spec, content)]);
      return true;
    } catch (e) {}
    try {
      await API.createEntries(book, [oldStyleEntry(spec, content)]);
      return true;
    } catch (e) {}
    return false;
  }

  async function helperUpdate(book, uid, spec, content, origin) {
    if (API.updateWith) {
      try {
        await API.updateWith(book, entries => entries.map(e => (e.uid === uid ? mergePatch(e, spec, content) : e)));
        return true;
      } catch (e) {}
    }
    if (API.setEntries && origin) {
      try {
        const o = mergePatch(origin, spec, content);
        o.uid = uid;
        await API.setEntries(book, [o]);
        return true;
      } catch (e) {}
    }
    // 名录类条目在拿不到原对象时放弃整体覆盖，交给逐字段写入，
    // 否则会把用户手动关掉的条目重新点亮
    if (spec.respectEnabled && !origin) return false;
    if (API.setEntries) {
      try {
        const o = newStyleEntry(spec, content);
        o.uid = uid;
        await API.setEntries(book, [o]);
        return true;
      } catch (e) {}
      try {
        const o = oldStyleEntry(spec, content);
        o.uid = uid;
        await API.setEntries(book, [o]);
        return true;
      } catch (e) {}
    }
    return false;
  }

  // ---------- STscript 兜底 ----------
  // 返回 true 表示写入动作成功执行；false 表示命令不可用或抛错
  async function stSetField(book, uid, field, value) {
    if (typeof triggerSlash !== 'function') return false;
    try {
      await triggerSlash(
        `/setentryfield file="${escapeForST(book)}" uid=${uid} field=${field} ${escapeForST(String(value))}`,
      );
      return true;
    } catch (e) {
      console.warn(`[聊天气泡] 写入字段 ${field} 失败（${book}#${uid}）：`, e);
      return false;
    }
  }

  // ---------- 条目开关安全写入 ----------
  // 部分链路可能把 disable/enabled 写成字符串（如 "false"），字符串是真值，
  // 会被 SillyTavern 当作「已关闭」。统一做三件事：
  //   1. 读取时按布尔语义解析，并检测字段类型是否脏；
  //   2. 目标状态已达成且字段干净时，完全不写入；
  //   3. 需要写入时优先走 helper API（写真布尔），斜杠命令只作兜底并打日志。
  const toToggleBool = v => (typeof v === 'boolean' ? v : String(v).toLowerCase() === 'true');

  function entryDisableInfo(entry) {
    if (!entry || typeof entry !== 'object') return { state: null, dirty: false };
    let state = null,
      dirty = false;
    if ('disable' in entry) {
      state = toToggleBool(entry.disable);
      dirty = typeof entry.disable !== 'boolean';
      if ('enabled' in entry && toToggleBool(entry.enabled) === state) dirty = true;
    } else if ('enabled' in entry) {
      state = !toToggleBool(entry.enabled);
      dirty = typeof entry.enabled !== 'boolean';
    }
    return { state: state, dirty: dirty };
  }

  // 三态返回：true = 实际发生写入；null = 已处于目标状态，无需写入；false = 写入失败
  async function setEntryState(book, spec, found, wantEnabled) {
    const uid = found && found.uid != null ? found.uid : spec && spec.uid;
    if (uid == null) return null;
    const wantDisabled = !wantEnabled;
    const foundEntry = found && found.entry;
    const info = entryDisableInfo(foundEntry);
    if (info.state !== null && !info.dirty && info.state === wantDisabled) return null;

    if (API.updateWith) {
      try {
        await API.updateWith(book, entries =>
          entries.map(e => (e.uid === uid ? Object.assign({}, e, { disable: wantDisabled, enabled: wantEnabled }) : e)),
        );
        console.info(`[聊天气泡] 已将条目「${spec.title}」${wantEnabled ? '开启' : '关闭'}（${book}）`);
        return true;
      } catch (e) {}
    }
    if (API.setEntries && foundEntry) {
      try {
        await API.setEntries(book, [
          Object.assign({}, foundEntry, { uid: uid, disable: wantDisabled, enabled: wantEnabled }),
        ]);
        console.info(`[聊天气泡] 已将条目「${spec.title}」${wantEnabled ? '开启' : '关闭'}（${book}）`);
        return true;
      } catch (e) {}
    }
    if (typeof triggerSlash === 'function') {
      await stSetField(book, uid, 'disable', wantEnabled ? 'false' : 'true');
      console.info(`[聊天气泡] 已请求切换条目「${spec.title}」开关为${wantEnabled ? '开启' : '关闭'}（${book}）`);
      return true;
    }
    return false;
  }

  // 仅修复字段类型（字符串 → 布尔），绝不改变条目原来的开/关意向
  async function healEntryToggle(book, spec, found) {
    const info = entryDisableInfo(found && found.entry);
    if (!info.dirty || info.state === null) return false;
    return setEntryState(book, spec, found, !info.state);
  }

  // 每轮注入结束时的开关体检：脏字段只修类型；格式条目强制扶正；名录不碰
  async function verifyEntryToggles(book) {
    for (const key of Object.keys(SPEC)) {
      const spec = SPEC[key];
      try {
        const ref = await findEntry(book, spec.title);
        if (!ref) continue;
        const info = entryDisableInfo(ref.entry);
        if (info.dirty) await healEntryToggle(book, spec, ref);
        if (spec.enabled && !spec.respectEnabled) await setEntryState(book, spec, ref, true);
      } catch (e) {}
    }
  }

  async function stApplyPosition(book, uid, spec) {
    let ok = true;
    ok = (await stSetField(book, uid, 'position', 4)) && ok;
    ok = (await stSetField(book, uid, 'depth', spec.depth)) && ok;
    ok = (await stSetField(book, uid, 'order', spec.order)) && ok;
    ok = (await stSetField(book, uid, 'role', 0)) && ok;
    return ok;
  }

  // 返回 true 表示所有关键字段均写入成功
  async function stApplyFields(book, uid, spec, content, keepEnabled, entryHint) {
    let ok = true;
    ok = (await stSetField(book, uid, 'comment', spec.title)) && ok;
    ok = (await stSetField(book, uid, 'content', content)) && ok;
    ok = (await stSetField(book, uid, 'constant', spec.constant ? 'true' : 'false')) && ok;
    if (!keepEnabled) {
      const st = await setEntryState(book, spec, { uid: uid, entry: entryHint || null }, spec.enabled);
      ok = st !== false && ok;
    }
    ok = (await stApplyPosition(book, uid, spec)) && ok;
    ok = (await stSetField(book, uid, 'excludeRecursion', 'true')) && ok;
    ok = (await stSetField(book, uid, 'preventRecursion', 'true')) && ok;
    return ok;
  }

  async function stCreate(book, spec, content) {
    if (typeof triggerSlash !== 'function') return null;
    let uid = null;
    try {
      const r = String(
        (await triggerSlash(`/createentry file="${escapeForST(book)}" key="" ${escapeForST(spec.title)}`)) || '',
      ).trim();
      if (/^\d+$/.test(r)) uid = Number(r);
    } catch (e) {}
    if (uid === null) return null;
    let fresh = null;
    try {
      fresh = await findEntry(book, spec.title);
    } catch (e) {}
    const fieldsOK = await stApplyFields(book, uid, spec, content, false, fresh ? fresh.entry : null);
    return fieldsOK ? uid : null;
  }

  // ---------- 位置自检 ----------
  function positionOK(e, spec) {
    if (!e) return false;
    const p = e.position;
    if (p && typeof p === 'object') {
      const d = p.depth != null ? p.depth : e.depth;
      return String(p.type) === 'at_depth' && Number(d) === Number(spec.depth);
    }
    let num = NaN;
    if (typeof p === 'number') num = p;
    else if (typeof p === 'string') num = /depth/i.test(p) ? 4 : Number(p);
    return Number(num) === 4 && Number(e.depth) === Number(spec.depth);
  }

  async function ensurePosition(book, spec) {
    if (!spec.verifyPos) return;
    const found = await findEntry(book, spec.title);
    if (!found) return;
    spec.uid = found.uid;
    if (found.entry && positionOK(found.entry, spec)) return;
    if (typeof triggerSlash === 'function') {
      await stApplyPosition(book, found.uid, spec);
      return;
    }
    if (API.updateWith) {
      try {
        await API.updateWith(book, entries =>
          entries.map(e => {
            if (e.uid !== found.uid) return e;
            return mergePatch(e, spec, e.content);
          }),
        );
      } catch (e) {}
    }
  }

  // 写入后的读回校验：读回的内容与目标完全一致，才算真的成功
  async function verifyWritten(book, spec, content) {
    const back = await readEntryContent(book, spec.title);
    return typeof back === 'string' && back === content;
  }

  // 返回 'created' | 'updated' | 'kept' | 'failed'
  async function upsertEntry(book, spec, content, overwrite) {
    const found = await findEntry(book, spec.title);
    if (found) {
      spec.uid = found.uid;
      if (!overwrite) {
        await ensurePosition(book, spec);
        if (spec.enabled && !spec.respectEnabled) await setEntryState(book, spec, found, true);
        return 'kept';
      }
      // 内容完全一致时只校验位置，不产生任何写入
      if (found.entry && typeof found.entry.content === 'string' && found.entry.content === content) {
        await ensurePosition(book, spec);
        return 'kept';
      }
      let ok = await helperUpdate(book, found.uid, spec, content, found.entry);
      if (!ok) ok = await stApplyFields(book, found.uid, spec, content, !!spec.respectEnabled, found.entry);
      if (spec.enabled && !spec.respectEnabled) await setEntryState(book, spec, found, true);
      await ensurePosition(book, spec);
      if (!ok || !(await verifyWritten(book, spec, content))) return 'failed';
      return 'updated';
    }
    const created = await helperCreate(book, spec, content);
    if (created) {
      await ensurePosition(book, spec);
      if (!(await verifyWritten(book, spec, content))) return 'failed';
      return 'created';
    }
    const uid = await stCreate(book, spec, content);
    if (uid === null) return 'failed';
    spec.uid = uid;
    await ensurePosition(book, spec);
    if (!(await verifyWritten(book, spec, content))) return 'failed';
    return 'created';
  }

  // ---------- 数据条目解析 ----------
  function parseStickerLib(text) {
    const map = {};
    if (!text) return map;
    String(text)
      .split(/\r?\n/)
      .forEach(line => {
        const s = line.trim();
        if (!s || s.startsWith('#') || s.startsWith('//')) return;
        if (/^<\/?[a-z_]+>$/i.test(s)) return;
        const m = s.match(/^(.+?)\s*(?:--|—|\||=|：|:(?!\/\/))\s*(https?:\/\/\S+)\s*$/i);
        if (!m) return;
        const name = m[1].trim().replace(/^["'「『]+|["'」』]+$/g, '');
        const url = m[2].trim();
        if (name && url) map[name] = url;
      });
    return map;
  }

  function parseKV(text) {
    const out = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach(line => {
        const s = line.trim();
        if (!s || s.startsWith('#') || s.startsWith('//')) return;
        if (/^<\/?[a-z_]+>$/i.test(s)) return;
        const m = s.match(/^([^=|:：]+?)\s*(?:=|--|\||：|:)\s*(.*)$/);
        if (!m) return;
        const k = m[1].trim();
        let v = m[2].trim().replace(/^["'「『]+|["'」』]+$/g, '');
        if (!k) return;
        out.push({ k: k, kl: k.toLowerCase().replace(/\s+/g, ''), v: v });
      });
    return out;
  }

  const DECO_WHO = ['user', 'char', 'npc', 'all'];
  const DECO_CORNERS = ['tl', 'tr', 'bl', 'br'];
  const BUBBLE_WHO = ['user', 'char', 'npc'];
  const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'none', 'slash'];
  const BUBBLE_KEY_MAP = {
    background: 'bg',
    bg: 'bg',
    text: 'tx',
    color: 'tx',
    tx: 'tx',
    border: 'bd',
    border_color: 'bd',
    bd: 'bd',
    border_style: 'bs',
    style: 'bs',
    bs: 'bs',
    border_width: 'bw',
    width: 'bw',
    bw: 'bw',
  };

  function normWidth(v) {
    v = String(v || '').trim();
    if (/^\d+(\.\d+)?$/.test(v)) return v + 'px';
    if (/^\d+(\.\d+)?(px|em|rem)$/.test(v)) return v;
    return '';
  }

  function applyConfigKV(pairs) {
    if (!pairs || !pairs.length) return;
    const simple = {
      user_avatar: 'USER_AVATAR',
      char_avatar: 'CHAR_AVATAR',
      accent_dark: 'ACCENT_DARK',
      accent2_dark: 'ACCENT2_DARK',
      accent_light: 'ACCENT_LIGHT',
      accent2_light: 'ACCENT2_LIGHT',
      sticker_size: 'STICKER_SIZE',
      deco_size: 'DECO_SIZE',
    };
    pairs.forEach(p => {
      const kl = p.kl;
      const v = p.v;

      if (kl.indexOf('deco.') === 0) {
        const seg = kl.slice(5).split('.');
        if (seg.length === 2 && DECO_WHO.includes(seg[0]) && DECO_CORNERS.includes(seg[1]) && v) {
          if (!CONFIG.DECO[seg[0]]) CONFIG.DECO[seg[0]] = {};
          CONFIG.DECO[seg[0]][seg[1]] = v;
        }
        return;
      }

      if (kl.indexOf('bubble.') === 0) {
        const seg = kl.slice(7).split('.');
        if (seg.length === 2 && BUBBLE_WHO.includes(seg[0])) {
          const key = BUBBLE_KEY_MAP[seg[1]];
          if (!key || !v) return;
          if (!CONFIG.BUBBLE[seg[0]]) CONFIG.BUBBLE[seg[0]] = {};
          if (key === 'bs') {
            const st = v.toLowerCase();
            if (BORDER_STYLES.includes(st)) CONFIG.BUBBLE[seg[0]][key] = st;
            return;
          }
          if (key === 'bw') {
            const w = normWidth(v);
            if (w) CONFIG.BUBBLE[seg[0]][key] = w;
            return;
          }
          CONFIG.BUBBLE[seg[0]][key] = v;
        }
        return;
      }

      if (kl.indexOf('npc_aliases.') === 0) {
        const canonical = cleanName(p.k.slice('npc_aliases.'.length).trim());
        if (!canonical || !v) return;
        if (!Array.isArray(CONFIG.NPC_ALIASES[canonical])) CONFIG.NPC_ALIASES[canonical] = [];
        v.split(/[,，、|]/)
          .map(cleanName)
          .filter(Boolean)
          .forEach(alias => {
            if (!CONFIG.NPC_ALIASES[canonical].some(item => lowerName(cleanName(item)) === lowerName(alias))) {
              CONFIG.NPC_ALIASES[canonical].push(alias);
            }
          });
        return;
      }
      if (kl.indexOf('npc.') === 0) {
        const name = p.k.slice(4).trim();
        if (name && v) CONFIG.NPC_AVATARS[name] = v;
        return;
      }
      if (!v) return;

      if (simple[kl]) {
        CONFIG[simple[kl]] = v;
        return;
      }

      if (kl === 'deco_offset') {
        const n = parseFloat(v);
        if (!isNaN(n)) CONFIG.DECO_OFFSET = Math.max(-100, Math.min(100, n));
        return;
      }
      if (kl === 'stream_mode') {
        const t = v.toLowerCase();
        if (['defer', 'live'].includes(t)) CONFIG.STREAM_MODE = t;
        return;
      }
      if (kl === 'theme') {
        const t = v.toLowerCase();
        if (['auto', 'dark', 'light'].includes(t)) CONFIG.theme = t;
        return;
      }
      if (kl === 'image_size') {
        const m = v.match(/(\d{2,4})\s*[x×*]\s*(\d{2,4})/i);
        if (m) {
          CONFIG.imgW = Number(m[1]);
          CONFIG.imgH = Number(m[2]);
        }
        return;
      }
      if (kl === 'collapse_min') {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n >= 1) CONFIG.collapseMin = n;
        return;
      }
      if (kl === 'char_aliases' || kl === 'char_alias') {
        v.split(/[,，、|]/)
          .map(s => s.trim())
          .filter(Boolean)
          .forEach(a => {
            if (!CONFIG.CHAR_EXTRA_ALIASES.includes(a)) CONFIG.CHAR_EXTRA_ALIASES.push(a);
          });
        return;
      }
    });
  }

  // ---------- 主注入流程（单卡单书直写） ----------
  async function bootstrapWorldInfo(manual) {
    if (STK.busy) return;
    STK.busy = true;
    let wrote = false;
    let failed = false;
    try {
      const book = await resolveBookName();
      if (!book) {
        if (manual) toastMsg('未检测到芙林绑定的世界书，请先在世界书面板完成绑定后再试。', 'warning');
        return;
      }

      STK.book = book;
      const report = [];
      resetConfigurables();

      // 1. 外观配置：只创建不覆盖，创建后立即读回应用
      if (CONFIG.INJECT_CONFIG_WI) {
        const confRes = await upsertEntry(book, SPEC.conf, CONFIG_LIB_DEFAULT, false);
        if (confRes === 'created') {
          report.push('外观配置');
          wrote = true;
        } else if (confRes === 'failed') failed = true;
        const confText = await readEntryContent(book, SPEC.conf.title);
        if (confText != null) {
          applyConfigKV(parseKV(confText));
          const vm = confText.match(/模板版本\s*(v\d+)/);
          STK.confVer = vm ? vm[1] : '';
          if (confRes !== 'created' && STK.confVer !== CONF_VERSION && manual) {
            toastMsg(`外观配置条目为旧模板（${STK.confVer || '未标注'}）。需要新注释可点「重置外观配置」。`, 'info');
          }
        }
      }

      // 2. 表情包链接库：只创建不覆盖
      if (CONFIG.INJECT_STICKER_WI) {
        const libRes = await upsertEntry(book, SPEC.lib, STICKER_LIB_DEFAULT, false);
        if (libRes === 'created') {
          report.push('表情包链接库');
          wrote = true;
        } else if (libRes === 'failed') failed = true;

        const libText = await readEntryContent(book, SPEC.lib.title);
        const fromWi = parseStickerLib(libText != null ? libText : STICKER_LIB_DEFAULT);
        STK.map = Object.assign({}, fromWi, CONFIG.STICKER_MAP || {});

        // 3. 名录：同步内容，但不改动条目开关（respectEnabled）
        const names = Object.keys(STK.map);
        const listRes = await upsertEntry(book, SPEC.list, stickerListText(names), CONFIG.STICKER_SYNC_NAMES || manual);
        if (listRes === 'created' || listRes === 'updated') wrote = true;
        else if (listRes === 'failed') failed = true;
        if (listRes === 'created') report.push('表情包名录');
      } else {
        STK.map = Object.assign({}, CONFIG.STICKER_MAP || {});
      }

      // 4. 格式条目：随脚本强制启用并更新
      if (CONFIG.AUTO_INJECT_WI || manual) {
        const fmtRes = await upsertEntry(book, SPEC.format, FORMAT_TEXT, CONFIG.WI_FORCE_UPDATE || manual);
        if (fmtRes === 'created') {
          report.push('聊天格式条目');
          wrote = true;
        } else if (fmtRes === 'updated') wrote = true;
        else if (fmtRes === 'failed') failed = true;
      }

      STK.loaded = !failed;

      await verifyEntryToggles(book);

      if (failed) {
        console.warn(`[聊天气泡] 世界书「${book}」存在写入失败的条目（可能只读/权限受限/命令异常）。`);
        if (manual) toastMsg(`「${book}」有条目写入失败，可能只读或权限受限，详见控制台。`, 'error');
      } else if (report.length) toastMsg(`已在「${book}」注入：${report.join('、')}。`, 'success');
      else if (manual) toastMsg(`「${book}」条目已同步，配置已重新读取。`, 'success');
    } catch (err) {
      console.warn('[聊天气泡] 世界书处理异常：', err);
      if (manual) toastMsg('世界书处理出错，详见控制台。', 'error');
    } finally {
      STK.busy = false;
      // 自写防抖：真写入后静默 3 秒；未写入也留 800 毫秒挡回波
      STK.lastWrite = Date.now();
      STK.quiet = wrote ? 3000 : 800;
    }
  }

  // ---------- 表情包取图 ----------
  function stickerSrc(rawHtml) {
    let key = unescapeText(String(rawHtml || ''))
      .trim()
      .replace(/^["'「『]+|["'」』]+$/g, '');
    if (!key) return '';
    if (/^https?:\/\/\S+$/i.test(key)) return key;

    const local = CONFIG.STICKER_MAP || {};
    if (local[key]) return local[key];
    if (STK.map[key]) return STK.map[key];

    const lk = key.toLowerCase().replace(/\s+/g, '');
    for (const k in STK.map) {
      if (k.toLowerCase().replace(/\s+/g, '') === lk) return STK.map[k];
    }
    return '';
  }

  // 必须先取父节点再移除自身，否则 remove 之后 parentNode 恒为 null，兜底文字永远出不来
  const STK_FALLBACK =
    "var p=this.parentNode;this.remove();if(p){var o=p.querySelector('.fhb-emo');if(o){o.style.display='';}}";

  // ---------- 类型渲染 ----------
  function waveSVG() {
    const hs = [10, 16, 6, 18, 8, 12];
    return (
      '<svg class="fhb-wave" viewBox="0 0 64 24" aria-hidden="true">' +
      hs.map((h, i) => `<rect x="${2 + i * 11}" y="${(24 - h) / 2}" width="6" height="${h}" rx="3"></rect>`).join('') +
      '</svg>'
    );
  }

  function renderTypedBubble(type, content, extra, claim) {
    switch (type) {
      case 'text':
        return `<div class="fhb-bubble fhb-text">${content}</div>`;

      case 'typing':
        return `<div class="fhb-bubble fhb-typing">${ICON.dots}</div>`;

      case 'voice': {
        const dur = extra || '3"';
        return `<div class="fhb-bubble fhb-voice" title="点击播放/暂停">
                    <span class="fhb-play">${ICON.play}</span>
                    ${waveSVG()}
                    <span class="fhb-dur">${dur}</span>
                </div>
                ${content ? `<div class="fhb-sub">${content}</div>` : ''}`;
      }

      case 'transfer': {
        const note = extra || '';
        return `<div class="fhb-bubble fhb-transfer">
                    <div class="fhb-tag"><span class="fhb-tag-ic">${ICON.coin}</span><span>TRANSFER · 转账</span></div>
                    <div class="fhb-amt">$${content}</div>
                    ${note ? `<div class="fhb-note">${note}</div>` : ''}
                </div>`;
      }

      case 'redpacket': {
        const stRaw = extra || '待领取';
        const state = stRaw.includes('已领') ? 'claimed' : 'pending';
        return `<div class="fhb-bubble fhb-rp" data-state="${state}" data-claim="${claim || 'direct'}">
                    <span class="fhb-rp-ic">${ICON.envelope}</span>
                    <div class="fhb-rp-col">
                        <div class="fhb-rp-text">${content || '大吉大利'}</div>
                        <div class="fhb-rp-status">${stRaw}</div>
                    </div>
                </div>`;
      }

      case 'image': {
        const kws = (extra || '')
          .split(/[,，]/)
          .map(k => k.replace(/[^a-zA-Z0-9 -]/g, '').trim())
          .filter(Boolean)
          .join(',');
        const url = `https://loremflickr.com/${CONFIG.imgW}/${CONFIG.imgH}/${kws || 'night,bar'}/all`;
        return `<figure class="fhb-fig">
                    <div class="fhb-imgwrap">
                        <div class="fhb-imgfb"><span class="fhb-imgfb-ic">${ICON.imgph}</span><span class="fhb-imgfb-tx">影像载入中</span></div>
                        <img class="fhb-img" src="${url}" alt="${escapeAttr(content)}" loading="lazy" onload="this.previousElementSibling.style.display='none'" onerror="this.style.display='none';var f=this.previousElementSibling;f.style.display='flex';f.querySelector('.fhb-imgfb-tx').textContent='影像未能送达';">
                    </div>
                    <figcaption>${content}${kws ? `<span class="fhb-kw">${kws.replace(/,/g, ' · ')}</span>` : ''}</figcaption>
                </figure>`;
      }

      case 'sticker': {
        const raw = content || '🍸';
        // 去掉 markdown 渲染出的内联标签，否则名字匹配与二次回填都会失败
        const key = stripTags(raw).trim() || raw;
        const src = stickerSrc(key);
        const plain = unescapeText(key).trim();
        const isGlyph = plain.length <= 6 && !/[a-zA-Z\u4e00-\u9fa5]{2,}/.test(plain);
        const txtCls = isGlyph ? 'fhb-emo' : 'fhb-emo fhb-emo-txt';
        const hide = src ? ' style="display:none"' : '';
        const img = src
          ? `<img class="fhb-stk-img" src="${escapeAttr(src)}" alt="${attrRaw(key)}" loading="lazy" onerror="${STK_FALLBACK}">`
          : '';
        return `<div class="fhb-bubble fhb-sticker" data-stk="${attrRaw(key)}">
                    ${img}<span class="${txtCls}"${hide}>${raw}</span>
                    ${extra ? `<div class="fhb-sticker-cap">${extra}</div>` : ''}
                </div>`;
      }

      case 'call': {
        const isVideo = extra.includes('视频');
        const missed = /未接|拒接|失败|取消/.test(content);
        return `<div class="fhb-bubble fhb-call${missed ? ' fhb-missed' : ''}">
                    <span class="fhb-callic">${isVideo ? ICON.video : ICON.phone}</span>
                    <div class="fhb-call-col">
                        <div class="fhb-call-title">${content || '通话结束'}</div>
                        <div class="fhb-call-sub">${extra || '语音通话'}</div>
                    </div>
                </div>`;
      }

      case 'location':
        return `<div class="fhb-bubble fhb-loc">
                    <svg class="fhb-pin" viewBox="0 0 24 24" aria-hidden="true">
                        <circle class="fhb-pulse" cx="12" cy="9" r="8" fill="none" stroke="currentColor" stroke-width="1"/>
                        <path fill="currentColor" d="M12 1C7.6 1 4 4.6 4 9c0 5.8 6.6 12.6 7.3 13.3.4.4 1 .4 1.4 0C13.4 21.6 20 14.8 20 9c0-4.4-3.6-8-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>
                    </svg>
                    <div class="fhb-loc-col">
                        <div class="fhb-loc-name">${content || '某处'}</div>
                        ${extra ? `<div class="fhb-loc-area">${extra}</div>` : ''}
                    </div>
                </div>`;

      case 'file':
        return `<div class="fhb-bubble fhb-file">
                    <span class="fhb-fileic">${ICON.file}</span>
                    <div class="fhb-file-col">
                        <div class="fhb-file-name">${content || '未命名文件'}</div>
                        ${extra ? `<div class="fhb-file-sub">${extra}</div>` : ''}
                    </div>
                </div>`;

      default:
        return `<div class="fhb-bubble fhb-text">${content}</div>`;
    }
  }

  function statusHTML(extra) {
    if (!extra) return '';
    const known = /已读|未读|失败|送达/.test(extra);
    if (!known) return '';
    let cls = 's-plain';
    let ic = '';
    if (extra.includes('失败')) {
      cls = 's-fail';
    } else if (extra.includes('已读')) {
      cls = 's-read';
      ic = ICON.check;
    } else {
      cls = 's-sent';
      ic = ICON.check;
    }
    return `<div class="fhb-tstatus ${cls}">${ic}<span>${extra}</span></div>`;
  }

  // ---------- 群名识别 ----------
  function detectGroups(senders, recvBy) {
    const groups = new Set();
    recvBy.forEach((from, key) => {
      if (!key) return;
      if (isUserSender(key) || isCharSender(key)) return;
      if (senders.has(key)) return;
      if (from.size >= 2) {
        groups.add(key);
        return;
      }
      if (CONFIG.groupHint.test(key)) groups.add(key);
    });
    return groups;
  }

  // ---------- 红包归属判定 ----------
  function redpacketClaim(sKind, rKind, recipient, groupNames) {
    if (sKind === 'user') return 'self';
    if (rKind === 'user') return 'direct';
    if (groupNames && groupNames.has(lowerName(cleanName(recipient)))) return 'group-in';
    return 'peer';
  }

  // ---------- 单条解析与构建 ----------
  const ENTRY_RE = new RegExp(
    '\\[(' + CONFIG.types.join('|') + ')\\|([^\\[\\]|]*\\|[^\\[\\]|]*\\|[^\\[\\]]*?)\\]',
    'gi',
  );
  const TIME_RE = /^(\d{1,2}[:：]\d{2}(?::\d{2})?(\s?[APap]\.?[Mm]\.?)?|\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}.*)$/;

  function buildEntry(type, restRaw, idx, groupNames, noAnim) {
    const parts = restRaw.split('|');
    if (parts.length < 3) return null;
    let sender = cleanName(unescapeText(parts[0]));
    let recipient = cleanName(unescapeText(parts[1]));
    let rest = parts.slice(2);

    let time = '';
    if (rest.length) {
      const last = (rest[rest.length - 1] || '').trim().replace(/：/g, ':');
      if (TIME_RE.test(last)) time = rest.pop().trim();
    }
    const content = (rest[0] || '').trim();
    const extra = rest.slice(1).join('|').trim();
    const delayStyle = noAnim ? '' : ` style="animation-delay:${Math.min(idx * 50, 400)}ms"`;

    if (type === 'system') {
      if (!content) return null;
      return `<div class="fhb-sys"${delayStyle}><span class="fhb-sys-cap">${content}</span>${time ? `<span class="fhb-sys-time">${time}</span>` : ''}</div>`;
    }

    const CN = ctx.charName || CONFIG.charNameFallback;
    const UN = ctx.userName || 'user';
    if (!sender && !recipient) {
      sender = CN;
      recipient = UN;
    } else if (!sender) {
      sender = senderKind(recipient) === 'user' ? CN : UN;
    } else if (!recipient) {
      recipient = senderKind(sender) === 'user' ? CN : UN;
    }

    const sKind = senderKind(sender);
    const rKind = senderKind(recipient);
    const isUser = sKind === 'user';
    const isGroupTarget = !!(groupNames && groupNames.has(lowerName(recipient)));

    const observer = sKind !== 'user' && rKind !== 'user';
    const inGroupMine = isUser && isGroupTarget;
    const foldable = observer || inGroupMine;

    const sideCls = isUser ? 'fhb-user' : observer ? 'fhb-obs' : 'fhb-other';
    const isChar = sKind === 'char';
    const name = displayName(sender);
    const rName = displayName(recipient);

    // 【芙林专属】名字前的玫瑰标记
    const charMark = isChar ? `<span class="fhb-charmark">${ICON.roseTiny}</span>` : '';
    const showRcp = observer || inGroupMine;
    const metaInner = showRcp
      ? `${charMark}<span class="fhb-name">${escapeHTML(name)}</span>${ICON.arrow}<span class="fhb-rcp">${escapeHTML(rName)}</span>${time ? `<span class="fhb-sep">·</span><span class="fhb-time">${time}</span>` : ''}`
      : `${charMark}<span class="fhb-name">${escapeHTML(name)}</span>${time ? `<span class="fhb-sep">·</span><span class="fhb-time">${time}</span>` : ''}`;

    const claim = type === 'redpacket' ? redpacketClaim(sKind, rKind, recipient, groupNames) : '';
    const bubble = renderTypedBubble(type, content, extra, claim);
    const status = type === 'text' ? statusHTML(extra) : '';
    const colCls = type === 'image' ? ' fhb-col-wide' : '';

    const clsList = ['fhb-msg', sideCls, 'fhb-k-' + sKind];
    if (observer) clsList.push('fhb-observer');
    if (foldable) clsList.push('fhb-thmsg');

    return `<div class="${clsList.join(' ')}"${delayStyle} data-kind="${sKind}" data-raw="${escapeAttr(sender)}" data-disp="${escapeAttr(name)}" data-rkind="${rKind}" data-rdisp="${escapeAttr(rName)}" data-grp="${isGroupTarget ? 1 : 0}">${avatarHTML(sKind, sender)}<div class="fhb-col${colCls}"><div class="fhb-meta">${metaInner}</div><div class="fhb-bubble-wrap">${bubble}${decoHTML(sKind)}</div>${status}</div></div>`;
  }

  // ---------- 解析前净化 ----------
  function sanitizeForParse(html) {
    let h = String(html || '');

    h = h.replace(/<span\b[^>]*?data-th-user-name-original="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi, '$1');
    h = h.replace(/<span\b[^>]*class="[^"]*\bTH-user-name-replace-flow\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, '$1');

    let prev = '';
    let loop = 0;
    do {
      prev = h;
      loop++;
      h = h.replace(/<(pre|code)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi, (m, tag, inner) => {
        ENTRY_RE.lastIndex = 0;
        const hit = ENTRY_RE.test(inner);
        ENTRY_RE.lastIndex = 0;
        return hit ? inner : m;
      });
      h = h.replace(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi, (m, inner) => {
        ENTRY_RE.lastIndex = 0;
        const hit = ENTRY_RE.test(inner);
        if (!hit) {
          ENTRY_RE.lastIndex = 0;
          return m;
        }
        const rest = inner
          .replace(ENTRY_RE, '')
          .replace(/<br\s*\/?\s*>/gi, '')
          .replace(/[\s\u00a0\u3000\ufeff\u200b]/g, '');
        ENTRY_RE.lastIndex = 0;
        return rest === '' ? inner : m;
      });
    } while (h !== prev && loop < 6);

    return h;
  }

  function cleanSiblings(textEl) {
    const BLANK = /[\s\u00a0\u3000\ufeff\u200b]/g;
    const nodes = Array.from(textEl.childNodes);
    const isBubble = x =>
      x &&
      x.nodeType === 1 &&
      x.classList &&
      (x.classList.contains('fhb-msg') || x.classList.contains('fhb-sys') || x.classList.contains('fhb-thread'));
    // 只清理气泡相邻的空白文本与 <br>；远离气泡的空白可能是行内元素间的合法空格
    nodes.forEach((n, i) => {
      if (n.nodeType === 3) {
        if (!n.textContent.replace(BLANK, '') && (isBubble(nodes[i - 1]) || isBubble(nodes[i + 1]))) n.remove();
      } else if (n.nodeType === 1 && n.tagName === 'BR') {
        if (isBubble(nodes[i - 1]) || isBubble(nodes[i + 1])) n.remove();
      }
    });
  }

  // ---------- 节点判定 ----------
  function isThreadNode(n) {
    return n.nodeType === 1 && n.classList && (n.classList.contains('fhb-thmsg') || n.classList.contains('fhb-sys'));
  }

  function isThMsg(n) {
    return n.nodeType === 1 && n.classList && n.classList.contains('fhb-thmsg');
  }

  function isEmptyJunkEl(n) {
    if (n.nodeType !== 1) return false;
    if (!['P', 'DIV', 'SPAN'].includes(n.tagName)) return false;
    if (n.attributes && n.attributes.length) return false;
    if (n.childElementCount > 0) return false;
    return !n.textContent.replace(/[\s\u00a0\u3000\u200b\ufeff]/g, '');
  }

  function isSkippable(n) {
    if (n.nodeType === 8) return true;
    if (n.nodeType === 3) return !n.textContent.trim();
    if (n.nodeType !== 1) return false;
    if (n.tagName === 'BR') return true;
    if (
      n.classList &&
      (n.classList.contains('fhb-msg') || n.classList.contains('fhb-sys') || n.classList.contains('fhb-thread'))
    )
      return false;
    return isEmptyJunkEl(n);
  }

  // ---------- 折叠卡片 ----------
  function peopleOf(msgs) {
    const s = new Set();
    msgs.forEach(m => {
      if (m.dataset && m.dataset.disp) s.add(m.dataset.disp);
      if (m.dataset && m.dataset.rdisp) s.add(m.dataset.rdisp);
    });
    return s;
  }

  function threadTitle(msgs) {
    const sCount = new Map();
    const rCount = new Map();
    let anyGroup = false;
    msgs.forEach(m => {
      const s = m.dataset.disp;
      const r = m.dataset.rdisp;
      if (m.dataset.grp === '1') anyGroup = true;
      if (s) sCount.set(s, (sCount.get(s) || 0) + 1);
      if (r) rCount.set(r, (rCount.get(r) || 0) + 1);
    });
    const senders = [...sCount.keys()];
    let mainR = '';
    let mainN = 0;
    rCount.forEach((v, k) => {
      if (v > mainN) {
        mainN = v;
        mainR = k;
      }
    });

    if (anyGroup && mainR) return `群聊「${mainR}」`;
    if (mainR && !sCount.has(mainR)) {
      if (senders.length === 1 && rCount.size === 1) return `${senders[0]} ↔ ${mainR} 的私聊`;
      return `群聊「${mainR}」`;
    }
    if (senders.length === 2) return `${senders[0]} ↔ ${senders[1]} 的私聊`;
    if (senders.length === 1 && mainR) return `${senders[0]} ↔ ${mainR} 的私聊`;
    if (senders.length > 2 && mainR) return `群聊「${mainR}」`;
    return '一段旁观的对话';
  }

  function refreshThreadCard(wrap) {
    const msgs = Array.from(wrap.querySelectorAll('.fhb-thmsg'));
    const count = wrap.querySelectorAll('.fhb-thmsg, .fhb-sys').length;

    const last = msgs[msgs.length - 1];
    const bub = last && (last.querySelector('.fhb-bubble') || last.querySelector('figcaption'));
    let peek = ((bub ? bub.textContent : last ? last.textContent : '') || '').replace(/\s+/g, ' ').trim();
    if (peek.length > 42) peek = peek.slice(0, 42) + '…';

    const titleEl = wrap.querySelector('.fhb-th-title');
    const peekEl = wrap.querySelector('.fhb-th-peek');
    const countEl = wrap.querySelector('.fhb-th-count');
    if (titleEl) titleEl.textContent = threadTitle(msgs);
    if (peekEl) peekEl.textContent = '最近 · ' + peek;
    if (countEl) countEl.textContent = count + ' 条';
  }

  function bindThreadHead(wrap) {
    const head = wrap.querySelector('.fhb-th-head');
    if (!head || head.dataset.bound === '1') return;
    head.dataset.bound = '1';
    head.addEventListener('click', () => {
      const open = wrap.classList.toggle('open');
      const tx = head.querySelector('.fhb-th-tx');
      if (tx) tx.textContent = open ? '收起' : '展开';
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function wrapThread(textEl, run) {
    while (run.length && !isThreadNode(run[run.length - 1])) run.pop();
    if (!run.length) return;
    const msgs = run.filter(isThMsg);

    let anchor = run[0].previousSibling;
    while (anchor && isSkippable(anchor)) anchor = anchor.previousSibling;
    let wrap =
      anchor && anchor.nodeType === 1 && anchor.classList && anchor.classList.contains('fhb-thread') ? anchor : null;

    if (wrap && msgs.length) {
      const oldPeople = peopleOf(Array.from(wrap.querySelectorAll('.fhb-thmsg')));
      const newPeople = peopleOf(msgs);
      let overlap = false;
      newPeople.forEach(p => {
        if (oldPeople.has(p)) overlap = true;
      });
      if (!overlap && oldPeople.size) wrap = null;
    }

    if (!wrap && msgs.length < CONFIG.collapseMin) return;

    if (!wrap) {
      wrap = PD.createElement('div');
      wrap.className = 'fhb-thread';
      wrap.innerHTML = `
                <button type="button" class="fhb-th-head" aria-expanded="false">
                    <span class="fhb-th-icon">${ICON.phone}</span>
                    <span class="fhb-th-main">
                        <span class="fhb-th-title"></span>
                        <span class="fhb-th-peek"></span>
                    </span>
                    <span class="fhb-th-count"></span>
                    <span class="fhb-th-toggle"><span class="fhb-th-tx">展开</span><svg class="fhb-th-caret" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
                </button>
                <div class="fhb-thread-body"><div class="fhb-thread-inner"></div></div>`;
      textEl.insertBefore(wrap, run[0]);
      bindThreadHead(wrap);
    }

    const inner = wrap.querySelector('.fhb-thread-inner');
    run.forEach(n => inner.appendChild(n));
    refreshThreadCard(wrap);
  }

  function groupThreads(textEl) {
    if (!textEl.querySelector(':scope > .fhb-thmsg, :scope > .fhb-sys')) return;
    {
      // 只移除与折叠节点相邻的空壳标签；叙述区域的空 <p> 也参与排版间距，不能动
      const kidNodes = Array.from(textEl.childNodes);
      const near = x =>
        x && x.nodeType === 1 && x.classList && (x.classList.contains('fhb-thmsg') || x.classList.contains('fhb-sys'));
      kidNodes.forEach((n, i) => {
        if (
          n.nodeType === 1 &&
          n.tagName !== 'BR' &&
          isEmptyJunkEl(n) &&
          (near(kidNodes[i - 1]) || near(kidNodes[i + 1]))
        )
          n.remove();
      });
    }
    const nodes = Array.from(textEl.childNodes);
    const runs = [];
    let current = [];
    for (const n of nodes) {
      if (isThreadNode(n)) current.push(n);
      else if (isSkippable(n) && current.length) current.push(n);
      else {
        if (current.length) {
          runs.push(current);
          current = [];
        }
      }
    }
    if (current.length) runs.push(current);
    runs.forEach(run => wrapThread(textEl, run));
  }

  // ---------- DOM 转换 ----------
  function transformElement(textEl, opt) {
    if (!textEl || !textEl.innerHTML) return;
    if (isEditing(textEl)) return;

    const forced = opt && opt.force;
    // 流式守卫：defer 模式下生成中的那一楼完全不碰
    if (!forced && isGenerating() && streamMode() === 'defer' && textEl === lastMesText()) return;

    // 廉价短路：既没有可能的条目文本，也没有待归拢的气泡，直接跳过整轮重解析
    if (textEl.textContent.indexOf('[') === -1 && !textEl.querySelector(':scope > .fhb-thmsg, :scope > .fhb-sys')) {
      bindDelegation(textEl);
      return;
    }

    const noAnim = textEl.dataset.fhbNoanim === '1';

    let rendered = false;
    ENTRY_RE.lastIndex = 0;
    const html = sanitizeForParse(textEl.innerHTML);
    if (ENTRY_RE.test(html)) {
      ENTRY_RE.lastIndex = 0;

      const senders = new Set();
      const recvBy = new Map();
      html.replace(ENTRY_RE, (m, t, rest) => {
        const p = rest.split('|');
        const s = lowerName(cleanName(unescapeText(p[0])));
        const r = lowerName(cleanName(unescapeText(p[1])));
        if (s) senders.add(s);
        if (r) {
          if (!recvBy.has(r)) recvBy.set(r, new Set());
          if (s) recvBy.get(r).add(s);
        }
        return m;
      });
      const groupNames = detectGroups(senders, recvBy);
      ENTRY_RE.lastIndex = 0;

      let idx = 0;
      const out = html.replace(ENTRY_RE, (m, type, rest) => {
        const frag = buildEntry(type.toLowerCase(), rest, idx++, groupNames, noAnim);
        return frag ? frag : m;
      });
      if (out !== html) {
        textEl.innerHTML = out;
        cleanSiblings(textEl);
        groupThreads(textEl);
        rendered = true;
      }
    } else {
      groupThreads(textEl);
    }
    bindDelegation(textEl);
    if (rendered && typeof eventEmit === 'function') {
      const mes = textEl.closest ? textEl.closest('.mes') : null;
      const messageId = Number(mes && mes.getAttribute('mesid'));
      if (Number.isInteger(messageId) && messageId >= 0) {
        void eventEmit(FHB_MESSAGE_RENDERED_EVENT, messageId);
      }
    }
  }

  function denyClaim(rp, reason) {
    rp.classList.remove('fhb-deny');
    void rp.offsetWidth;
    rp.classList.add('fhb-deny');
    const msgs = {
      self: '自己发的红包，就别抢了。',
      peer: '这是发给他人的红包。',
    };
    toastMsg(msgs[reason] || msgs.peer, 'warning');
  }

  function bindDelegation(textEl) {
    if (textEl.dataset.fhbBound === '1') return;
    textEl.dataset.fhbBound = '1';
    textEl.addEventListener('click', e => {
      const vb = e.target.closest('.fhb-voice');
      if (vb) {
        vb.classList.toggle('fhb-playing');
        return;
      }
      const rp = e.target.closest('.fhb-rp');
      if (rp && rp.dataset.state === 'pending') {
        const claim = rp.dataset.claim || 'direct';
        if (claim === 'self' || claim === 'peer') {
          denyClaim(rp, claim);
          return;
        }
        rp.dataset.state = 'claimed';
        const st = rp.querySelector('.fhb-rp-status');
        if (st) st.textContent = '已领取';
        const burst = PD.createElement('span');
        burst.className = 'fhb-burst';
        rp.appendChild(burst);
        burst.addEventListener('animationend', () => burst.remove());
        toastMsg('红包已收下。', 'success');
      }
    });
  }

  // ---------- 表情包回填 ----------
  function restickerAll() {
    if (anyEditing()) return;
    PD.querySelectorAll('.fhb-sticker[data-stk]').forEach(el => {
      if (el.querySelector('.fhb-stk-img')) return;
      const raw = el.getAttribute('data-stk') || '';
      const src = stickerSrc(raw);
      if (!src) return;
      const old = el.querySelector('.fhb-emo');
      const img = PD.createElement('img');
      img.className = 'fhb-stk-img';
      img.src = src;
      img.alt = unescapeText(raw);
      img.loading = 'lazy';
      img.onerror = function () {
        img.remove();
        if (old) old.style.display = '';
      };
      if (old) {
        old.style.display = 'none';
      }
      el.insertBefore(img, el.firstChild);
    });
  }

  // ---------- 原地刷新已渲染头像 ----------
  function refreshAllAvatars() {
    if (anyEditing()) return;
    PD.querySelectorAll('.fhb-msg[data-kind]').forEach(m => {
      const kind = m.dataset.kind;
      const raw = m.dataset.raw || '';
      const holder = m.querySelector('.fhb-avwrap') || m.querySelector('.fhb-avatar');
      if (!holder || !kind) return;
      const div = PD.createElement('div');
      div.innerHTML = avatarHTML(kind, raw);
      const fresh = div.firstElementChild;
      if (fresh) holder.replaceWith(fresh);
    });
  }

  function processAll(opt) {
    if (anyEditing()) return;
    PD.querySelectorAll('#chat .mes .mes_text').forEach(el => transformElement(el, opt));
  }

  function processById(id, opt) {
    if (anyEditing()) return;
    try {
      const el = PD.querySelector(`#chat .mes[mesid="${id}"] .mes_text`);
      if (el) transformElement(el, opt);
    } catch (e) {}
  }

  function refreshVisuals() {
    resolveContext();
    injectStyle();
    refreshAllAvatars();
    restickerAll();
    applyDecos();
  }

  // ---------- 主题检测与样式注入 ----------
  function detectDark() {
    if (CONFIG.theme === 'dark') return true;
    if (CONFIG.theme === 'light') return false;
    try {
      const cands = ['#chat', 'body', 'html'];
      for (const sel of cands) {
        const el = sel === 'html' ? PD.documentElement : PD.querySelector(sel);
        if (!el) continue;
        const c = PW.getComputedStyle(el).backgroundColor;
        const m = c && c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/.]+([\d.]+))?/);
        if (m) {
          if (m[4] !== undefined && parseFloat(m[4]) < 0.2) continue;
          const lum = 0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3];
          return lum < 128;
        }
      }
    } catch (e) {}
    return true;
  }

  function softColor(color, alpha) {
    const c = String(color || '').trim();
    let r = 200,
      g = 60,
      b = 78;
    let m = c.match(/^#([0-9a-f]{3})$/i);
    if (m) {
      r = parseInt(m[1][0] + m[1][0], 16);
      g = parseInt(m[1][1] + m[1][1], 16);
      b = parseInt(m[1][2] + m[1][2], 16);
    } else {
      m = c.match(/^#([0-9a-f]{6})$/i);
      if (m) {
        r = parseInt(m[1].slice(0, 2), 16);
        g = parseInt(m[1].slice(2, 4), 16);
        b = parseInt(m[1].slice(4, 6), 16);
      } else {
        m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
        if (m) {
          r = +m[1];
          g = +m[2];
          b = +m[3];
        } else return `rgba(200,60,78,${alpha})`;
      }
    }
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function bubbleTokenCSS() {
    const map = { user: 'u', char: 'c', npc: 'n' };
    let s = '';
    for (const who of ['user', 'char', 'npc']) {
      const b = (CONFIG.BUBBLE || {})[who];
      if (!b) continue;
      const k = map[who];
      if (b.bg) {
        s += `--fhb-${k}-bg:${b.bg};`;
        s += `--fhb-${k}-tail:${/gradient\s*\(/i.test(b.bg) ? 'transparent' : b.bg};`;
      }
      if (b.tx) s += `--fhb-${k}-tx:${b.tx};`;
      if (b.bd) s += `--fhb-${k}-bd:${b.bd};`;
      if (b.bs) {
        if (b.bs === 'slash') {
          const col = b.bd || '#d8a33d';
          s += `--fhb-${k}-bs:solid;`;
          s += `--fhb-${k}-bi:repeating-linear-gradient(45deg,${col} 0 6px,transparent 6px 12px) 1;`;
        } else {
          s += `--fhb-${k}-bs:${b.bs};`;
        }
      }
      if (b.bw) s += `--fhb-${k}-bw:${b.bw};`;
    }
    if (CONFIG.DECO_SIZE && String(CONFIG.DECO_SIZE).trim()) {
      s += `--fhb-deco-w:${normWidth(CONFIG.DECO_SIZE) || String(CONFIG.DECO_SIZE).trim()};`;
    }
    if (CONFIG.DECO_OFFSET !== '' && CONFIG.DECO_OFFSET != null && !isNaN(parseFloat(CONFIG.DECO_OFFSET))) {
      s += `--fhb-deco-o:${parseFloat(CONFIG.DECO_OFFSET)}%;`;
    }
    return s;
  }

  function tokenCSS(t) {
    return `--fhb-ink:${t.ink};--fhb-bo-bg:${t.boBg};--fhb-bo-tx:${t.boTx};--fhb-bo-br:${t.boBr};--fhb-bu-bg:${t.buBg};--fhb-bu-tx:${t.buTx};--fhb-bu-tail:${t.buTail};--fhb-bu-br:${t.buBr};--fhb-red:${t.red};--fhb-red-soft:${t.redSoft};--fhb-gold:${t.gold};--fhb-meta:${t.meta};--fhb-hairline:${t.hairline};--fhb-shadow:${t.shadow};--fhb-tr-bg:${t.trBg};--fhb-tr-br:${t.trBr};--fhb-tr-tx:${t.trTx};--fhb-tr-note:${t.trNote};--fhb-tr-tag:${t.trTag};--fhb-card-bg:${t.cardBg};--fhb-card-head:${t.cardHead};--fhb-card-head-h:${t.cardHeadH};--fhb-card-shadow:${t.cardShadow};--fhb-char-bg:${t.charBg};--fhb-char-br:${t.charBr};--fhb-char-shadow:${t.charShadow};--fhb-char-glow:${t.charGlow};--fhb-charwm:${t.charWm};--fhb-seal:${t.seal};--fhb-rose:${t.rose};--fhb-rose-deep:${t.roseDeep};--fhb-leaf:${t.leaf};${t.stkW ? '--fhb-stk-w:' + t.stkW + ';' : ''}${bubbleTokenCSS()}`;
  }

  function buildCSS(p) {
    return `
.fhb-msg,.fhb-sys,.fhb-thread{${tokenCSS(p)}--fhb-serif:Didot,'Bodoni MT','Playfair Display','Songti SC','STSong',Georgia,serif;--fhb-sans:'Helvetica Neue','Avenir Next',Arial,'PingFang SC','Microsoft YaHei',sans-serif;--fhb-trans:all .28s cubic-bezier(.22,.61,.36,1);}
.fhb-msg{display:flex;align-items:flex-start;gap:11px;margin:14px 2px;opacity:0;animation:fhbIn .5s ease forwards;font-family:var(--fhb-sans);color:var(--fhb-ink);max-width:100%;}
.fhb-msg.fhb-user{flex-direction:row-reverse;}
[data-fhb-noanim="1"] .fhb-msg,[data-fhb-noanim="1"] .fhb-sys,[data-fhb-noanim="1"] .fhb-thread{animation:none!important;opacity:1!important;}
[data-fhb-noanim="1"] .fhb-bubble,[data-fhb-noanim="1"] .fhb-bubble-wrap{transition:none!important;}
.fhb-avwrap{position:relative;width:40px;height:40px;flex:none;}
.fhb-avatar{position:absolute;inset:0;width:100%;height:100%;border-radius:50%;overflow:hidden;border:1.5px solid var(--fhb-gold);box-shadow:0 3px 10px rgba(0,0,0,.25);z-index:2;transform:scale(1);transform-origin:left top;transition:transform .3s cubic-bezier(.22,.61,.36,1),box-shadow .3s ease;transition-delay:0s;}
.fhb-user .fhb-avatar{transform-origin:right top;}
.fhb-avwrap:hover{z-index:30;}
.fhb-avwrap:hover .fhb-avatar{transform:scale(2.25);transition-delay:.4s;box-shadow:0 12px 30px rgba(0,0,0,.48),0 0 0 2px var(--fhb-red-soft);}
.fhb-av-char{background:linear-gradient(135deg,var(--fhb-red) 0%,#4c0b14 100%);border-color:var(--fhb-gold);box-shadow:0 3px 12px rgba(0,0,0,.35),inset 0 0 8px rgba(255,220,180,.22);}
.fhb-av-user{background:linear-gradient(135deg,#3a332b 0%,#17130f 100%);}
.fhb-avi{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--fhb-serif);color:#f7f0e1;font-size:14px;letter-spacing:.05em;}
.fhb-av{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
/* 【芙林专属】玫瑰藤蔓框：恒定慢转，不随悬停变化 */
.fhb-w-char::before{content:'';position:absolute;inset:-4px;border-radius:50%;background:conic-gradient(from 0deg,transparent 0deg,var(--fhb-red) 70deg,transparent 150deg,transparent 360deg);filter:blur(2.5px);opacity:.5;animation:fhbSpin 6.5s linear infinite;z-index:0;}
.fhb-vine{position:absolute;inset:-8px;width:calc(100% + 16px);height:calc(100% + 16px);overflow:visible;pointer-events:none;z-index:3;transition:opacity .18s ease .25s;}
.fhb-avwrap:hover .fhb-vine{opacity:0;transition-delay:.4s;}
.fhb-w-char:hover::before{opacity:0;transition:opacity .18s ease .4s;}
.fhb-vine-ring{fill:none;stroke:var(--fhb-gold);stroke-width:.9;stroke-dasharray:9 7;opacity:.75;transform-box:fill-box;transform-origin:center;animation:fhbSpinBack 30s linear infinite;}
.fhb-vine-arc{transform-box:fill-box;transform-origin:center;animation:fhbSpin 26s linear infinite;}
.fhb-vine-stem{fill:none;stroke:var(--fhb-leaf);stroke-width:1.5;stroke-linecap:round;opacity:.9;}
.fhb-leaf{fill:var(--fhb-leaf);opacity:.85;}
.fhb-thorn{stroke:var(--fhb-leaf);stroke-width:1.1;stroke-linecap:round;opacity:.7;}
.fhb-rose-bud{fill:var(--fhb-rose);}
.fhb-rose-swirl{fill:none;stroke:var(--fhb-rose-deep);stroke-width:.9;stroke-linecap:round;opacity:.85;}
.fhb-rose-sepal{stroke:var(--fhb-leaf);stroke-width:1;stroke-linecap:round;}
.fhb-rose{transform-box:fill-box;transform-origin:center;}
.fhb-col{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:4px;max-width:min(72%,480px);min-width:0;}
.fhb-col-wide{max-width:min(86%,440px);}
.fhb-user .fhb-col{align-items:flex-end;text-align:left;}
.fhb-bubble-wrap{position:relative;display:block;width:fit-content;max-width:100%;transition:transform .28s cubic-bezier(.22,.61,.36,1);}
.fhb-meta{display:flex;align-items:baseline;gap:6px;font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--fhb-meta);font-variant-numeric:tabular-nums;flex-wrap:wrap;}
.fhb-user .fhb-meta{justify-content:flex-end;}
.fhb-name{font-family:var(--fhb-serif);font-weight:700;}
.fhb-rcp{font-family:var(--fhb-serif);font-weight:700;color:var(--fhb-gold);}
.fhb-arr{width:12px;height:9px;display:inline-block;flex:none;opacity:.8;}
.fhb-sep{opacity:.6;}
/* 【芙林专属】名字前的玫瑰标记 */
.fhb-charmark{width:12px;height:12px;flex:none;align-self:center;color:var(--fhb-red);filter:drop-shadow(0 0 4px var(--fhb-char-glow));animation:fhbMarkBeat 3.4s ease-in-out infinite;}
.fhb-charmark svg{width:100%;height:100%;display:block;}
.fhb-bubble{position:relative;padding:10px 14px;border-radius:14px;background:var(--fhb-bo-bg);color:var(--fhb-bo-tx);border:1px solid var(--fhb-bo-br);box-shadow:var(--fhb-shadow);transition:var(--fhb-trans);font-size:14.5px;line-height:1.65;word-break:break-word;max-width:100%;}
.fhb-user .fhb-bubble{background:var(--fhb-u-bg,var(--fhb-bu-bg));color:var(--fhb-u-tx,var(--fhb-bu-tx));border-color:var(--fhb-u-bd,transparent);}
.fhb-bubble-wrap:hover{transform:translateY(-2px);}
.fhb-other .fhb-bubble:not(.fhb-transfer):not(.fhb-rp):not(.fhb-sticker)::before,.fhb-obs .fhb-bubble:not(.fhb-transfer):not(.fhb-rp):not(.fhb-sticker)::before{content:'';position:absolute;left:-6px;top:15px;border-style:solid;border-width:5px 8px 5px 0;border-color:transparent var(--fhb-n-tail,var(--fhb-bo-bg)) transparent transparent;}
.fhb-user .fhb-bubble:not(.fhb-sticker):not(.fhb-rp):not(.fhb-transfer)::after{content:'';position:absolute;right:-6px;top:15px;border-style:solid;border-width:5px 0 5px 8px;border-color:transparent transparent transparent var(--fhb-u-tail,var(--fhb-bu-tail));}
/* 【芙林专属】丝绒金线气泡 + 玫瑰水印（左红饰线固定，其余边可配置） */
.fhb-k-char .fhb-bubble:not(.fhb-sticker):not(.fhb-rp):not(.fhb-transfer){background:var(--fhb-charwm) right -6px bottom -10px/56px auto no-repeat,var(--fhb-c-bg,var(--fhb-char-bg));color:var(--fhb-c-tx,var(--fhb-bo-tx));border:var(--fhb-c-bw,1px) var(--fhb-c-bs,solid) var(--fhb-c-bd,var(--fhb-char-br));border-left:3px solid var(--fhb-red);border-image:var(--fhb-c-bi,none);box-shadow:var(--fhb-char-shadow);}
.fhb-k-char .fhb-bubble:not(.fhb-sticker):not(.fhb-rp):not(.fhb-transfer)::after{content:'';position:absolute;left:12px;right:12px;top:0;height:1px;background:linear-gradient(90deg,transparent,var(--fhb-gold),transparent);opacity:.7;pointer-events:none;}
.fhb-k-char .fhb-bubble:not(.fhb-sticker):not(.fhb-rp):not(.fhb-transfer):hover{box-shadow:0 12px 28px rgba(0,0,0,.34),0 0 0 1px var(--fhb-gold),0 0 20px var(--fhb-char-glow);}
.fhb-k-char .fhb-bubble:not(.fhb-transfer):not(.fhb-rp):not(.fhb-sticker)::before {border-right-color: var(--fhb-c-tail, var(--fhb-bo-bg));}
.fhb-msg.fhb-k-npc .fhb-bubble{background:var(--fhb-n-bg,var(--fhb-bo-bg));color:var(--fhb-n-tx,var(--fhb-bo-tx));border:var(--fhb-n-bw,1px) var(--fhb-n-bs,solid) var(--fhb-n-bd,var(--fhb-bo-br));border-image:var(--fhb-n-bi,none);}
.fhb-obs.fhb-k-char .fhb-bubble:not(.fhb-sticker){border-left-style:solid;}
.fhb-obs .fhb-bubble:not(.fhb-sticker):not(.fhb-rp):not(.fhb-transfer){border-left-style:dashed;}
.fhb-user .fhb-bubble:not(.fhb-sticker):not(.fhb-rp):not(.fhb-transfer){background:var(--fhb-seal) left -12px top -12px/48px auto no-repeat,var(--fhb-u-bg,var(--fhb-bu-bg));color:var(--fhb-u-tx,var(--fhb-bu-tx));border:var(--fhb-u-bw,1px) var(--fhb-u-bs,solid) var(--fhb-u-bd,var(--fhb-bu-br));border-image:var(--fhb-u-bi,none);box-shadow:var(--fhb-shadow),inset 0 1px 0 rgba(255,235,200,.16);}
.fhb-user .fhb-bubble:not(.fhb-sticker):not(.fhb-rp):not(.fhb-transfer)::before{content:'';position:absolute;right:7px;top:6px;width:11px;height:11px;border-top:1px solid var(--fhb-gold);border-right:1px solid var(--fhb-gold);border-radius:0 5px 0 0;opacity:.5;pointer-events:none;}
.fhb-user .fhb-bubble:not(.fhb-sticker):not(.fhb-rp):not(.fhb-transfer):hover{box-shadow:var(--fhb-shadow),0 0 0 1px var(--fhb-gold),inset 0 1px 0 rgba(255,235,200,.2);}
.fhb-deco{position:absolute;width:var(--fhb-deco-w,clamp(28px,8vw,40px));max-width:52%;line-height:0;pointer-events:none;z-index:6;}
.fhb-deco img{display:block;width:100%;height:auto;filter:drop-shadow(0 3px 6px rgba(0,0,0,.32));animation:fhbFloat 3.4s ease-in-out infinite;}
.fhb-deco-tl{left:0;top:0;transform:translate(calc(-1 * var(--fhb-deco-o,40%)),calc(-1 * var(--fhb-deco-o,40%)));}
.fhb-deco-tr{right:0;top:0;transform:translate(var(--fhb-deco-o,40%),calc(-1 * var(--fhb-deco-o,40%)));}
.fhb-deco-bl{left:0;bottom:0;transform:translate(calc(-1 * var(--fhb-deco-o,40%)),var(--fhb-deco-o,40%));}
.fhb-deco-br{right:0;bottom:0;transform:translate(var(--fhb-deco-o,40%),var(--fhb-deco-o,40%));}
.fhb-tstatus{display:flex;align-items:center;gap:4px;font-size:10px;letter-spacing:.1em;color:var(--fhb-meta);padding:0 4px;}
.fhb-tstatus svg{width:11px;height:11px;}
.fhb-tstatus.s-read{color:var(--fhb-gold);}
.fhb-tstatus.s-fail{color:var(--fhb-red);}
.fhb-voice{display:flex;align-items:center;gap:10px;cursor:pointer;min-width:170px;}
.fhb-play{width:28px;height:28px;border-radius:50%;background:var(--fhb-red);color:#fff;display:flex;align-items:center;justify-content:center;flex:none;transition:var(--fhb-trans);}
.fhb-play svg{width:11px;height:11px;margin-left:1px;}
.fhb-voice:hover .fhb-play{transform:scale(1.12);box-shadow:0 0 12px var(--fhb-red);}
.fhb-wave{width:66px;height:22px;color:currentColor;flex:none;}
.fhb-wave rect{transform-box:fill-box;transform-origin:center;animation:fhbWave 1s ease-in-out infinite;animation-play-state:paused;fill:currentColor;}
.fhb-voice.fhb-playing .fhb-wave rect{animation-play-state:running;}
.fhb-wave rect:nth-child(2){animation-delay:.15s;}
.fhb-wave rect:nth-child(3){animation-delay:.3s;}
.fhb-wave rect:nth-child(4){animation-delay:.1s;}
.fhb-wave rect:nth-child(5){animation-delay:.4s;}
.fhb-wave rect:nth-child(6){animation-delay:.25s;}
.fhb-dur{font-size:12px;color:var(--fhb-meta);font-variant-numeric:tabular-nums;}
.fhb-sub{font-size:12px;color:var(--fhb-meta);font-style:italic;padding:2px 6px 0;max-width:100%;}
.fhb-msg .fhb-bubble.fhb-transfer{background:var(--fhb-tr-bg);border-color:var(--fhb-tr-br);color:var(--fhb-tr-note);}
.fhb-tag{display:flex;align-items:center;gap:6px;font-size:9.5px;letter-spacing:.24em;color:var(--fhb-tr-tag);text-transform:uppercase;margin-bottom:6px;}
.fhb-tag-ic svg{width:14px;height:14px;display:block;color:var(--fhb-tr-tag);}
.fhb-amt{font-family:var(--fhb-serif);font-size:27px;font-weight:700;letter-spacing:.02em;line-height:1.1;color:var(--fhb-tr-tx);}
.fhb-note{font-size:12px;color:var(--fhb-tr-note);margin-top:5px;font-style:italic;}
.fhb-msg .fhb-bubble.fhb-rp{display:flex;align-items:center;gap:12px;min-width:190px;background:linear-gradient(135deg,#c8102e 0%,#8f0d22 100%);color:#ffe9d6;border:none;cursor:pointer;overflow:hidden;}
.fhb-rp::after{content:'';position:absolute;top:0;left:-120%;width:60%;height:100%;background:linear-gradient(105deg,transparent,rgba(255,232,190,.35),transparent);animation:fhbSheen 2.8s ease-in-out infinite;pointer-events:none;}
.fhb-rp[data-state="pending"]:hover{transform:translateY(-2px) scale(1.015);}
.fhb-rp[data-state="claimed"]{filter:saturate(.55) brightness(.94);}
.fhb-rp[data-state="claimed"]::after{animation:none;}
.fhb-rp-ic svg{width:30px;height:24px;display:block;color:#ffd98a;}
.fhb-rp-text{font-size:14px;font-weight:600;line-height:1.4;}
.fhb-rp-status{font-size:11px;letter-spacing:.12em;opacity:.82;margin-top:2px;}
.fhb-burst{position:absolute;left:50%;top:50%;width:80px;height:80px;margin:-40px 0 0 -40px;border-radius:50%;border:2px solid #ffd98a;pointer-events:none;animation:fhbBurst .6s ease-out forwards;}
.fhb-rp.fhb-deny{animation:fhbDeny .35s ease;}
.fhb-fig{margin:0;min-width:min(230px,70%);}
.fhb-imgwrap{position:relative;border-radius:12px;overflow:hidden;border:1px solid var(--fhb-bo-br);box-shadow:var(--fhb-shadow);min-height:110px;}
.fhb-img{display:block;width:100%;height:auto;max-width:100%;}
.fhb-imgfb{position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;background:var(--fhb-red-soft);color:var(--fhb-red);font-size:12px;letter-spacing:.14em;}
.fhb-imgfb-ic svg{width:26px;height:26px;}
.fhb-fig figcaption{font-size:12px;color:var(--fhb-meta);margin-top:6px;line-height:1.5;display:flex;flex-wrap:wrap;gap:6px;align-items:baseline;}
.fhb-kw{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--fhb-gold);}
.fhb-msg .fhb-bubble.fhb-sticker{background:transparent;border:none;box-shadow:none;padding:2px 6px;color:var(--fhb-ink);display:flex;flex-direction:column;gap:4px;align-items:flex-start;}
.fhb-user .fhb-bubble.fhb-sticker{align-items:flex-end;}
.fhb-sticker:hover{transform:translateY(-2px) rotate(-1.5deg);}
.fhb-stk-img{display:block;width:var(--fhb-stk-w,clamp(96px,28vw,138px));height:auto;max-width:100%;border-radius:14px;border:1px solid var(--fhb-hairline);background:var(--fhb-red-soft);box-shadow:0 8px 18px rgba(0,0,0,.26);transition:var(--fhb-trans);}
.fhb-sticker:hover .fhb-stk-img{box-shadow:0 12px 26px rgba(0,0,0,.34);border-color:var(--fhb-gold);}
.fhb-emo{font-size:clamp(38px,9vw,54px);line-height:1.15;display:inline-block;animation:fhbPop .5s cubic-bezier(.34,1.56,.64,1) both;filter:drop-shadow(0 6px 10px rgba(0,0,0,.2));}
.fhb-emo-txt{font-size:14px;letter-spacing:.08em;padding:7px 14px;border:1px dashed var(--fhb-gold);border-radius:999px;background:var(--fhb-red-soft);color:var(--fhb-ink);filter:none;font-family:var(--fhb-serif);}
.fhb-sticker-cap{font-size:12px;color:var(--fhb-meta);font-style:italic;}
.fhb-call{display:flex;align-items:center;gap:12px;min-width:180px;}
.fhb-callic{width:34px;height:34px;border-radius:10px;background:var(--fhb-red-soft);color:var(--fhb-red);display:flex;align-items:center;justify-content:center;flex:none;}
.fhb-callic svg{width:15px;height:15px;}
.fhb-missed .fhb-callic{background:var(--fhb-hairline);color:var(--fhb-meta);}
.fhb-call-title{font-size:14px;font-weight:600;}
.fhb-call-sub{font-size:11px;color:var(--fhb-meta);letter-spacing:.08em;margin-top:1px;}
.fhb-loc{display:flex;align-items:center;gap:12px;min-width:180px;}
.fhb-pin{width:30px;height:30px;color:var(--fhb-red);flex:none;}
.fhb-pulse{transform-box:fill-box;transform-origin:center;animation:fhbPulse 2s ease-out infinite;}
.fhb-loc-name{font-family:var(--fhb-serif);font-size:16px;font-weight:700;border-bottom:1px dashed var(--fhb-gold);display:inline-block;padding-bottom:1px;width:fit-content;}
.fhb-loc-area{font-size:11px;color:var(--fhb-meta);letter-spacing:.08em;margin-top:3px;}
.fhb-file{display:flex;align-items:center;gap:12px;min-width:190px;}
.fhb-fileic{width:36px;height:36px;border-radius:10px;background:var(--fhb-hairline);color:var(--fhb-ink);display:flex;align-items:center;justify-content:center;flex:none;}
.fhb-fileic svg{width:15px;height:15px;}
.fhb-file-name{font-size:13.5px;font-weight:600;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fhb-file-sub{font-size:11px;color:var(--fhb-meta);margin-top:1px;}
.fhb-sys{display:flex;align-items:center;justify-content:center;gap:12px;margin:16px 8px;opacity:0;animation:fhbIn .4s ease forwards;font-family:var(--fhb-sans);}
.fhb-sys::before,.fhb-sys::after{content:'';flex:1;max-width:120px;background:linear-gradient(90deg,transparent,var(--fhb-hairline),transparent);height:1px;}
.fhb-sys-cap{font-size:11px;letter-spacing:.08em;color:var(--fhb-meta);padding:3px 12px;border:1px solid var(--fhb-hairline);border-radius:999px;background:transparent;white-space:nowrap;}
.fhb-sys-time{font-size:10px;color:var(--fhb-meta);font-variant-numeric:tabular-nums;}
.fhb-typing{display:flex;align-items:center;padding:12px 16px;width:auto;}
.fhb-dots{width:38px;height:12px;color:currentColor;}
.fhb-dots circle{fill:currentColor;animation:fhbDot 1.2s ease-in-out infinite;}
.fhb-dots circle:nth-child(2){animation-delay:.18s;}
.fhb-dots circle:nth-child(3){animation-delay:.36s;}
.fhb-thread{margin:18px auto;border:1px solid var(--fhb-gold);border-top:2px solid var(--fhb-red);border-radius:16px;overflow:hidden;background:var(--fhb-card-bg);box-shadow:var(--fhb-card-shadow);opacity:0;animation:fhbIn .5s ease forwards;font-family:var(--fhb-sans);color:var(--fhb-ink);max-width:min(92%,520px);}
.fhb-th-head{display:flex;align-items:center;gap:10px;width:100%;text-align:left;appearance:none;background:var(--fhb-card-head);border:none;border-bottom:1px dashed var(--fhb-hairline);padding:11px 14px;cursor:pointer;color:var(--fhb-ink);font:inherit;transition:var(--fhb-trans);}
.fhb-th-head:hover{background:var(--fhb-card-head-h);}
.fhb-th-head:active{transform:scale(.995);}
.fhb-th-icon{width:26px;height:26px;border-radius:8px;background:var(--fhb-red);color:#fff;display:flex;align-items:center;justify-content:center;flex:none;box-shadow:0 0 10px var(--fhb-red-soft);}
.fhb-th-icon svg{width:12px;height:12px;}
.fhb-th-main{display:flex;flex-direction:column;min-width:0;flex:1;}
.fhb-th-title{font-family:var(--fhb-serif);font-size:13.5px;letter-spacing:.05em;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fhb-th-peek{font-size:11px;color:var(--fhb-meta);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;font-style:italic;}
.fhb-thread.open .fhb-th-peek{display:none;}
.fhb-th-count{flex:none;font-size:10px;letter-spacing:.14em;color:var(--fhb-gold);border:1px solid var(--fhb-gold);border-radius:999px;padding:2px 8px;font-variant-numeric:tabular-nums;}
.fhb-th-toggle{flex:none;font-size:11px;letter-spacing:.18em;color:var(--fhb-meta);display:flex;align-items:center;gap:5px;}
.fhb-th-caret{width:10px;height:6px;transition:transform .3s ease;}
.fhb-thread.open .fhb-th-caret{transform:rotate(180deg);}
.fhb-thread-body{display:grid;grid-template-rows:0fr;transition:grid-template-rows .45s cubic-bezier(.22,.61,.36,1);}
.fhb-thread.open .fhb-thread-body{grid-template-rows:1fr;}
.fhb-thread-inner{overflow:hidden;min-height:0;padding:4px 12px 8px;}
.fhb-thread-inner > .fhb-msg{margin:12px 2px;}
.fhb-thread-inner > .fhb-sys{margin:8px 4px;}
@keyframes fhbIn{from{opacity:0;transform:translateY(10px) scale(.98);}to{opacity:1;transform:translateY(0) scale(1);}}
@keyframes fhbWave{0%,100%{transform:scaleY(.35);}50%{transform:scaleY(1);}}
@keyframes fhbDot{0%,100%{transform:translateY(0);opacity:.5;}50%{transform:translateY(-3px);opacity:1;}}
@keyframes fhbSheen{0%{left:-120%;}55%{left:130%;}100%{left:130%;}}
@keyframes fhbPop{from{transform:scale(.4);opacity:0;}to{transform:scale(1);opacity:1;}}
@keyframes fhbPulse{0%{transform:scale(.55);opacity:.9;}100%{transform:scale(1.7);opacity:0;}}
@keyframes fhbBurst{0%{transform:scale(.3);opacity:1;}100%{transform:scale(1.5);opacity:0;}}
@keyframes fhbDeny{0%,100%{transform:translateX(0);}25%{transform:translateX(-4px);}50%{transform:translateX(4px);}75%{transform:translateX(-2px);}}
@keyframes fhbSpin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
@keyframes fhbSpinBack{from{transform:rotate(0deg);}to{transform:rotate(-360deg);}}
@keyframes fhbMarkBeat{0%,100%{opacity:.7;transform:scale(1);}50%{opacity:1;transform:scale(1.15);}}
@keyframes fhbFloat{0%,100%{transform:translateY(0) rotate(-2deg);}50%{transform:translateY(-4px) rotate(2deg);}}`;
  }

  function injectStyle() {
    const old = PD.getElementById(FHB_STYLE_ID);
    if (old) old.remove();
    const dark = detectDark();
    // 【芙林专属】红金调色与玫瑰/火漆水印 data URI
    const p = dark
      ? {
          ink: '#ece4d4',
          boBg: '#1f1c18',
          boTx: '#f0e9d9',
          boBr: 'rgba(236,228,213,.16)',
          buBg: 'linear-gradient(135deg,#241d17,#14100c)',
          buTx: '#f6efe2',
          buTail: '#1c1611',
          buBr: 'rgba(216,163,61,.36)',
          red: '#ff3b4e',
          redSoft: 'rgba(255,59,78,.16)',
          gold: '#d8a33d',
          meta: 'rgba(236,228,213,.55)',
          hairline: 'rgba(236,228,213,.18)',
          shadow: '0 8px 22px rgba(0,0,0,.45)',
          trBg: 'linear-gradient(135deg,#2c2314,#1d170c)',
          trBr: 'rgba(216,163,61,.45)',
          trTx: '#f0c96a',
          trNote: 'rgba(240,201,106,.82)',
          trTag: '#d8a33d',
          cardBg: 'linear-gradient(160deg,#1a1510,#0f0c09)',
          cardHead: 'rgba(255,59,78,.06)',
          cardHeadH: 'rgba(255,59,78,.14)',
          cardShadow: '0 14px 34px rgba(0,0,0,.5)',
          charBg: 'linear-gradient(135deg,#2e161b 0%,#1e1315 55%,#271518 100%)',
          charBr: 'rgba(216,163,61,.46)',
          charShadow: '0 10px 26px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,222,180,.14)',
          charGlow: 'rgba(255,59,78,.4)',
          charWm: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cg fill='none' stroke='rgba(255,96,112,0.26)' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M32 24c-5.6 0-9.6 3.8-9.6 8.6s4 8.6 9.6 8.6 10.6-3.8 10.6-9.6-4.8-10.6-11.6-10.6-12.6 4.8-12.6 11.6 5.8 13.6 13.6 13.6'/%3E%3Cpath d='M30 42c0 7.6 1.8 12.4 5.6 17.4'/%3E%3Cpath d='M31 50c-5.6-1-9.4-3.8-10.4-8.6 5.6-1 9.4 1.8 10.4 8.6z'/%3E%3Cpath d='M35 55c5.6-1 9.4-3.8 10.4-8.6-5.6-1-9.4 1.8-10.4 8.6z'/%3E%3C/g%3E%3C/svg%3E")`,
          seal: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cg fill='none' stroke='rgba(216,163,61,0.30)' stroke-width='1.4'%3E%3Cpath d='M24 5l13 19-13 19-13-19z'/%3E%3Cpath d='M24 14l6.5 10-6.5 10-6.5-10z'/%3E%3C/g%3E%3C/svg%3E")`,
          rose: '#ff4d63',
          roseDeep: '#7d0d1c',
          leaf: '#5f8452',
        }
      : {
          ink: '#1a1512',
          boBg: '#fffdf6',
          boTx: '#241d16',
          boBr: 'rgba(26,21,18,.16)',
          buBg: 'linear-gradient(135deg,#1c1713,#2b211b)',
          buTx: '#f6efe2',
          buTail: '#241d16',
          buBr: 'rgba(160,124,34,.34)',
          red: '#c8102e',
          redSoft: 'rgba(200,16,46,.1)',
          gold: '#a07c22',
          meta: 'rgba(26,21,18,.55)',
          hairline: 'rgba(26,21,18,.18)',
          shadow: '0 6px 16px rgba(20,12,4,.12)',
          trBg: 'linear-gradient(135deg,#fdf3dd,#f5e5b6)',
          trBr: 'rgba(160,124,34,.55)',
          trTx: '#5a4310',
          trNote: '#7a6430',
          trTag: '#a07c22',
          cardBg: 'linear-gradient(160deg,#fffdf6,#f4ecda)',
          cardHead: 'rgba(200,16,46,.05)',
          cardHeadH: 'rgba(200,16,46,.11)',
          cardShadow: '0 10px 26px rgba(20,12,4,.16)',
          charBg: 'linear-gradient(135deg,#fff5f1 0%,#fdeae4 55%,#fff9f4 100%)',
          charBr: 'rgba(160,124,34,.5)',
          charShadow: '0 8px 20px rgba(120,20,30,.14),inset 0 1px 0 rgba(255,255,255,.85)',
          charGlow: 'rgba(200,16,46,.3)',
          charWm: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cg fill='none' stroke='rgba(200,16,46,0.18)' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M32 24c-5.6 0-9.6 3.8-9.6 8.6s4 8.6 9.6 8.6 10.6-3.8 10.6-9.6-4.8-10.6-11.6-10.6-12.6 4.8-12.6 11.6 5.8 13.6 13.6 13.6'/%3E%3Cpath d='M30 42c0 7.6 1.8 12.4 5.6 17.4'/%3E%3Cpath d='M31 50c-5.6-1-9.4-3.8-10.4-8.6 5.6-1 9.4 1.8 10.4 8.6z'/%3E%3Cpath d='M35 55c5.6-1 9.4-3.8 10.4-8.6-5.6-1-9.4 1.8-10.4 8.6z'/%3E%3C/g%3E%3C/svg%3E")`,
          seal: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cg fill='none' stroke='rgba(216,163,61,0.34)' stroke-width='1.4'%3E%3Cpath d='M24 5l13 19-13 19-13-19z'/%3E%3Cpath d='M24 14l6.5 10-6.5 10-6.5-10z'/%3E%3C/g%3E%3C/svg%3E")`,
          rose: '#d81f3c',
          roseDeep: '#7d0d1c',
          leaf: '#4f7343',
        };

    // 配置覆盖：accent → 丝绒红，accent2 → 鎏金
    const ac = dark ? CONFIG.ACCENT_DARK : CONFIG.ACCENT_LIGHT;
    const ac2 = dark ? CONFIG.ACCENT2_DARK : CONFIG.ACCENT2_LIGHT;
    if (ac && String(ac).trim()) {
      p.red = String(ac).trim();
      p.redSoft = softColor(p.red, dark ? 0.16 : 0.1);
      p.charGlow = softColor(p.red, dark ? 0.4 : 0.3);
      p.cardHead = softColor(p.red, dark ? 0.06 : 0.05);
      p.cardHeadH = softColor(p.red, dark ? 0.14 : 0.11);
    }
    if (ac2 && String(ac2).trim()) {
      p.gold = String(ac2).trim();
      p.buBr = softColor(p.gold, dark ? 0.36 : 0.34);
      p.charBr = softColor(p.gold, dark ? 0.46 : 0.5);
      p.trBr = softColor(p.gold, dark ? 0.45 : 0.55);
      p.trTag = p.gold;
    }
    if (CONFIG.STICKER_SIZE && String(CONFIG.STICKER_SIZE).trim()) {
      const sw = String(CONFIG.STICKER_SIZE).trim();
      p.stkW = /^\d+(\.\d+)?$/.test(sw) ? sw + 'px' : sw;
    }

    const style = PD.createElement('style');
    style.id = FHB_STYLE_ID;
    style.textContent = buildCSS(p);
    PD.head.appendChild(style);
  }

  // ---------- 启动 ----------
  resolveContext();
  injectStyle();
  processAll();

  (async () => {
    await bootstrapWorldInfo(false);
    refreshVisuals();
  })();

  setTimeout(() => {
    resolveContext();
    injectStyle();
    processAll();
    refreshAllAvatars();
    restickerAll();
    applyDecos();
  }, 500);
  setTimeout(() => {
    resolveContext();
    processAll();
    refreshAllAvatars();
    restickerAll();
    applyDecos();
  }, 1600);

  // ---------- 事件绑定 ----------
  const editRenderTimers = new Map();

  function scheduleRenderAfterEditing(id, delay) {
    const messageId = Number(id);
    if (!Number.isInteger(messageId) || messageId < 0) return;

    const previous = editRenderTimers.get(messageId);
    if (previous) clearTimeout(previous);
    const startedAt = Date.now();

    const renderWhenReady = () => {
      editRenderTimers.delete(messageId);
      const textEl = PD.querySelector(`#chat .mes[mesid="${messageId}"] .mes_text`);
      if (!textEl) return;

      // 酒馆会先发出编辑事件、稍后才移除 textarea；短暂等待编辑态真正结束，避免丢掉本次重渲染。
      if (anyEditing() || isEditing(textEl)) {
        if (Date.now() - startedAt < 5000) {
          editRenderTimers.set(messageId, setTimeout(renderWhenReady, 100));
        }
        return;
      }

      resolveContext();
      transformElement(textEl, { force: true });
      restickerAll();
      applyDecos();
    };

    editRenderTimers.set(messageId, setTimeout(renderWhenReady, delay == null ? 80 : delay));
  }

  if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
    if (tavern_events.GENERATION_STARTED) {
      eventOn(tavern_events.GENERATION_STARTED, () => {
        GEN.active = true;
        // 轮询兜底：无论当前 ST 版本是否暴露逐 token 事件，live 都能逐字变成气泡
        if (streamMode() === 'live' && !GEN.poller) {
          GEN.poller = setInterval(() => {
            if (!GEN.active) return;
            if (streamMode() !== 'live') return;
            liveTick();
          }, 350);
        }
      });
    }
    const endGen = () => {
      GEN.active = false;
      if (GEN.timer) {
        clearTimeout(GEN.timer);
        GEN.timer = null;
      }
      if (GEN.poller) {
        clearInterval(GEN.poller);
        GEN.poller = null;
      }
      setTimeout(() => {
        resolveContext();
        processAll({ force: true });
        restickerAll();
        applyDecos();
      }, 60);
    };
    if (tavern_events.GENERATION_ENDED) eventOn(tavern_events.GENERATION_ENDED, endGen);
    if (tavern_events.GENERATION_STOPPED) eventOn(tavern_events.GENERATION_STOPPED, endGen);

    // live 模式三通道驱动（任一生效即可，互为冗余）
    const onStreamToken = () => {
      if (streamMode() !== 'live' || !GEN.active) return;
      if (GEN.timer) return;
      GEN.timer = setTimeout(() => {
        GEN.timer = null;
        if (!GEN.active || anyEditing()) return;
        liveTick();
      }, 180);
    };
    if (tavern_events.STREAM_TOKEN_RECEIVED) {
      eventOn(tavern_events.STREAM_TOKEN_RECEIVED, onStreamToken);
    }
    // 当前版本中两个名字指向同一事件字符串，注册前去重，避免重复回调
    if (
      tavern_events.SMOOTH_STREAM_TOKEN_RECEIVED &&
      tavern_events.SMOOTH_STREAM_TOKEN_RECEIVED !== tavern_events.STREAM_TOKEN_RECEIVED
    ) {
      eventOn(tavern_events.SMOOTH_STREAM_TOKEN_RECEIVED, onStreamToken);
    }

    if (tavern_events.MESSAGE_RECEIVED) {
      eventOn(tavern_events.MESSAGE_RECEIVED, id => {
        GEN.active = false;
        setTimeout(() => {
          resolveContext();
          processById(id, { force: true });
          restickerAll();
        }, 80);
        setTimeout(() => {
          processById(id, { force: true });
          restickerAll();
          applyDecos();
        }, 500);
        setTimeout(() => {
          processById(id, { force: true });
          restickerAll();
        }, 1500);
      });
    }
    if (tavern_events.MESSAGE_UPDATED) {
      eventOn(tavern_events.MESSAGE_UPDATED, id => scheduleRenderAfterEditing(id, 120));
    }
    if (tavern_events.MESSAGE_EDITED) {
      eventOn(tavern_events.MESSAGE_EDITED, id => scheduleRenderAfterEditing(id, 0));
    }
    if (tavern_events.MESSAGE_SWIPED) {
      eventOn(tavern_events.MESSAGE_SWIPED, id =>
        setTimeout(() => {
          resolveContext();
          processById(id);
          restickerAll();
        }, 80),
      );
    }
    if (tavern_events.CHAT_CHANGED) {
      let chatTimer = null;
      eventOn(tavern_events.CHAT_CHANGED, () => {
        clearTimeout(chatTimer);
        chatTimer = setTimeout(async () => {
          GEN.active = false;
          if (GEN.poller) {
            clearInterval(GEN.poller);
            GEN.poller = null;
          }
          if (GEN.timer) {
            clearTimeout(GEN.timer);
            GEN.timer = null;
          }
          Object.keys(SPEC).forEach(k => {
            SPEC[k].uid = null;
          });
          resolveContext();
          // 先完成注入/配置读取，再渲染
          await bootstrapWorldInfo(false);
          injectStyle();
          processAll();
          refreshVisuals();
        }, 400);
      });
    }

    // 世界书更新跟随：用户在书里改了配置/链接库后自动重读；自写回波用 quiet 窗口拦截
    if (tavern_events.WORLDINFO_UPDATED) {
      let wiTimer = null;
      eventOn(tavern_events.WORLDINFO_UPDATED, name => {
        const bookName = String(name || '').trim();
        if (!bookName) return;
        if (STK.busy) return;
        if (Date.now() - (STK.lastWrite || 0) < (STK.quiet || 3000)) return;
        clearTimeout(wiTimer);
        wiTimer = setTimeout(async () => {
          if (STK.busy) return;
          const expected = STK.book || (await resolveBookName());
          if (!expected || bookName !== expected) return;
          await bootstrapWorldInfo(false);
          refreshVisuals();
        }, 1200);
      });
    }
  }

  // MutationObserver 兜底
  try {
    const chatRoot = PD.getElementById('chat');
    if (chatRoot) {
      let timer = null;
      const ob = new PW.MutationObserver(mutations => {
        if (anyEditing()) return;
        if (isGenerating()) return;
        let need = false;
        for (const m of mutations) {
          if (m.type !== 'childList') continue;
          if (m.target && m.target.closest && m.target.closest('textarea, .mes_edit_buttons')) continue;
          for (const n of m.addedNodes) {
            if (n.nodeType !== 1) {
              need = true;
              break;
            }
            if (n.tagName === 'TEXTAREA' || n.id === 'curEditTextarea') continue;
            if (n.tagName === 'IMG' && n.classList && n.classList.contains('fhb-stk-img')) continue;
            if (
              n.classList &&
              (n.classList.contains('TH-user-name-replace') || n.classList.contains('TH-user-name-replace-flow'))
            )
              continue;
            if (
              n.classList &&
              (n.classList.contains('fhb-msg') ||
                n.classList.contains('fhb-sys') ||
                n.classList.contains('fhb-thmsg') ||
                n.classList.contains('fhb-thread') ||
                n.classList.contains('fhb-avwrap') ||
                n.classList.contains('fhb-avatar') ||
                n.classList.contains('fhb-deco'))
            )
              continue;
            need = true;
            break;
          }
          if (need) break;
        }
        if (!need) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (anyEditing() || isGenerating()) return;
          resolveContext();
          processAll();
          restickerAll();
          applyDecos();
        }, 160);
      });
      try {
        if (PW.__FHB_OB_FLYNN && typeof PW.__FHB_OB_FLYNN.disconnect === 'function') PW.__FHB_OB_FLYNN.disconnect();
      } catch (e2) {}
      ob.observe(chatRoot, { childList: true, subtree: true });
      PW.__FHB_OB_FLYNN = ob;
      $(window).on('pagehide', () => {
        try {
          ob.disconnect();
          if (PW.__FHB_OB_FLYNN === ob) PW.__FHB_OB_FLYNN = null;
        } catch (e3) {}
        editRenderTimers.forEach(timerId => clearTimeout(timerId));
        editRenderTimers.clear();
        if (GEN.poller) {
          clearInterval(GEN.poller);
          GEN.poller = null;
        }
        if (GEN.timer) {
          clearTimeout(GEN.timer);
          GEN.timer = null;
        }
      });
    }
  } catch (e) {
    console.warn('[聊天气泡] MutationObserver 挂载失败：', e);
  }

  // ---------- 脚本按钮 ----------
  if (typeof appendInexistentScriptButtons === 'function') {
    appendInexistentScriptButtons([
      { name: '重刷聊天气泡', visible: true },
      { name: '注入/更新世界书', visible: true },
      { name: '重置外观配置', visible: true },
    ]);
  }

  let resetArmedAt = 0;

  if (typeof eventOn === 'function' && typeof getButtonEvent === 'function') {
    eventOn(getButtonEvent('重刷聊天气泡'), () => {
      if (anyEditing()) {
        toastMsg('请先关闭消息编辑，再重刷气泡。', 'warning');
        return;
      }
      resolveContext();
      injectStyle();
      processAll({ force: true });
      refreshAllAvatars();
      restickerAll();
      applyDecos();
      toastMsg('聊天气泡已重新渲染。', 'success');
    });

    eventOn(getButtonEvent('注入/更新世界书'), async () => {
      await bootstrapWorldInfo(true);
      processAll({ force: true });
      refreshVisuals();
    });

    eventOn(getButtonEvent('重置外观配置'), async () => {
      const now = Date.now();
      if (now - resetArmedAt > 10000) {
        resetArmedAt = now;
        toastMsg('这会用最新模板覆盖外观配置条目，你填过的头像与颜色都会丢失。十秒内再点一次确认。', 'warning');
        return;
      }
      resetArmedAt = 0;
      const book = STK.book || (await resolveBookName());
      if (!book) {
        toastMsg('未检测到芙林绑定的世界书，请先在世界书面板完成绑定。', 'warning');
        return;
      }
      const res = await upsertEntry(book, SPEC.conf, CONFIG_LIB_DEFAULT, true);
      if (res === 'failed') {
        toastMsg('重置失败，请检查世界书权限。', 'error');
        return;
      }
      STK.lastWrite = Date.now();
      toastMsg(`外观配置已重置为模板 ${CONF_VERSION}。`, 'success');
      await bootstrapWorldInfo(true);
      processAll({ force: true });
      refreshVisuals();
    });
  }
}

// 等待宿主页面就绪后再启动，并向用户暴露初始化异常（errorCatched 不存在时降级为控制台输出）
$(() => {
  if (typeof errorCatched === 'function') {
    errorCatched(initFlynnChatBubbles)();
  } else {
    try {
      initFlynnChatBubbles();
    } catch (e) {
      console.error('[聊天气泡] 初始化失败：', e);
    }
  }
});

// ---------- 卸载：只移除样式，不触碰世界书条目 ----------
$(window).on('pagehide', () => {
  try {
    const doc = window.parent && window.parent.document ? window.parent.document : document;
    const s = doc.getElementById(FHB_STYLE_ID);
    if (s) s.remove();
  } catch (e) {}
});
