type EchoTheaterDisplayAdapter = {
  prepare: () => boolean;
  replaceElement: (element: HTMLElement) => void;
  restoreElement: (element: HTMLElement) => void;
};

type EchoTheaterShadowState = {
  observer: MutationObserver;
};

export function createEchoTheaterEnhancer(
  adapter: EchoTheaterDisplayAdapter,
  pDoc: Document,
  pWin: Window,
): { reapply: () => void; destroy: (restore: boolean) => void } {
  const ParentMutationObserver = (pWin as any).MutationObserver as typeof MutationObserver | undefined;
  const shadowStates = new Map<ShadowRoot, EchoTheaterShadowState>();
  let destroyed = false;
  let outputElement: HTMLElement | null = null;
  let outputObserver: MutationObserver | null = null;
  let documentObserver: MutationObserver | null = null;
  let titleObserver: MutationObserver | null = null;
  let trackedTitle: HTMLElement | null = null;
  let applyTimer: number | null = null;

  const restoreShadowRoot = (root: ShadowRoot) => {
    root.querySelectorAll<HTMLElement>('.t-shadow-content').forEach(content => adapter.restoreElement(content));
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
    adapter.restoreElement(trackedTitle);
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
      const ShadowMutationObserver = ((root.ownerDocument.defaultView as any)?.MutationObserver ??
        ParentMutationObserver) as typeof MutationObserver | undefined;
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
    documentObserver?.disconnect();
    titleObserver?.disconnect();
    outputObserver?.disconnect();
    shadowStates.forEach(state => state.observer.disconnect());

    const active = adapter.prepare();
    const nextTitle = pDoc.querySelector<HTMLElement>('#t-char-name');

    if (trackedTitle && trackedTitle !== nextTitle) restoreTitle();
    trackedTitle = nextTitle;
    if (trackedTitle) {
      if (active) adapter.replaceElement(trackedTitle);
      else adapter.restoreElement(trackedTitle);
    }

    const activeRoots = new Set<ShadowRoot>();
    outputElement?.querySelectorAll<HTMLElement>('.t-shadow-host').forEach(host => {
      const root = host.shadowRoot;
      if (!root) return;
      activeRoots.add(root);

      root.querySelectorAll<HTMLElement>('.t-shadow-content').forEach(content => {
        if (active) adapter.replaceElement(content);
        else adapter.restoreElement(content);
      });
      if (active) observeShadowRoot(root);
    });

    for (const root of Array.from(shadowStates.keys())) {
      if (!active) destroyShadowState(root, false);
      else if (!activeRoots.has(root) || !root.host.isConnected) destroyShadowState(root, true);
    }

    if (active && outputElement && ParentMutationObserver) {
      outputObserver ??= new ParentMutationObserver(scheduleApply);
      outputObserver.observe(outputElement, { childList: true, characterData: true, subtree: true });
    }
    if (active && trackedTitle && ParentMutationObserver) {
      titleObserver ??= new ParentMutationObserver(scheduleApply);
      titleObserver.observe(trackedTitle, { childList: true, characterData: true, subtree: true });
    }
    if (active && pDoc.body) documentObserver?.observe(pDoc.body, { childList: true, subtree: true });
  };

  if (ParentMutationObserver && pDoc.body) {
    // #t-output-content 本身可能随小剧场的关闭与重新打开而重建；这里只负责重新绑定目标观察器。
    documentObserver = new ParentMutationObserver(() => {
      const nextOutput = pDoc.querySelector<HTMLElement>('#t-output-content');
      const nextTitle = pDoc.querySelector<HTMLElement>('#t-char-name');
      if (nextOutput !== outputElement || nextTitle !== trackedTitle) scheduleApply();
    });
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
      titleObserver?.disconnect();
      titleObserver = null;
      restoreTitle();
      for (const root of Array.from(shadowStates.keys())) destroyShadowState(root, restore);
      outputElement = null;
    },
  };
}
