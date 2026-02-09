// Simple JSX-to-string runtime for Bun (no dependencies)
// Usage: import { h, Fragment } from "./jsx-runtime" in each TSX file

export type Child = string | number | boolean | null | undefined | Child[];
export type Props = Record<string, unknown> & { children?: Child };
export type Component = (props: Props) => string;

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const ATTR_ALIASES: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderChildren(children: Child): string {
  if (children == null || children === false) return '';
  if (Array.isArray(children)) return children.map(renderChildren).join('');
  return String(children);
}

function renderAttrs(props: Props | null): string {
  if (!props) return '';
  const attrs: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || value == null || value === false) continue;
    const attrName = ATTR_ALIASES[key] || key;
    if (value === true) {
      attrs.push(attrName);
    } else if (typeof value === 'string') {
      attrs.push(`${attrName}="${escapeHtml(value)}"`);
    } else {
      attrs.push(`${attrName}="${escapeHtml(String(value))}"`);
    }
  }
  return attrs.length ? ' ' + attrs.join(' ') : '';
}

export function h(
  tag: string | Component,
  props: Props | null,
  ...children: Child[]
): string {
  const allChildren = children.length > 0 ? children : props?.children;
  
  if (typeof tag === 'function') {
    return tag({ ...props, children: allChildren });
  }

  const attrs = renderAttrs(props);
  const content = renderChildren(allChildren);

  if (VOID_ELEMENTS.has(tag)) {
    return `<${tag}${attrs}>`;
  }

  return `<${tag}${attrs}>${content}</${tag}>`;
}

// Fragment just renders children
export function Fragment({ children }: Props): string {
  return renderChildren(children);
}
