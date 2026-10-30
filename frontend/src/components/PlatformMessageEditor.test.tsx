import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import PlatformMessageEditor from "./PlatformMessageEditor";
import CommunicationContent from "./CommunicationContent";
import { communicationDocumentText, type CommunicationDocument } from "../lib/communicationContent";

function Editor() {
  const [value, setValue] = useState<{ body: string; document?: CommunicationDocument }>({ body: "" });
  return <><label id="communication-body-label">Messaggio</label><PlatformMessageEditor {...value} onChange={(body, document) => setValue({ body, document })} /><output aria-label="Contenuto salvato">{JSON.stringify(value)}</output></>;
}

describe("Editor comunicazioni piattaforma", () => {
  it("mantiene paragrafi e formattazione nell'anteprima condivisa senza eseguire HTML", () => {
    render(<Editor />);
    const editor = screen.getByRole("textbox", { name: "Messaggio" });
    fireEvent.input(editor, { target: { innerHTML: '<p>Buongiorno <strong>affiliate</strong> ✨</p><p><em>Nuove funzioni</em> &lt;script&gt;test&lt;/script&gt;</p><p><br></p>' } });
    expect(editor.querySelectorAll("p")).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("Stile del messaggio"), { target: { value: "news" } });
    fireEvent.click(screen.getByRole("button", { name: "Anteprima messaggio" }));
    const preview = screen.getByLabelText("Anteprima del messaggio");
    expect(within(preview).getByText("Novità della piattaforma")).toBeInTheDocument();
    expect(within(preview).getByText("affiliate").tagName).toBe("STRONG");
    expect(within(preview).getByText("Nuove funzioni").tagName).toBe("EM");
    expect(preview.querySelector("script")).toBeNull();
    expect(screen.getByLabelText("Contenuto salvato")).toHaveTextContent('"style":"news"');
    fireEvent.click(screen.getByRole("button", { name: "Torna alla scrittura" }));
    expect(editor).toHaveTextContent("Buongiorno affiliate");
  });

  it("inserisce emoji e un'immagine con descrizione, rifiutando URL eseguibili o SVG", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi emoji" }));
    fireEvent.click(screen.getByRole("button", { name: "Inserisci 📣" }));
    expect(screen.getByLabelText("Contenuto salvato")).toHaveTextContent("📣");
    fireEvent.click(screen.getByRole("button", { name: "Immagine" }));
    fireEvent.change(screen.getByLabelText("Indirizzo immagine HTTPS"), { target: { value: "https://example.com/test.svg" } });
    fireEvent.change(screen.getByLabelText("Descrizione immagine"), { target: { value: "Novità del portale" } });
    fireEvent.click(screen.getByRole("button", { name: "Inserisci immagine" }));
    expect(screen.getByRole("alert")).toHaveTextContent("PNG, JPG");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Indirizzo immagine HTTPS"), { target: { value: "https://example.com/test.png" } });
    fireEvent.click(screen.getByRole("button", { name: "Inserisci immagine" }));
    expect(screen.getByRole("img", { name: "Novità del portale" })).toHaveAttribute("src", "https://example.com/test.png");
    expect(screen.getByLabelText("Contenuto salvato")).toHaveTextContent('"type":"image"');
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("incolla solo testo, mantenendo la selezione e scartando HTML dagli appunti", () => {
    render(<Editor />);
    const editor = screen.getByRole("textbox", { name: "Messaggio" });
    fireEvent.focus(editor);
    fireEvent.paste(editor, { clipboardData: { getData: (format: string) => format === "text/plain" ? "Testo incollato" : '<img src=x onerror="alert(1)" />' } });
    expect(editor).toHaveTextContent("Testo incollato");
    expect(editor.querySelector("img")).toBeNull();
    expect(screen.getByLabelText("Contenuto salvato")).toHaveTextContent("Testo incollato");
  });

  it("durante l'anteprima server impedisce anche la modifica dell'area di scrittura", () => {
    render(<><label id="communication-body-label">Messaggio</label><PlatformMessageEditor body="Bozza" disabled onChange={() => { throw new Error("Unexpected edit"); }} /></>);
    expect(screen.getByRole("textbox", { name: "Messaggio" })).toHaveAttribute("contenteditable", "false");
    expect(screen.getByRole("button", { name: "Grassetto" })).toBeDisabled();
    expect(screen.getByLabelText("Stile del messaggio")).toBeDisabled();
  });
});

describe("Visualizzazione comunicazioni", () => {
  it("mostra stile, elenchi, link sicuri e descrizioni immagini nello stesso renderer della bozza", () => {
    const document: CommunicationDocument = { version: 1, style: "status", blocks: [
      { type: "heading", spans: [{ text: "Servizi disponibili" }] },
      { type: "bullet", spans: [{ text: "Portale", bold: true }] },
      { type: "bullet", spans: [{ text: "Assistenza", href: "mailto:help@example.com" }] },
      { type: "image", src: "https://example.com/status.png", alt: "Stato attuale" },
    ] };
    render(<CommunicationContent body={communicationDocumentText(document)} document={document} />);
    expect(screen.getByText("Stato dei servizi")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Assistenza" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("img", { name: "Stato attuale" })).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("fa fallback al testo per un documento non valido senza creare link o immagini pericolosi", () => {
    const invalid = { version: 1, style: "notice", blocks: [{ type: "paragraph", spans: [{ text: "Clicca", href: "javascript:alert(1)" }] }] } as CommunicationDocument;
    const { container } = render(<CommunicationContent body="<script>testo originale</script>" document={invalid} />);
    expect(screen.getByText("<script>testo originale</script>")).toBeInTheDocument();
    expect(container.querySelector("script,a,img")).toBeNull();
  });
});
