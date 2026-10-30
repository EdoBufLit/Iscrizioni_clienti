import { useLayoutEffect, useRef, useState, type ClipboardEvent } from "react";
import {
  communicationDocumentText, communicationEditorHtml, communicationStyles,
  plainCommunicationDocument, readCommunicationEditor, safeCommunicationUrl, validateCommunicationDocument,
  type CommunicationDocument, type CommunicationStyle,
} from "../lib/communicationContent";
import CommunicationContent from "./CommunicationContent";
import "./PlatformMessageEditor.css";

type Props = { body: string; document?: CommunicationDocument | null; disabled?: boolean; onChange: (body: string, document?: CommunicationDocument) => void };
const emojis = ["📣", "🔔", "✨", "✅", "⚠️", "🛠️", "📅", "🎉", "💡", "🚀", "📌", "🤝"];

export default function PlatformMessageEditor({ body, document: content, disabled = false, onChange }: Props) {
  const editor = useRef<HTMLDivElement>(null);
  const selection = useRef<Range | null>(null);
  const synchronized = useRef("");
  const [tool, setTool] = useState<"emoji" | "link" | "image" | null>(null);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const current = content ?? plainCommunicationDocument(body);
  const key = JSON.stringify(current);

  useLayoutEffect(() => {
    if (editor.current && synchronized.current !== key) {
      editor.current.innerHTML = communicationEditorHtml(current);
      synchronized.current = key;
      selection.current = null;
    }
  }, [key]);

  function rememberSelection() {
    const range = window.getSelection();
    if (range?.rangeCount && editor.current?.contains(range.anchorNode) && editor.current.contains(range.focusNode)) selection.current = range.getRangeAt(0).cloneRange();
  }
  function restoreSelection() {
    if (!editor.current) return;
    editor.current.focus();
    const range = window.getSelection();
    if (!range) return;
    range.removeAllRanges();
    if (selection.current && editor.current.contains(selection.current.commonAncestorContainer)) range.addRange(selection.current);
    else { const end = window.document.createRange(); end.selectNodeContents(editor.current); end.collapse(false); range.addRange(end); }
  }
  function publish(style = current.style) {
    if (!editor.current) return;
    const next = readCommunicationEditor(editor.current, style);
    synchronized.current = JSON.stringify(next);
    setError(validateCommunicationDocument(next) ? "" : "Riduci il messaggio: massimo 20.000 caratteri, 80 blocchi e 6 immagini.");
    onChange(communicationDocumentText(next), next);
    rememberSelection();
  }
  function command(name: string, value?: string) {
    if (disabled) return;
    restoreSelection();
    window.document.execCommand(name, false, value);
    publish();
  }
  function insertText(text: string) {
    restoreSelection();
    if (typeof window.document.execCommand === "function") window.document.execCommand("insertText", false, text);
    else {
      const range = window.getSelection()?.getRangeAt(0);
      if (range) { range.deleteContents(); const node = window.document.createTextNode(text); range.insertNode(node); range.setStartAfter(node); range.collapse(true); }
    }
    publish();
  }
  function paste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!disabled) insertText(event.clipboardData.getData("text/plain"));
  }
  function openTool(next: typeof tool) {
    rememberSelection(); setTool(tool === next ? null : next); setUrl("");
    setDescription(next === "link" ? (window.getSelection()?.toString().trim().slice(0, 500) ?? "") : ""); setError("");
  }
  function addUrl() {
    const safe = safeCommunicationUrl(url, tool === "image");
    if (!safe) { setError(tool === "image" ? "Usa un indirizzo HTTPS che termini con PNG, JPG, GIF, WebP o AVIF." : "Usa un indirizzo HTTPS o un'email mailto: valida."); return; }
    if (!description.trim()) { setError(tool === "image" ? "Aggiungi una descrizione dell'immagine." : "Scrivi il testo del collegamento."); return; }
    if (tool === "image" && current.blocks.filter(block => block.type === "image").length >= 6) { setError("Puoi aggiungere al massimo 6 immagini."); return; }
    restoreSelection();
    if (tool === "image") {
      const image = window.document.createElement("img"); image.src = safe; image.alt = description.trim();
      image.referrerPolicy = "no-referrer";
      editor.current?.append(image);
      const paragraph = window.document.createElement("p"); paragraph.append(window.document.createElement("br")); editor.current?.append(paragraph);
    } else {
      const link = window.document.createElement("a"); link.href = safe; link.textContent = description.trim();
      const range = window.getSelection()?.getRangeAt(0);
      if (range) { range.deleteContents(); range.insertNode(link); range.setStartAfter(link); range.collapse(true); }
    }
    setTool(null); setUrl(""); setDescription(""); publish();
  }
  function chooseStyle(style: CommunicationStyle) {
    const next = { ...current, style };
    onChange(communicationDocumentText(next), next);
  }

  return <div className="platform-editor">
    <div className="platform-editor__topline">
      <label htmlFor="communication-style">Stile del messaggio<select id="communication-style" value={current.style} disabled={disabled} onChange={event => chooseStyle(event.target.value as CommunicationStyle)}>
        {Object.entries(communicationStyles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button type="button" className="platform-editor__preview-toggle" aria-pressed={preview} onClick={() => setPreview(value => !value)}>{preview ? "Torna alla scrittura" : "Anteprima messaggio"}</button>
    </div>
    <div hidden={preview}>
      <div className="platform-editor__toolbar" role="toolbar" aria-label="Formattazione del messaggio">
        <button type="button" disabled={disabled} aria-label="Grassetto" title="Grassetto" onMouseDown={event => event.preventDefault()} onClick={() => command("bold")}><strong>B</strong></button>
        <button type="button" disabled={disabled} aria-label="Corsivo" title="Corsivo" onMouseDown={event => event.preventDefault()} onClick={() => command("italic")}><em>I</em></button>
        <button type="button" disabled={disabled} aria-label="Sottolineato" title="Sottolineato" onMouseDown={event => event.preventDefault()} onClick={() => command("underline")}><u>U</u></button>
        <button type="button" disabled={disabled} aria-label="Evidenzia testo" title="Evidenzia testo" onMouseDown={event => event.preventDefault()} onClick={() => command("hiliteColor", "#fff0b8")}><mark>A</mark></button>
        <select aria-label="Tipo di paragrafo" disabled={disabled} defaultValue="p" onMouseDown={rememberSelection} onChange={event => { command("formatBlock", event.target.value); event.target.value = "p"; }}><option value="p">Paragrafo</option><option value="h2">Titolo</option><option value="blockquote">Citazione</option></select>
        <button type="button" disabled={disabled} aria-label="Elenco puntato" title="Elenco puntato" onMouseDown={event => event.preventDefault()} onClick={() => command("insertUnorderedList")}>• Elenco</button>
        <button type="button" disabled={disabled} aria-label="Elenco numerato" title="Elenco numerato" onMouseDown={event => event.preventDefault()} onClick={() => command("insertOrderedList")}>1. Elenco</button>
        <button type="button" disabled={disabled} aria-label="Aggiungi emoji" aria-expanded={tool === "emoji"} onMouseDown={event => event.preventDefault()} onClick={() => openTool("emoji")}>😊</button>
        <button type="button" disabled={disabled} aria-expanded={tool === "link"} onMouseDown={event => event.preventDefault()} onClick={() => openTool("link")}>Collegamento</button>
        <button type="button" disabled={disabled} aria-expanded={tool === "image"} onMouseDown={event => event.preventDefault()} onClick={() => openTool("image")}>Immagine</button>
        <button type="button" disabled={disabled} aria-label="Rimuovi formattazione" title="Rimuovi formattazione" onMouseDown={event => event.preventDefault()} onClick={() => command("removeFormat")}>Aa</button>
      </div>
      {tool === "emoji" && <div className="platform-editor__emojis" role="group" aria-label="Emoji per comunicazioni">{emojis.map(emoji => <button key={emoji} type="button" disabled={disabled} aria-label={`Inserisci ${emoji}`} onMouseDown={event => event.preventDefault()} onClick={() => { insertText(emoji); setTool(null); }}>{emoji}</button>)}</div>}
      {(tool === "image" || tool === "link") && <div className="platform-editor__insert" role="group" aria-label={tool === "image" ? "Aggiungi immagine" : "Aggiungi collegamento"} onKeyDown={event => {
        if (event.key === "Enter") { event.preventDefault(); addUrl(); }
        if (event.key === "Escape") { event.preventDefault(); setTool(null); setError(""); restoreSelection(); }
      }}>
        <label>Indirizzo {tool === "image" ? "immagine HTTPS" : "collegamento"}<input type="url" value={url} maxLength={2048} disabled={disabled} onChange={event => setUrl(event.target.value)} placeholder={tool === "image" ? "https://sito.it/immagine.png" : "https://sito.it/pagina"} /></label>
        <label>{tool === "image" ? "Descrizione immagine" : "Testo collegamento"}<input value={description} maxLength={tool === "image" ? 240 : 500} disabled={disabled} onChange={event => setDescription(event.target.value)} /></label>
        <div><button type="button" disabled={disabled} onClick={addUrl}>Inserisci {tool === "image" ? "immagine" : "collegamento"}</button><button type="button" disabled={disabled} onClick={() => { setTool(null); setError(""); }}>Annulla</button></div>
      </div>}
      <div ref={editor} id="communication-body" className="platform-editor__input" contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-labelledby="communication-body-label" aria-multiline="true" aria-disabled={disabled} aria-describedby="communication-editor-help" data-placeholder="Gentili associazioni, condividiamo con voi…" onInput={() => publish()} onKeyUp={rememberSelection} onMouseUp={rememberSelection} onPaste={paste} onDrop={event => event.preventDefault()} />
    </div>
    {preview && <div className="platform-editor__preview" aria-label="Anteprima del messaggio"><CommunicationContent body={body} document={content} /></div>}
    {error && <p className="platform-editor__error" role="alert">{error}</p>}
    <p id="communication-editor-help" className="central-comms__muted platform-editor__help">{body.length.toLocaleString("it-IT")}/20.000 caratteri · Lo stile viene mantenuto nell'area riservata e nell'email.</p>
  </div>;
}
