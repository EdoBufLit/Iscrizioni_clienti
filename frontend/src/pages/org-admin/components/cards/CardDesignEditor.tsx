import { useId, useState, type FormEvent } from "react";
import { MemberCardPreview } from "../../../../components/cards/MemberCardPreview";
import type { OrgAdminCardStyle } from "../../../../lib/api";
import "./CardDesignEditor.css";

type CardDesignEditorProps = {
  style: OrgAdminCardStyle;
  logoUrl?: string | null;
  orgName?: string | null;
  orgSlug?: string | null;
  locked: boolean;
  saving: boolean;
  error?: string;
  onChange: <K extends keyof OrgAdminCardStyle>(key: K, value: OrgAdminCardStyle[K]) => void;
  onLogoFileChange: (file: File | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const colorFields = [
  ["primary_color", "Sfondo"],
  ["secondary_color", "Sfumatura"],
  ["accent_color", "Oro"],
  ["muted_text_color", "Etichette"],
] as const;

function CardDesignPreview({ style, logoUrl, orgName, side, year }: {
  style: OrgAdminCardStyle; logoUrl?: string | null; orgName?: string | null; side: "front" | "back"; year: string;
}) {
  const pattern = style.surface_pattern === "none" ? "none"
    : style.surface_pattern === "soft" ? "radial-gradient(circle at 70% 18%, rgba(212,180,92,.15), transparent 26rem)"
      : "linear-gradient(135deg, rgba(212,180,92,.12) 1px, transparent 1px), linear-gradient(45deg, rgba(212,180,92,.08) 1px, transparent 1px)";
  return <div className="card-builder-preview" data-card-branding="builder" data-card-side={side} style={{
    color: style.text_color,
    background: `radial-gradient(circle at 82% 82%, ${style.accent_color}24, transparent 18rem), linear-gradient(135deg, ${style.primary_color}, ${style.secondary_color})`,
  }}>
    <span className="card-builder-preview__pattern" style={{ backgroundImage: pattern }} />
    {logoUrl && style.logo_mode !== "none" && <img src={logoUrl} alt="" className={`card-builder-preview__org-logo card-builder-preview__org-logo--${style.logo_position}`} style={{ opacity: style.logo_mode === "watermark" ? style.logo_opacity : .96, mixBlendMode: style.logo_blend === "multiply" ? "multiply" : style.logo_blend === "soft" ? "soft-light" : "normal" }} />}
    <span className="card-builder-preview__assonam">ASSONAM</span>
    {side === "front" ? <>
      <div className="card-builder-preview__year"><span style={{ color: style.muted_text_color }}>TESSERA SOCIO</span><strong style={{ color: style.accent_color }}>{year}</strong><em>ATTIVA</em></div>
      <div className="card-builder-preview__identity"><span style={{ color: style.muted_text_color }}>NOME E COGNOME</span><strong>Mario Rossi</strong><span style={{ color: style.muted_text_color }}>ASSOCIAZIONE</span><p>{orgName || "Associazione"}</p></div>
      <div className="card-builder-preview__footer"><span style={{ color: style.muted_text_color }}>N. TESSERA</span><strong style={{ color: style.accent_color }}>12345</strong></div>
      <span className="card-builder-preview__chip" />
    </> : <>
      <div className="card-builder-preview__back-copy"><span style={{ color: style.muted_text_color }}>{style.back_title}</span>{style.back_body.trim() && <p>{style.back_body}</p>}</div>
      <div className="card-builder-preview__qr" aria-label="Spazio riservato al codice QR">QR</div>
      {style.back_show_member && <div className="card-builder-preview__back-data"><span>N. Tessera <strong>12345</strong></span><span>Anno <strong>{year}</strong></span><span>Stato <strong>Attiva</strong></span></div>}
    </>}
  </div>;
}

export default function CardDesignEditor({ style, logoUrl, orgName, orgSlug, locked, saving, error, onChange, onLogoFileChange, onSubmit }: CardDesignEditorProps) {
  const [flipped, setFlipped] = useState(false);
  const id = useId();
  const disabled = locked || saving;
  const year = new Intl.DateTimeFormat("en", { timeZone: "Europe/Rome", year: "numeric" }).format(new Date());
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!disabled) onSubmit(event);
  };
  return <form className="card-design-editor" aria-label="Design tessera" onSubmit={handleSubmit}>
    {locked && <p className="card-design-editor__notice">Il design dedicato di questa associazione è gestito da ASSONAM.</p>}
    <div className="card-design-editor__preview">
      {locked ? <MemberCardPreview flipped={flipped} onFlippedChange={setFlipped} cardData={{ fullName: "Mario Rossi", organizationName: orgName, organizationSlug: orgSlug, organizationLogoUrl: logoUrl, cardNumber: "12345", cardYear: year, cardStatus: "attiva", membershipTypeLabel: "Annuale" }} /> :
        <div id={`${id}-preview`} className="card-design-editor__flip" role="img" aria-label={`Anteprima tessera: ${flipped ? "retro" : "fronte"}`}>
          <div className="card-design-editor__stage" data-flipped={flipped}>
            <div className="card-design-editor__face" aria-hidden={flipped}><CardDesignPreview style={style} logoUrl={logoUrl} orgName={orgName} side="front" year={year} /></div>
            <div className="card-design-editor__face card-design-editor__face--back" aria-hidden={!flipped}><CardDesignPreview style={style} logoUrl={logoUrl} orgName={orgName} side="back" year={year} /></div>
          </div>
        </div>}
      <button type="button" className="btn-ghost card-design-editor__flip-action" onClick={() => setFlipped(current => !current)} aria-pressed={flipped} aria-controls={locked ? undefined : `${id}-preview`} disabled={saving}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7h-9M20 7l-4-4m4 4l-4 4M4 17h9M4 17l4-4m-4 4l4 4" /></svg>
        {flipped ? "Gira sul fronte" : "Gira sul retro"}
      </button>
    </div>
    <fieldset className="card-design-editor__fields" disabled={disabled}>
      <legend className="sr-only">Personalizzazione tessera</legend>
      <div className="card-design-editor__colors">
        {colorFields.map(([key, label]) => <label key={key} htmlFor={`${id}-${key}`} className="card-design-editor__color"><input id={`${id}-${key}`} type="color" value={style[key]} onChange={event => onChange(key, event.target.value)} /><span>{label}</span></label>)}
      </div>
      <details className="card-design-editor__advanced">
        <summary>Personalizzazione avanzata: retro e logo</summary>
        <div className="card-design-editor__advanced-fields">
          <label className="card-builder-upload" htmlFor={`${id}-logo`}><span>Logo associazione</span><input id={`${id}-logo`} type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={event => onLogoFileChange(event.target.files?.[0] ?? null)} /></label>
          <div className="card-design-editor__options">
            <label>Uso logo<select className="premium-select" value={style.logo_mode} onChange={event => onChange("logo_mode", event.target.value as OrgAdminCardStyle["logo_mode"])}><option value="watermark">Soffuso sullo sfondo</option><option value="visible">Ben visibile</option><option value="both">Visibile + soffuso</option><option value="none">Non mostrare</option></select></label>
            <label>Posizione<select className="premium-select" value={style.logo_position} onChange={event => onChange("logo_position", event.target.value as OrgAdminCardStyle["logo_position"])}><option value="top-right">Alto destra</option><option value="top-left">Alto sinistra</option><option value="center">Centro</option><option value="bottom-left">Basso sinistra</option><option value="bottom-right">Basso destra</option></select></label>
          </div>
          <label className="card-design-editor__range">Intensità logo soffuso<input type="range" min="0" max="0.6" step="0.01" value={style.logo_opacity} onChange={event => onChange("logo_opacity", Number(event.target.value))} /></label>
          <label className="card-design-editor__check"><input type="checkbox" checked={style.remove_logo_background} onChange={event => onChange("remove_logo_background", event.target.checked)} />Rimuovi sfondo chiaro dal logo al caricamento</label>
          <label className="card-design-editor__check"><input type="checkbox" checked={style.back_show_member} onChange={event => onChange("back_show_member", event.target.checked)} />Mostra dati socio sul retro</label>
          <label className="card-design-editor__text">Titolo retro<input value={style.back_title} onChange={event => onChange("back_title", event.target.value)} maxLength={80} /></label>
          <label className="card-design-editor__text">Testo retro<textarea value={style.back_body} onChange={event => onChange("back_body", event.target.value)} rows={3} maxLength={220} /></label>
        </div>
      </details>
      {error && <p role="alert" className="text-sm text-[var(--theme-danger)]">{error}</p>}
      <button type="submit" className="btn-primary card-design-editor__save" disabled={disabled}>{saving ? "Salvataggio…" : "Salva design tessera"}</button>
    </fieldset>
  </form>;
}
