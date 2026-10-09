type EchoTheaterDisplayAdapter = {
  prepare: () => string | null;
  replaceElement: (element: HTMLElement) => void;
  restoreElement: (element: HTMLElement) => void;
};

const ECHO_CONTENT_SELECTOR = '#t-output-content, #t-read-content';
const ECHO_TITLE_SELECTOR = '#t-char-name';
const ECHO_TARGET_SELECTOR = `${ECHO_CONTENT_SELECTOR}, ${ECHO_TITLE_SELECTOR}`;

export function createEchoTheaterEnhancer(
  adapter: EchoTheaterDisplayAdapter,
  pDoc: Document,
  pWin: Window,
): { reapply: () => void; destroy: (restore: boolean) => void } {
  const Observer = (pWin as any).MutationObserver as typeof MutationObserver;
  const targetObservers = new Map<HTMLElement, MutationObserver>();
  const shadowObservers = new Map<ShadowRoot, MutationObserver>();
  const textStates = new Map<HTMLElement, { rendered: string; signature: string }>();
  let destroyed = false;
  let applyTimer: number | null = null;

  const clearTimer = () => {
    if (applyTimer !== null) pWin.clearTimeout(applyTimer);
    applyTimer = null;
  };
  const scheduleApply = () => {
    if (destroyed || applyTimer !== null) return;
    applyTimer = pWin.setTimeout(reapply, 80);
  };
  const pauseObservers = () => {
    documentObserver.disconnect();
    targetObservers.forEach(observer => observer.disconnect());
    shadowObservers.forEach(observer => observer.disconnect());
  };
  const restore = () => {
    textStates.forEach((_, element) => adapter.restoreElement(element));
    textStates.clear();
  };
  const applyElement = (element: HTMLElement, signature: string) => {
    const state = textStates.get(element);
    if (state?.rendered === element.innerHTML && state.signature === signature) return;
    adapter.replaceElement(element);
    textStates.set(element, { rendered: element.innerHTML, signature });
  };

  const reapply = () => {
    if (destroyed) return;
    clearTimer();
    // 连同挂载观察一起暂停，避免自己的替换节点触发后续刷新。
    pauseObservers();
    const signature = adapter.prepare();
    if (signature === null) {
      restore();
      targetObservers.clear();
      shadowObservers.clear();
      return;
    }

    const targets = new Set(pDoc.querySelectorAll<HTMLElement>(ECHO_TARGET_SELECTOR));
    const roots = new Set<ShadowRoot>();
    const elements = new Set<HTMLElement>();
    targets.forEach(target => {
      if (target.matches(ECHO_TITLE_SELECTOR)) {
        elements.add(target);
      } else {
        const hosts = target.querySelectorAll<HTMLElement>('.t-shadow-host');
        hosts.forEach(host => {
          const root = host.shadowRoot;
          if (!root) return;
          roots.add(root);
          root.querySelectorAll<HTMLElement>('.t-shadow-content').forEach(element => elements.add(element));
        });
        // 渲染器失败时回声会退回普通 HTML；仍只处理结果容器。
        if (hosts.length === 0) elements.add(target);
      }
    });
    textStates.forEach((_, element) => {
      if (!elements.has(element)) {
        adapter.restoreElement(element);
        textStates.delete(element);
      }
    });
    elements.forEach(element => applyElement(element, signature));

    targetObservers.forEach((_, target) => {
      if (!targets.has(target)) targetObservers.delete(target);
    });
    targets.forEach(target => {
      const observer = targetObservers.get(target) ?? new Observer(scheduleApply);
      targetObservers.set(target, observer);
      observer.observe(target, { childList: true, characterData: true, subtree: true });
    });
    shadowObservers.forEach((_, root) => {
      if (!roots.has(root)) shadowObservers.delete(root);
    });
    roots.forEach(root => {
      const observer = shadowObservers.get(root) ?? new Observer(scheduleApply);
      shadowObservers.set(root, observer);
      observer.observe(root, { childList: true, characterData: true, subtree: true });
    });
    if (pDoc.body) documentObserver.observe(pDoc.body, { childList: true, subtree: true });
  };

  const containsTarget = (node: Node) =>
    node.nodeType === 1 &&
    ((node as Element).matches(ECHO_TARGET_SELECTOR) || !!(node as Element).querySelector(ECHO_TARGET_SELECTOR));
  const documentObserver = new Observer(mutations => {
    // 容器自身重建时才重新挂载；聊天区等其他变化不扫描所有输出。
    if (
      mutations.some(
        mutation =>
          Array.from(mutation.addedNodes).some(containsTarget) ||
          Array.from(mutation.removedNodes).some(containsTarget),
      )
    ) {
      scheduleApply();
    }
  });

  return {
    reapply,
    destroy: shouldRestore => {
      if (destroyed) return;
      destroyed = true;
      clearTimer();
      pauseObservers();
      if (shouldRestore) restore();
      else textStates.clear();
      targetObservers.clear();
      shadowObservers.clear();
    },
  };
}
