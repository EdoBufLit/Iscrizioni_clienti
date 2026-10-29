import { useState, type FormEvent } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberCardPreview } from "../../../../components/cards/MemberCardPreview";
import type { OrgAdminCardStyle } from "../../../../lib/api";
import CardDesignEditor from "./CardDesignEditor";

const design: OrgAdminCardStyle = {
  primary_color: "#5a001f", secondary_color: "#2a0010", accent_color: "#d4b45c", text_color: "#ffffff", muted_text_color: "#f5d66d",
  font_family: "classic", surface_pattern: "geometric", logo_mode: "watermark", logo_position: "top-right", logo_opacity: .18, logo_blend: "normal",
  remove_logo_background: false, back_title: "Verifica tessera", back_body: "", back_show_member: true,
};

function Harness({ submit = vi.fn() }: { submit?: (event: FormEvent<HTMLFormElement>) => void }) {
  const [style, setStyle] = useState(design);
  return <CardDesignEditor style={style} orgName="Club Futura" locked={false} saving={false} onChange={(key, value) => setStyle(current => ({ ...current, [key]: value }))} onLogoFileChange={vi.fn()} onSubmit={submit} />;
}

describe("Compact card design editor", () => {
  it("shows one preview at a time and keeps advanced controls collapsed", () => {
    const { container } = render(<Harness />);
    expect(screen.getByRole("img", { name: "Anteprima tessera: fronte" })).toBeInTheDocument();
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(container.querySelectorAll('input[type="color"]')).toHaveLength(4);
    expect(screen.getByLabelText("Sfondo")).toHaveValue("#5a001f");
    fireEvent.click(screen.getByRole("button", { name: "Gira sul retro" }));
    expect(screen.getByRole("img", { name: "Anteprima tessera: retro" })).toBeInTheDocument();
    expect(container.querySelector('.card-design-editor__face:not(.card-design-editor__face--back)')).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(screen.getByRole("button", { name: "Gira sul fronte" }));
    expect(screen.getByRole("img", { name: "Anteprima tessera: fronte" })).toBeInTheDocument();
  });

  it("retains edited colors and reverse copy across flips without saving implicitly", () => {
    const submit = vi.fn();
    const { container } = render(<Harness submit={submit} />);
    fireEvent.change(screen.getByLabelText("Sfondo"), { target: { value: "#112233" } });
    fireEvent.click(screen.getByText("Personalizzazione avanzata: retro e logo"));
    fireEvent.change(screen.getByLabelText("Testo retro"), { target: { value: "Accesso riservato ai soci" } });
    fireEvent.click(screen.getByRole("button", { name: "Gira sul retro" }));
    expect(screen.getByLabelText("Sfondo")).toHaveValue("#112233");
    expect(container.querySelector('.card-design-editor__face--back .card-builder-preview__back-copy p')).toHaveTextContent("Accesso riservato ai soci");
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salva design tessera" }));
    expect(submit).toHaveBeenCalledOnce();
  });

  it("previews the reverse member-data checkbox accurately", () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByText("Personalizzazione avanzata: retro e logo"));
    expect(container.querySelector(".card-builder-preview__back-data")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Mostra dati socio sul retro"));
    expect(container.querySelector(".card-builder-preview__back-data")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Titolo retro")).toHaveAttribute("maxlength", "80");
    expect(screen.getByLabelText("Testo retro")).toHaveAttribute("maxlength", "220");
  });

  it("preserves the dedicated artwork, blocks edits and keeps both flip controls synchronized", () => {
    const submit = vi.fn();
    const { container } = render(<CardDesignEditor style={design} logoUrl="/golden-age.png" orgName="Golden Age Club" orgSlug="oasi-2" locked saving={false} onChange={vi.fn()} onLogoFileChange={vi.fn()} onSubmit={submit} />);
    expect(container.querySelector('[data-card-logo="golden-age"]')).toHaveAttribute("href", "/golden-age.png");
    expect(screen.getByLabelText("Sfondo")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salva design tessera" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Gira sul retro" }));
    expect(screen.getByRole("button", { name: "Mostra il fronte della tessera" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Mostra il fronte della tessera" }));
    expect(screen.getByRole("button", { name: "Gira sul retro" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.submit(screen.getByRole("form", { name: "Design tessera" }));
    expect(submit).not.toHaveBeenCalled();
  });

  it("keeps logo selection explicit and locks the form while saving", () => {
    const onLogoFileChange = vi.fn();
    const onSubmit = vi.fn();
    const props = { style: design, locked: false, saving: false, onChange: vi.fn(), onLogoFileChange, onSubmit };
    const { rerender } = render(<CardDesignEditor {...props} />);
    fireEvent.click(screen.getByText("Personalizzazione avanzata: retro e logo"));
    const file = new File(["image"], "club.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Logo associazione"), { target: { files: [file] } });
    expect(onLogoFileChange).toHaveBeenCalledExactlyOnceWith(file);
    expect(onSubmit).not.toHaveBeenCalled();
    rerender(<CardDesignEditor {...props} saving />);
    expect(screen.getByLabelText("Logo associazione")).toBeDisabled();
    expect(screen.getByLabelText("Testo retro")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Gira sul retro" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form", { name: "Design tessera" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("supports controlled preview state without changing its default flip behavior", () => {
    const onFlippedChange = vi.fn();
    const data = { fullName: "Mario Rossi", cardYear: 2026 };
    const { rerender } = render(<MemberCardPreview cardData={data} flipped={false} onFlippedChange={onFlippedChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Mostra il retro e il codice QR della tessera" }));
    expect(onFlippedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: "Mostra il retro e il codice QR della tessera" })).toHaveAttribute("aria-pressed", "false");
    rerender(<MemberCardPreview cardData={data} flipped onFlippedChange={onFlippedChange} />);
    expect(screen.getByRole("button", { name: "Mostra il fronte della tessera" })).toHaveAttribute("aria-pressed", "true");
    rerender(<MemberCardPreview cardData={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Mostra il retro e il codice QR della tessera" }));
    expect(screen.getByRole("button", { name: "Mostra il fronte della tessera" })).toHaveAttribute("aria-pressed", "true");
  });
});
