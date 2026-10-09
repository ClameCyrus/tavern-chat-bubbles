type QianyeTheaterDisplayAdapter = {
  isEnabled: () => boolean;
  signature: () => string;
  replaceHtml: (source: string) => string;
  replaceElement: (element: HTMLElement) => void;
  restoreElement: (element: HTMLElement) => void;
};

const RESULT_FRAME_SELECTOR = [
  '#theater-output-frame',
  '.theater-popup iframe[data-reader-frame]',
  '#theater-reader-frame',
  '#theater-dream-review-frame',
  '#theater-dream-progress-candidate-frame',
].join(', ');
const RESULT_TEXT_SELECTOR = [
  '#theater-output-text-fallback',
  '#theater-reader-text-fallback',
  '#theater-dream-review-fallback',
  '#theater-dream-progress-candidate-fallback',
  '#theater-dream-generation-text',
].join(', ');
const RESULT_SELECTOR = `${RESULT_FRAME_SELECTOR}, ${RESULT_TEXT_SELECTOR}`;

/** 千夜浮梦使用不透明源沙盒；只改展示用 srcdoc 副本，保留沙盒和插件的原始结果。 */
export function createQianyeTheaterEnhancer(
  adapter: QianyeTheaterDisplayAdapter,
  ownerDocument: Document,
  ownerWindow: Window,
): { reapply: () => void; destroy: (restore: boolean) => void } {
  const frameStates = new Map<HTMLIFrameElement, { original: string; rendered: string; signature: string }>();
  const textStates = new Map<HTMLElement, { rendered: string; signature: string }>();
  const Observer = (ownerWindow as any).MutationObserver as typeof MutationObserver;
  let destroyed = false;
  let timer: number | null = null;

  const clearTimer = () => {
    if (timer !== null) ownerWindow.clearTimeout(timer);
    timer = null;
  };

  const restore = () => {
    frameStates.forEach((state, frame) => {
      // 插件可能已经换了结果；不能用上一份缓存覆盖它刚写入的新 srcdoc。
      if (frame.isConnected && frame.getAttribute('srcdoc') === state.rendered && state.rendered !== state.original) {
        frame.setAttribute('srcdoc', state.original);
      }
    });
    frameStates.clear();
    textStates.forEach((_, element) => adapter.restoreElement(element));
    textStates.clear();
  };

  const reapply = () => {
    if (destroyed) return;
    clearTimer();
    observer.disconnect();
    if (!adapter.isEnabled()) {
      restore();
      return;
    }

    const signature = adapter.signature();
    const currentFrames = new Set(ownerDocument.querySelectorAll<HTMLIFrameElement>(RESULT_FRAME_SELECTOR));
    frameStates.forEach((_, frame) => {
      if (!currentFrames.has(frame)) frameStates.delete(frame);
    });
    currentFrames.forEach(frame => {
      const current = frame.getAttribute('srcdoc');
      if (!current) {
        frameStates.delete(frame);
        return;
      }
      const state = frameStates.get(frame);
      if (state?.rendered === current && state.signature === signature) return;
      const original = state?.rendered === current ? state.original : current;
      const rendered = adapter.replaceHtml(original);
      frameStates.set(frame, { original, rendered, signature });
      if (current !== rendered) frame.setAttribute('srcdoc', rendered);
    });

    const currentText = new Set(ownerDocument.querySelectorAll<HTMLElement>(RESULT_TEXT_SELECTOR));
    textStates.forEach((_, element) => {
      if (!currentText.has(element)) {
        adapter.restoreElement(element);
        textStates.delete(element);
      }
    });
    currentText.forEach(element => {
      const state = textStates.get(element);
      if (state?.rendered === element.innerHTML && state.signature === signature) return;
      adapter.replaceElement(element);
      textStates.set(element, { rendered: element.innerHTML, signature });
    });
    if (ownerDocument.body) {
      observer.observe(ownerDocument.body, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['srcdoc'],
      });
    }
  };

  const observer = new Observer(mutations => {
    const relevant = mutations.some(mutation => {
      const element = mutation.target.nodeType === 1 ? (mutation.target as Element) : mutation.target.parentElement;
      if (mutation.type === 'attributes') return !!element?.matches(RESULT_FRAME_SELECTOR);
      if (element?.closest(RESULT_TEXT_SELECTOR)) return true;
      const containsResult = (node: Node) =>
        node.nodeType === 1 &&
        ((node as Element).matches(RESULT_SELECTOR) || !!(node as Element).querySelector(RESULT_SELECTOR));
      return (
        Array.from(mutation.addedNodes).some(containsResult) || Array.from(mutation.removedNodes).some(containsResult)
      );
    });
    if (!relevant || timer !== null) return;
    timer = ownerWindow.setTimeout(reapply, 0);
  });

  return {
    reapply,
    destroy: shouldRestore => {
      if (destroyed) return;
      destroyed = true;
      clearTimer();
      observer.disconnect();
      if (shouldRestore) restore();
      else {
        frameStates.clear();
        textStates.clear();
      }
    },
  };
}
