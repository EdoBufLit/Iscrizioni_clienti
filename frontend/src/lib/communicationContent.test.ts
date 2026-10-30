import { describe, expect, it } from "vitest";
import { communicationDocumentText, communicationEditorHtml, readCommunicationEditor, safeCommunicationUrl, validateCommunicationDocument, type CommunicationDocument } from "./communicationContent";

describe("Contenuto strutturato comunicazioni", () => {
  it.each(["javascript:alert(1)", "data:image/png;base64,abc", "//example.com/a.png", "http://example.com/a.png", "https://user:password@example.com/a.png", "https://example.com/a.svg", "https://example.com/a.%73vg"])("rifiuta immagini non sicure: %s", value => {
    expect(safeCommunicationUrl(value, true)).toBeNull();
  });

  it("conserva solo formattazione supportata e testo da un DOM non attendibile", () => {
    const root = window.document.createElement("div");
    root.innerHTML = '<p onclick="evil()"><strong>Forte</strong><em> e corsivo</em><a href="javascript:evil()"> testo link</a><script>evil()</script></p><ul><li>Uno</li><li>Due</li></ul><img src="https://example.com/a.svg" alt="SVG"><img src="https://example.com/a.png" alt="Logo">';
    const document = readCommunicationEditor(root, "notice");
    expect(communicationDocumentText(document)).toBe("Forte e corsivo testo link\n\nUno\n\nDue\n\nLogo (https://example.com/a.png)");
    expect(document.blocks).toHaveLength(4);
    expect(JSON.stringify(document)).not.toContain("evil()");
    const html = communicationEditorHtml(document);
    expect(html).toContain("<strong>Forte</strong>");
    expect(html).not.toMatch(/onclick|script|javascript|\.svg/);
  });

  it("rifiuta nodi e dimensioni fuori contratto anche se arrivano dal server", () => {
    expect(validateCommunicationDocument({ version: 1, style: "toString", blocks: [{ type: "paragraph", spans: [{ text: "test" }] }] })).toBeNull();
    expect(validateCommunicationDocument({ version: 1, style: "news", blocks: Array.from({ length: 81 }, () => ({ type: "paragraph", spans: [{ text: "test" }] })) })).toBeNull();
    const tooLong: CommunicationDocument = { version: 1, style: "notice", blocks: [{ type: "paragraph", spans: [{ text: "x".repeat(20001) }] }] };
    expect(validateCommunicationDocument(tooLong)).toBeNull();
    expect(communicationEditorHtml(tooLong)).toBe("");
  });

  it("l'HTML dell'editor è generato da testo escapato, mai da HTML scritto dall'autore", () => {
    const document: CommunicationDocument = { version: 1, style: "standard", blocks: [{ type: "paragraph", spans: [{ text: '<img src=x onerror="evil()">', bold: true }] }] };
    const html = communicationEditorHtml(document);
    expect(html).toContain("&lt;img src=x onerror=&quot;evil()&quot;&gt;");
    expect(html).not.toContain("<img");
  });
});
