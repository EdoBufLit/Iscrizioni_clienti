export type CommunicationStyle = "standard" | "notice" | "status" | "news";
export type CommunicationSpan = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; highlight?: boolean; href?: string | null };
export type CommunicationTextBlock = { type: "paragraph" | "heading" | "quote" | "bullet" | "ordered"; spans: CommunicationSpan[] };
export type CommunicationImageBlock = { type: "image"; src: string; alt: string };
export type CommunicationBlock = CommunicationTextBlock | CommunicationImageBlock;
export type CommunicationDocument = { version: 1; style: CommunicationStyle; blocks: CommunicationBlock[] };

export const communicationStyles: Record<CommunicationStyle, string> = {
  standard: "Comunicazione", notice: "Avviso", status: "Stato dei servizi", news: "Novità della piattaforma",
};
export const MAX_COMMUNICATION_TEXT = 20000;

export function safeCommunicationUrl(raw: string, image = false): string | null {
  const value = raw.trim();
  if (!value || value.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!image && url.protocol === "mailto:" && !url.search && !url.hash && /^[^@\s:]+@[^@\s:]+\.[^@\s:]+$/.test(url.pathname)) return value;
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    if (image && !/\.(png|jpe?g|gif|webp|avif)$/i.test(decodeURIComponent(url.pathname))) return null;
    return value;
  } catch { return null; }
}

export function communicationDocumentText(document: CommunicationDocument): string {
  return document.blocks.map(block => block.type === "image" ? `${block.alt} (${block.src})` : block.spans.map(span => span.text).join("")).join("\n\n").trim();
}

export function plainCommunicationDocument(body: string, style: CommunicationStyle = "standard"): CommunicationDocument {
  return { version: 1, style, blocks: body ? body.split(/\n\n/).map(text => ({ type: "paragraph", spans: [{ text }] })) : [{ type: "paragraph", spans: [{ text: "" }] }] };
}

export function validateCommunicationDocument(value: unknown): CommunicationDocument | null {
  if (!value || typeof value !== "object") return null;
  const doc = value as CommunicationDocument;
  if (doc.version !== 1 || typeof doc.style !== "string" || !Object.prototype.hasOwnProperty.call(communicationStyles, doc.style) || !Array.isArray(doc.blocks) || doc.blocks.length < 1 || doc.blocks.length > 80) return null;
  let images = 0, spans = 0;
  for (const block of doc.blocks) {
    if (!block || typeof block !== "object") return null;
    if (block.type === "image") {
      if (typeof block.src !== "string" || !safeCommunicationUrl(block.src, true) || typeof block.alt !== "string" || !block.alt.trim() || block.alt.length > 240) return null;
      images++;
    } else {
      if (!["paragraph", "heading", "quote", "bullet", "ordered"].includes(block.type) || !Array.isArray(block.spans) || !block.spans.length || block.spans.length > 100) return null;
      for (const span of block.spans) {
        if (!span || typeof span.text !== "string" || span.text.length > MAX_COMMUNICATION_TEXT) return null;
        if ([span.bold, span.italic, span.underline, span.highlight].some(mark => mark !== undefined && typeof mark !== "boolean")) return null;
        if (span.href != null && (typeof span.href !== "string" || !safeCommunicationUrl(span.href))) return null;
        spans++;
      }
    }
  }
  return images <= 6 && spans <= 1000 && communicationDocumentText(doc).length <= MAX_COMMUNICATION_TEXT ? doc : null;
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
export function communicationEditorHtml(document: CommunicationDocument): string {
  if (!validateCommunicationDocument(document)) return "";
  return document.blocks.map(block => {
    if (block.type === "image") return `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" referrerpolicy="no-referrer" loading="lazy" />`;
    let content = block.spans.map(span => {
      let text = escapeHtml(span.text).replace(/\n/g, "<br>");
      if (span.bold) text = `<strong>${text}</strong>`;
      if (span.italic) text = `<em>${text}</em>`;
      if (span.underline) text = `<u>${text}</u>`;
      if (span.highlight) text = `<mark>${text}</mark>`;
      if (span.href) text = `<a href="${escapeHtml(span.href)}">${text}</a>`;
      return text;
    }).join("") || "<br>";
    const tag = ({ paragraph: "p", heading: "h2", quote: "blockquote", bullet: "ul", ordered: "ol" } as const)[block.type];
    if (block.type === "bullet" || block.type === "ordered") content = `<li>${content}</li>`;
    return `<${tag}>${content}</${tag}>`;
  }).join("");
}

export function readCommunicationEditor(root: HTMLElement, style: CommunicationStyle): CommunicationDocument {
  const blocks: CommunicationBlock[] = [];
  function textSpans(node: Node, marks: Omit<CommunicationSpan, "text"> = {}): CommunicationSpan[] {
    if (node.nodeType === Node.TEXT_NODE) return [{ ...marks, text: node.textContent ?? "" }];
    if (!(node instanceof HTMLElement) || /^(SCRIPT|STYLE|SVG|IFRAME|OBJECT|IMG)$/.test(node.tagName)) return [];
    if (node.tagName === "BR") return [{ ...marks, text: "\n" }];
    const next = { ...marks };
    if (/^(B|STRONG)$/.test(node.tagName) || ["bold", "700"].includes(node.style.fontWeight)) next.bold = true;
    if (/^(I|EM)$/.test(node.tagName) || node.style.fontStyle === "italic") next.italic = true;
    if (node.tagName === "U" || node.style.textDecoration.includes("underline")) next.underline = true;
    if (node.tagName === "MARK" || node.style.backgroundColor) next.highlight = true;
    if (node.tagName === "A") next.href = safeCommunicationUrl(node.getAttribute("href") ?? "");
    return [...node.childNodes].flatMap(child => textSpans(child, next));
  }
  let pending: CommunicationSpan[] = [];
  const flush = () => { if (pending.length) { blocks.push({ type: "paragraph", spans: pending }); pending = []; } };
  for (const node of root.childNodes) {
    if (node instanceof HTMLImageElement) {
      flush(); const src = safeCommunicationUrl(node.getAttribute("src") ?? "", true), alt = node.alt.trim();
      if (src && alt) blocks.push({ type: "image", src, alt });
    } else if (node instanceof HTMLElement && /^(P|DIV|H[1-6]|BLOCKQUOTE|UL|OL)$/.test(node.tagName)) {
      flush();
      if (node.tagName === "UL" || node.tagName === "OL") {
        for (const item of node.children) { const spans = textSpans(item); blocks.push({ type: node.tagName === "UL" ? "bullet" : "ordered", spans: spans.length ? spans : [{ text: "" }] }); }
      } else {
        const spans = textSpans(node);
        blocks.push({ type: /^H/.test(node.tagName) ? "heading" : node.tagName === "BLOCKQUOTE" ? "quote" : "paragraph", spans: spans.length ? spans : [{ text: "" }] });
      }
    } else pending.push(...textSpans(node));
  }
  flush();
  return { version: 1, style, blocks: blocks.length ? blocks : [{ type: "paragraph", spans: [{ text: "" }] }] };
}

export function isPlainCommunicationDocument(document: CommunicationDocument): boolean {
  return document.style === "standard" && document.blocks.every(block => block.type === "paragraph" && block.spans.every(span => !span.bold && !span.italic && !span.underline && !span.highlight && !span.href));
}
