import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import "./EnrollmentQrPanel.css";

export type EnrollmentQr = {
  organization_name: string;
  organization_slug: string;
  enrollment_url: string;
  qr_data_uri: string;
};

const escapeXml = (value: string) => value.replace(/[<>&"']/g, (char) => ({
  "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
}[char]!));

export function buildEnrollmentPoster(data: EnrollmentQr): string {
  // Wrap even unbroken names; preserve the full association name in the export.
  const lines = data.organization_name.match(/.{1,25}(?:\s|$)|.{1,25}/gu)?.map((line) => line.trim()) || ["Associazione"];
  const qrY = 300 + lines.length * 64;
  const height = qrY + 860;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}">
    <rect width="1200" height="${height}" fill="#f0f5f3"/>
    <rect x="48" y="48" width="1104" height="${height - 96}" rx="40" fill="#ffffff"/>
    <rect x="96" y="110" width="112" height="10" rx="5" fill="#0f5c50"/>
    <g font-family="Arial, Helvetica, sans-serif" text-anchor="middle">
      <text x="600" y="180" fill="#52665f" font-size="24" letter-spacing="5">ENTRA A FAR PARTE DEL CLUB</text>
      <text x="600" y="270" fill="#0f5c50" font-size="54" font-weight="700">Iscriviti ora a</text>
      ${lines.map((line, index) => `<text x="600" y="${346 + index * 64}" fill="#142f28" font-size="${Math.min(54, Math.floor(1008 / line.length))}" font-weight="700">${escapeXml(line)}</text>`).join("")}
      <image x="240" y="${qrY}" width="720" height="720" href="${escapeXml(data.qr_data_uri)}"/>
      <text x="600" y="${qrY + 760}" fill="#142f28" font-size="30" font-weight="700">Inquadra il QR e completa l'iscrizione</text>
      <text x="600" y="${qrY + 810}" fill="#52665f" font-size="23">Con la fotocamera del tuo smartphone</text>
    </g>
  </svg>`;
}

function download(href: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export default function EnrollmentQrPanel({ endpoint }: { endpoint: string }) {
  const [data, setData] = useState<EnrollmentQr | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    setNotice("");
    apiFetch(endpoint, { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403
          ? "Sessione scaduta o accesso non consentito. Accedi nuovamente."
          : "Impossibile creare il QR. Riprova tra poco.");
        return response.json() as Promise<EnrollmentQr>;
      })
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Impossibile creare il QR.");
      });
    return () => controller.abort();
  }, [endpoint, attempt]);

  const poster = data ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildEnrollmentPoster(data))}` : "";
  const exportPoster = async () => {
    if (!data) return;
    setExporting(true);
    setNotice("");
    try {
      const picture = new Image();
      await new Promise<void>((resolve, reject) => {
        picture.onload = () => resolve();
        picture.onerror = () => reject(new Error("image"));
        picture.src = poster;
      });
      const canvas = document.createElement("canvas");
      canvas.width = picture.naturalWidth;
      canvas.height = picture.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas");
      context.drawImage(picture, 0, 0);
      download(canvas.toDataURL("image/png"), `iscriviti-${data.organization_slug}.png`);
      setNotice("Locandina scaricata.");
    } catch {
      setNotice("Download non riuscito. Riprova oppure scarica il solo QR.");
    } finally { setExporting(false); }
  };

  return (
    <section className="enrollment-qr" aria-label="QR iscrizione">
      <div className="enrollment-qr__intro">
        <span className="enrollment-qr__eyebrow">Invita nuovi soci</span>
        <h2>Il tuo club, a portata di QR</h2>
        <p>Condividi il link di iscrizione online o esponi la locandina nella tua associazione. Basta inquadrare il codice per iniziare.</p>
      </div>
      {error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Riprova</button></div>
        : !data ? <p role="status">Creazione QR in corso...</p>
        : <div className="enrollment-qr__grid">
          <div className="enrollment-qr__preview"><img src={poster} alt={`Locandina: Iscriviti ora a ${data.organization_name}`} /></div>
          <div className="enrollment-qr__controls">
            <h3>Pronto da condividere</h3>
            <p>La locandina include nome del club, invito e QR. Il solo codice è ideale per i tuoi materiali grafici.</p>
            <label htmlFor="enrollment-qr-link">Link di iscrizione</label>
            <input id="enrollment-qr-link" readOnly value={data.enrollment_url} onFocus={(event) => event.currentTarget.select()} />
            <button type="button" onClick={async () => {
              try { await navigator.clipboard.writeText(data.enrollment_url); setNotice("Link copiato."); }
              catch { setNotice("Copia non disponibile: seleziona e copia il link dal campo."); }
            }}>Copia link</button>
            <div className="enrollment-qr__downloads">
              <button className="enrollment-qr__primary" type="button" disabled={exporting} onClick={exportPoster}>{exporting ? "Preparazione..." : "Scarica locandina PNG"}</button>
              <button type="button" onClick={() => download(data.qr_data_uri, `qr-iscrizione-${data.organization_slug}.png`)}>Scarica solo QR</button>
            </div>
            <p className="enrollment-qr__hint">PNG ad alta risoluzione, pronto per social e stampa. Il codice apre sempre la pagina di iscrizione del club.</p>
            <p role="status" aria-live="polite">{notice}</p>
          </div>
        </div>}
    </section>
  );
}
