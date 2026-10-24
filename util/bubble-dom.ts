type NodePatch = { node: Node; incoming: Node; children?: NodePatch[] };

/** 解析时隔离运行中的组件，提交时复用原节点及未变化的 DOM。 */
export function createBubbleDomUpdate(root: HTMLElement): { html: string; apply: (html: string) => boolean } {
  const document = root.ownerDocument;
  const prefix = `fhb-live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-`;
  const retained = new Map<string, Element>();

  function cloneForParse(node: Node): Node {
    if (node.nodeType === 1) {
      const element = node as Element;
      if (element.matches('[data-bbi-slot], iframe, video, audio, canvas, object, embed') || element.shadowRoot) {
        const key = `${prefix}${retained.size}`;
        retained.set(key, element);
        return document.createComment(key);
      }
    }
    const clone = node.cloneNode(false);
    for (const child of node.childNodes) clone.appendChild(cloneForParse(child));
    return clone;
  }

  const snapshot = root.cloneNode(false) as HTMLElement;
  for (const child of root.childNodes) snapshot.appendChild(cloneForParse(child));

  function apply(html: string): boolean {
    const template = document.createElement('template');
    template.innerHTML = html;
    const markers = new Map<Node, Element>();
    const found = new Set<string>();
    const walker = document.createTreeWalker(template.content, 128 /* SHOW_COMMENT */);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const key = node.nodeValue ?? '';
      const original = retained.get(key);
      if (!original) continue;
      if (found.has(key) || !root.contains(original)) return false;
      found.add(key);
      markers.set(node, original);
    }
    // 条目解析若吞掉组件占位，保留现场，不能提交一个缺失组件的结果。
    if (found.size !== retained.size) {
      console.warn('[聊天气泡] 组件占位不完整，已跳过本次转换');
      return false;
    }

    function componentsIn(node: Node): Element[] {
      return [...markers].filter(([marker]) => node.contains(marker)).map(([, original]) => original);
    }

    function planChildren(parent: Element, incoming: Node): NodePatch[] {
      const oldChildren = Array.from(parent.childNodes);
      const used = new Set<Node>();
      return Array.from(incoming.childNodes, child => {
        const component = markers.get(child);
        if (component) {
          used.add(component);
          return { node: component, incoming: child };
        }
        const components = componentsIn(child);
        const original = oldChildren.find(old => {
          if (used.has(old) || old.nodeType !== child.nodeType) return false;
          if (!components.length) return old.isEqualNode(child);
          return (
            old.nodeName === child.nodeName &&
            (old as Element).namespaceURI === (child as Element).namespaceURI &&
            components.every(component => old.contains(component))
          );
        });
        if (original) used.add(original);
        const node = original ?? (components.length ? child.cloneNode(false) : child);
        return {
          node,
          incoming: child,
          ...(components.length ? { children: planChildren(node as Element, child) } : {}),
        };
      });
    }

    const patches = planChildren(root, template.content);
    const obsolete: { parent: Element; node: Node }[] = [];
    const containsComponent = (node: Node) => [...retained.values()].some(component => node.contains(component));

    function patchChildren(parent: Element, children: NodePatch[]): void {
      const wanted = new Set(children.map(child => child.node));
      for (const old of Array.from(parent.childNodes)) {
        if (wanted.has(old)) continue;
        if (containsComponent(old)) obsolete.push({ parent, node: old });
        else parent.removeChild(old);
      }
      let cursor = parent.firstChild;
      for (const patch of children) {
        const { node, incoming } = patch;
        if (node !== cursor) {
          // 同一文档内需要移动组件时，支持的浏览器可保留 iframe/custom element 的连接状态。
          if (node.isConnected && parent.isConnected && typeof parent.moveBefore === 'function') {
            parent.moveBefore(node, cursor);
          } else {
            parent.insertBefore(node, cursor);
          }
        }
        if (patch.children) {
          const element = node as Element;
          const next = incoming as Element;
          for (const attribute of Array.from(element.attributes)) {
            if (!next.hasAttributeNS(attribute.namespaceURI, attribute.localName))
              element.removeAttributeNode(attribute);
          }
          for (const attribute of Array.from(next.attributes)) {
            if (element.getAttributeNS(attribute.namespaceURI, attribute.localName) !== attribute.value) {
              element.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value);
            }
          }
          patchChildren(element, patch.children);
        }
        cursor = node.nextSibling;
      }
    }

    patchChildren(root, patches);
    for (const { parent, node } of obsolete) {
      if (node.parentNode === parent) parent.removeChild(node);
    }
    return true;
  }

  return { html: snapshot.innerHTML, apply };
}
