type BubbleUpdate = (root: HTMLElement) => { html: string; apply: (html: string) => boolean };
type BubbleFixture = { variants: { name: string; current: string; baseline: string }[]; standalone: string };

async function runBubbleDomRegression(fixture: BubbleFixture, createBubbleDomUpdate: BubbleUpdate) {
  const passed: string[] = [];
  const check = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  const entry = (text = '测试内容') => `[text|甲|乙|19:45|${text}|已读]`;
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function mount(html: string) {
    const holder = document.createElement('div');
    holder.className = 'mes';
    holder.setAttribute('mesid', '4');
    holder.innerHTML = `<div class="mes_text">${html}</div>`;
    document.body.appendChild(holder);
    return { holder, root: holder.firstElementChild as HTMLElement };
  }

  function runtime(code: string, root: HTMLElement) {
    const control = { generating: false, editing: false, events: [] as unknown[][] };
    const dependencies = {
      createBubbleDomUpdate,
      CONFIG: {
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
        collapseMin: 2,
      },
      ICON: { phone: '☎' },
      PD: document,
      FHB_MESSAGE_RENDERED_EVENT: 'fhb_message_rendered',
      isEditing: () => control.editing,
      isGenerating: () => control.generating,
      streamMode: () => 'defer',
      lastMesText: () => root,
      lowerName: (s: string) => s.toLowerCase(),
      cleanName: (s: string) => s,
      unescapeText: (s: string) => s,
      detectGroups: () => new Set(),
      // 气泡外观不在此次改动内；保留真实解析、提交、分组、事件和流式守卫代码。
      buildEntry: (type: string, rest: string) => {
        const [sender, recipient, ...content] = rest.split('|');
        return `<div class="fhb-msg fhb-thmsg" data-disp="${sender}" data-rdisp="${recipient}"><div class="fhb-bubble" data-type="${type}">${escape(content.join('|'))}</div></div>`;
      },
      eventEmit: (...args: unknown[]) => {
        control.events.push(args);
      },
    };
    const transform = new Function(...Object.keys(dependencies), `${code}\nreturn transformElement;`)(
      ...Object.values(dependencies),
    );
    return { control, transform: (force = true) => transform(root, { force }) };
  }

  for (const variant of fixture.variants) {
    async function test(name: string, body: () => void | Promise<void>) {
      await body();
      passed.push(`${variant.name}: ${name}`);
    }

    await test('首次转换保留排队条、Shadow DOM、点击事件及连接状态', () => {
      const { holder, root } = mount(`<p>${entry()}</p><div data-bbi-slot></div>`);
      try {
        const slot = root.querySelector('[data-bbi-slot]')!;
        const shadow = slot.attachShadow({ mode: 'open' });
        shadow.innerHTML = '<button>排队中…</button>';
        let clicks = 0;
        const bar = shadow.querySelector('button')!;
        bar.addEventListener('click', () => clicks++);
        const observer = new MutationObserver(() => {});
        observer.observe(root, { subtree: true, childList: true });
        const run = runtime(variant.current, root);
        run.transform();
        check(root.querySelector('[data-bbi-slot]') === slot && slot.shadowRoot === shadow, '生图组件被重建');
        check(slot.isConnected && shadow.textContent === '排队中…', '加载条丢失');
        check(!observer.takeRecords().some(m => [...m.removedNodes].some(n => n.contains(slot))), '原组件曾被移出正文');
        observer.disconnect();
        bar.click();
        check(clicks === 1, '原点击事件丢失');
        shadow.querySelector('button')!.textContent = '生成中…';
        check(root.querySelector('[data-bbi-slot]')!.shadowRoot!.textContent === '生成中…', '生成状态无法继续更新');
        check(run.control.events.length === 1 && run.control.events[0][1] === 4, '渲染事件或楼层号错误');
      } finally {
        holder.remove();
      }
    });

    await test('尚未挂载的占位保留引用，稍后可直接挂载', async () => {
      const { holder, root } = mount(`<div data-bbi-slot></div><p>${entry()}</p>`);
      try {
        const slot = root.querySelector('[data-bbi-slot]')!;
        runtime(variant.current, root).transform();
        await Promise.resolve();
        slot.attachShadow({ mode: 'open' }).innerHTML = '<span>排队中…</span>';
        check(slot.isConnected && root.querySelector('[data-bbi-slot]') === slot, '挂载前的占位引用失效');
        check(slot.shadowRoot!.textContent === '排队中…', '异步挂载失败');
      } finally {
        holder.remove();
      }
    });

    await test('多个占位和 closed Shadow DOM 按原顺序保留', () => {
      const { holder, root } = mount(`<div data-bbi-slot></div><p>${entry()}</p><div data-bbi-slot></div>`);
      try {
        const slots = [...root.querySelectorAll('[data-bbi-slot]')];
        const shadow = slots[0].attachShadow({ mode: 'closed' });
        shadow.innerHTML = '<span>排队中…</span>';
        runtime(variant.current, root).transform();
        check(
          [...root.querySelectorAll('[data-bbi-slot]')].every((n, i) => n === slots[i]),
          '占位顺序或引用变化',
        );
        check(shadow.textContent === '排队中…', 'closed Shadow DOM 丢失');
      } finally {
        holder.remove();
      }
    });

    await test('嵌套宿主和宿主内的来源文本不参与气泡解析', () => {
      const { holder, root } = mount(
        `<section class="status"><div data-bbi-slot><span>${entry('组件内部')}</span></div><p>${entry('组件外部')}</p></section>`,
      );
      try {
        const parent = root.firstElementChild;
        const slot = root.querySelector('[data-bbi-slot]')!;
        const shadow = slot.attachShadow({ mode: 'open' });
        shadow.innerHTML = `<span>${entry('影子内容')}</span>`;
        runtime(variant.current, root).transform();
        check(root.firstElementChild === parent && root.querySelector('[data-bbi-slot]') === slot, '嵌套宿主被替换');
        check(slot.textContent!.includes('组件内部') && !slot.querySelector('.fhb-msg'), '组件内部内容被重新解析');
        check(
          shadow.textContent!.includes('影子内容') && root.querySelectorAll('.fhb-msg').length === 1,
          '组件边界被穿透',
        );
      } finally {
        holder.remove();
      }
    });

    await test('不带柏宝绘属性的 Shadow DOM 同样保留', () => {
      const { holder, root } = mount(`<aside></aside><p>${entry()}</p>`);
      try {
        const host = root.querySelector('aside')!;
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = '<span>第三方状态栏</span>';
        runtime(variant.current, root).transform();
        check(root.querySelector('aside') === host && host.shadowRoot === shadow, '通用 Shadow DOM 保护失败');
      } finally {
        holder.remove();
      }
    });

    await test('代码容器拆除后仍保留内部组件引用', () => {
      const { holder, root } = mount(`<pre><code>${entry()}<span data-bbi-slot></span></code></pre>`);
      try {
        const slot = root.querySelector('[data-bbi-slot]')!;
        const shadow = slot.attachShadow({ mode: 'open' });
        shadow.innerHTML = '<span>排队中…</span>';
        runtime(variant.current, root).transform();
        check(root.querySelector('[data-bbi-slot]') === slot && slot.shadowRoot === shadow, '容器拆除时组件丢失');
        check(root.querySelectorAll('.fhb-msg').length === 1, '拆除代码容器后未转换气泡');
      } finally {
        holder.remove();
      }
    });

    await test('无 moveBefore 时普通占位仍保持连接', () => {
      const { holder, root } = mount(`<p>${entry()}</p><div data-bbi-slot></div><p>${entry('末尾')}</p>`);
      try {
        Object.defineProperty(root, 'moveBefore', { value: undefined });
        const slot = root.querySelector('[data-bbi-slot]')!;
        const shadow = slot.attachShadow({ mode: 'open' });
        shadow.innerHTML = '<span>排队中…</span>';
        const observer = new MutationObserver(() => {});
        observer.observe(root, { childList: true, subtree: true });
        runtime(variant.current, root).transform();
        check(root.querySelector('[data-bbi-slot]') === slot && slot.isConnected, '兼容回退丢失占位');
        check(
          !observer.takeRecords().some(m => [...m.removedNodes].some(n => n.contains(slot))),
          '普通占位被临时断开连接',
        );
        observer.disconnect();
      } finally {
        holder.remove();
      }
    });

    await test('已有折叠卡片追加条目后保留展开状态与按钮', () => {
      const { holder, root } = mount(`<p>${entry('第一条')}</p><p>${entry('第二条')}</p><div data-bbi-slot></div>`);
      try {
        const run = runtime(variant.current, root);
        run.transform();
        const thread = root.querySelector('.fhb-thread')!;
        const head = thread.querySelector('button')!;
        head.click();
        check(thread.classList.contains('open'), '卡片未展开');
        root.insertAdjacentHTML('beforeend', `<p>${entry('第三条')}</p>`);
        run.transform();
        check(root.querySelector('.fhb-thread') === thread && thread.classList.contains('open'), '已有卡片状态被重置');
        head.click();
        check(!thread.classList.contains('open'), '原折叠按钮事件失效');
      } finally {
        holder.remove();
      }
    });

    await test('嵌套 iframe 保留同一浏览上下文', async () => {
      const { holder, root } = mount(`<section><p>${entry()}</p><iframe></iframe></section>`);
      try {
        const frame = root.querySelector('iframe')!;
        frame.srcdoc = '<p>运行中的前端</p>';
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('iframe 加载超时')), 5000);
          frame.addEventListener(
            'load',
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
        const originalDocument = frame.contentDocument;
        const marker = frame.contentDocument!.createElement('span');
        marker.textContent = '运行时状态';
        frame.contentDocument!.body.appendChild(marker);
        runtime(variant.current, root).transform();
        await new Promise(resolve => setTimeout(resolve, 30));
        check(
          root.querySelector('iframe') === frame && frame.contentDocument === originalDocument,
          'iframe 浏览上下文被重建',
        );
        check(marker.isConnected, 'iframe 内运行时状态丢失');
      } finally {
        holder.remove();
      }
    });

    await test('流式 defer、编辑态和重复转换守卫保持原行为', () => {
      const { holder, root } = mount(`<p>${entry()}</p><div data-bbi-slot></div>`);
      try {
        const before = root.innerHTML;
        const run = runtime(variant.current, root);
        run.control.generating = true;
        run.transform(false);
        check(root.innerHTML === before, 'defer 生成过程中发生转换');
        run.control.editing = true;
        run.transform();
        check(root.innerHTML === before, '编辑态发生转换');
        run.control.editing = false;
        run.control.generating = false;
        run.transform();
        const converted = root.innerHTML;
        run.transform();
        check(root.innerHTML === converted, '重复转换改变了显示结果');
      } finally {
        holder.remove();
      }
    });

    await test('普通条目、转义、用户名还原与旧版输出一致', () => {
      for (const html of [
        `<p>叙述 &amp; &lt;内容&gt;</p><p>${entry('hello &amp; goodbye')}</p><p>后文</p>`,
        `<pre><code>${entry('代码块包裹')}</code></pre>`,
        `<p>${entry('<span data-th-user-name-original="甲">替换名</span>')}</p>`,
        '[typing|甲|乙]',
        '<p>没有聊天条目的普通正文 [Time|19:45]</p>',
        ...['voice', 'transfer', 'redpacket', 'image', 'sticker', 'call', 'location', 'file', 'system'].map(
          type => `[${type}|甲|乙|19:45|内容]`,
        ),
      ]) {
        const old = mount(html),
          current = mount(html);
        try {
          runtime(variant.baseline, old.root).transform();
          runtime(variant.current, current.root).transform();
          check(old.root.innerHTML === current.root.innerHTML, `旧格式输出变化: ${html}`);
        } finally {
          old.holder.remove();
          current.holder.remove();
        }
      }
    });
  }

  const { holder, root } = mount('<div data-bbi-slot></div><p>原正文</p>');
  try {
    const slot = root.querySelector('[data-bbi-slot]')!;
    slot.attachShadow({ mode: 'open' }).innerHTML = '<span>排队中…</span>';
    const update = createBubbleDomUpdate(root);
    const original = root.innerHTML;
    check(!update.apply('<p>缺少组件的错误解析结果</p>'), '缺失组件时仍提交结果');
    check(root.innerHTML === original && root.querySelector('[data-bbi-slot]') === slot, '拒绝提交时修改了现场');
    passed.push('组件占位丢失时拒绝提交并保留现场');
  } finally {
    holder.remove();
  }

  // 在隔离页面中运行整份脚本；直接粘贴和脚本内 true/false 两种模式均不依赖模块加载。
  for (const protection of [true, false]) {
    const chat = document.createElement('div');
    chat.id = 'chat';
    chat.innerHTML =
      '<div class="mes" mesid="4" is_user="false"><div class="mes_text">[text|芙林|用户|19:45|直接粘贴测试|已读]<div data-bbi-slot></div></div></div>';
    document.body.appendChild(chat);
    const slot = chat.querySelector('[data-bbi-slot]')!;
    const shadow = slot.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<button>排队中…</button>';
    const frame = document.createElement('iframe');
    const previousSillyTavern = (window as any).SillyTavern;
    const cleanup: (() => void)[] = [];
    const errors: string[] = [];
    const theme = document.createElement('style');
    theme.textContent = '#chat .mes .mes_text * { padding: 0 !important; border-radius: 0 !important; }';
    document.head.appendChild(theme);
    try {
      await new Promise<void>(resolve => {
        frame.addEventListener('load', () => resolve(), { once: true });
        document.body.appendChild(frame);
      });
      const child = frame.contentWindow as any;
      const ready: (() => void)[] = [];
      (window as any).SillyTavern = {
        getContext: () => ({
          name1: '用户',
          name2: '芙林',
          characterId: 0,
          characters: [{ name: '芙林', avatar: '' }],
          chat: [],
          getCurrentChatId: () => 'standalone-fixture',
        }),
      };
      child.$ = (argument: unknown) => {
        if (typeof argument === 'function') ready.push(argument as () => void);
        return {
          on: (_event: string, callback: () => void) => {
            cleanup.push(callback);
          },
        };
      };
      child.console = Object.create(console);
      child.console.error = (...args: unknown[]) => errors.push(args.map(String).join(' '));
      child.setTimeout = () => 0;
      child.setInterval = () => 0;
      child.clearTimeout = () => {};
      child.clearInterval = () => {};
      child.getCharWorldbookNames = async () => ({ primary: null, additional: [] });
      child.appendInexistentScriptButtons = () => {};
      child.eventOn = () => {};
      child.eventEmit = () => {};
      child.getButtonEvent = (name: string) => name;
      // 只在隔离测试中暴露配置函数，验证旧世界书字段不再改变保护状态。
      const source = fixture.standalone
        .replace('const FHB_PROTECT_APPEARANCE = true;', 'const FHB_PROTECT_APPEARANCE = ' + protection + ';')
        .replace(
          '  // ---------- 启动 ----------',
          '  window.__flynnPasteTest = { parseKV, applyConfigKV, injectStyle };\n  // ---------- 启动 ----------',
        );
      child.eval(source);
      ready.forEach(callback => callback());
      await new Promise(resolve => setTimeout(resolve, 20));
      check(errors.length === 0, '整份脚本启动失败: ' + errors.join('; '));
      check(chat.querySelector('.fhb-bubble'), '直接粘贴后未转换实际气泡');
      check(chat.querySelector('[data-bbi-slot]') === slot && slot.shadowRoot === shadow, '独立脚本丢失加载组件');
      passed.push('芙林专属版整份脚本直接粘贴启动，脚本内保护=' + protection);

      const bubble = chat.querySelector('.fhb-bubble') as HTMLElement;
      // 排除 CSS transition 的中间帧，仅测量级联后的目标样式。
      bubble.style.setProperty('transition', 'none', 'important');
      const protectedPadding = getComputedStyle(bubble).paddingLeft;
      check(
        protection ? parseFloat(protectedPadding) > 0 : protectedPadding === '0px',
        '脚本内保护常量未生效: ' + protection + ', padding=' + protectedPadding,
      );
      if (protection) check(getComputedStyle(bubble).borderTopLeftRadius !== '0px', '默认保护未保留气泡圆角');
      passed.push('芙林专属版主题保护样式符合脚本内常量=' + protection);

      const controls = child.__flynnPasteTest;
      check(controls, '缺少隔离测试入口');
      controls.applyConfigKV(controls.parseKV('protect_appearance = ' + !protection));
      controls.injectStyle();
      check(getComputedStyle(bubble).paddingLeft === protectedPadding, '旧外观配置字段覆盖了脚本内保护常量');
      check(slot.shadowRoot === shadow && shadow.textContent === '排队中…', '主题保护破坏了生图加载组件');
      passed.push('芙林专属版外观配置不覆盖脚本内保护=' + protection);
    } finally {
      cleanup.forEach(callback => callback());
      frame.remove();
      chat.remove();
      theme.remove();
      if (previousSillyTavern === undefined) delete (window as any).SillyTavern;
      else (window as any).SillyTavern = previousSillyTavern;
    }
  }

  return { passed: passed.length, checks: passed };
}
