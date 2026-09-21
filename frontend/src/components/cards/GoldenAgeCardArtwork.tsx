import { useLayoutEffect, useRef, useState } from "react";
import { ASSONAM_LOGO_SRC } from "../../lib/brand";

type FittedTextProps = {
  x: number; y: number; size: number; width: number; children: string;
  fill?: string; bold?: boolean; minSize?: number;
};

// SVG coordinates scale with the card itself, including in narrow desktop panels.
const FittedText = ({ x, y, size, width, children, fill = "#ffffff", bold = false, minSize = 16 }: FittedTextProps) => {
  const ref = useRef<SVGTextElement>(null);
  const [fitted, setFitted] = useState({ text: children, size });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof node.getComputedTextLength !== "function") return;
    node.textContent = children;
    node.setAttribute("font-size", String(size));
    const measured = node.getComputedTextLength();
    // Leave a few SVG units for glyph overhang and fractional font metrics.
    const targetWidth = width - 8;
    const nextSize = Math.max(minSize, Math.min(size, size * targetWidth / Math.max(measured, 1)));
    node.setAttribute("font-size", String(nextSize));
    let nextText = children;
    if (node.getComputedTextLength() > width + 0.5) {
      while (nextText.length > 1 && node.getComputedTextLength() > targetWidth) {
        nextText = nextText.slice(0, -1);
        node.textContent = `${nextText}…`;
      }
      nextText += "…";
    }
    setFitted({ text: nextText, size: nextSize });
  }, [children, size, width, minSize, bold]);
  return <text ref={ref} x={x} y={y} fontSize={fitted.size} fontWeight={bold ? 700 : 400} fill={fill}>{fitted.text}</text>;
};

type FrontProps = {
  name: string; association: string; logoUrl: string; year: string;
  number: string; status: string; membershipType: string;
};

export const GoldenAgeCardFront = ({ name, association, logoUrl, year, number, status, membershipType }: FrontProps) => {
  const active = ["active", "attiva"].includes(status.trim().toLowerCase());
  const temporary = membershipType === "TEMPORANEA";
  return (
    <svg className="golden-age-card-front absolute inset-0 h-full w-full" viewBox="0 0 856 540" preserveAspectRatio="xMidYMid meet" aria-hidden="true" fontFamily="Arial, Helvetica, sans-serif">
      <rect width="856" height="540" fill="#3a0015" />
      <path d="M0 1H856 M0 539H856" stroke="#c6a04f" strokeWidth="2" />
      {logoUrl && <image data-card-logo="golden-age" href={logoUrl} x="260" y="14" width="336" height="224" preserveAspectRatio="xMidYMid meet" />}
      <image href={ASSONAM_LOGO_SRC} x="688" y="14" width="150" height="72" preserveAspectRatio="xMidYMid meet" />
      <text x="28" y="45" fontSize="18" fontWeight="700" fill="#c6a04f">TESSERA SOCIO</text>
      <text x="28" y="108" fontSize="60" fontWeight="700" fill="#d4b45c">{year}</text>
      {temporary && <text x="28" y="137" fontSize="18" fontWeight="700" fill="#fdf6e3">TEMPORANEA</text>}
      <text x="28" y={temporary ? 169 : 145} fontSize="20" fontWeight="700" fill={active ? "#4ade80" : "#f87171"}>{active ? "ATTIVA" : "NON ATTIVA"}</text>
      <text x="28" y="278" fontSize="17" fontWeight="700" fill="#c9a8b0">NOME E COGNOME</text>
      <FittedText x={28} y={326} size={44} width={800} bold>{name}</FittedText>
      <text x="28" y="358" fontSize="17" fontWeight="700" fill="#c9a8b0">ASSOCIAZIONE</text>
      <FittedText x={28} y={390} size={28} minSize={14} width={800} fill="#fdf6e3">{association}</FittedText>
      <path d="M20 429H836" stroke="#c6a04f" strokeOpacity="0.3" />
      <text x="28" y="455" fontSize="17" fontWeight="700" fill="#c9a8b0">N. TESSERA</text>
      <FittedText x={28} y={502} size={44} width={650} fill="#d4b45c" bold>{number}</FittedText>
      <rect x="772" y="468" width="68" height="46" rx="6" fill="#c6a04f" />
      <path d="M776 491H836 M784 473V509 M794 473V509 M804 473V509 M814 473V509 M824 473V509" stroke="#d4b45c" strokeWidth="4" />
    </svg>
  );
};

type BackProps = { name: string; number: string; year: string; qrUrl: string | null; membershipType: string; validUntil: string };

export const GoldenAgeCardBack = ({ name, number, year, qrUrl, membershipType, validUntil }: BackProps) => (
  <svg className="golden-age-card-back absolute inset-0 h-full w-full" viewBox="0 0 856 540" preserveAspectRatio="xMidYMid meet" aria-hidden="true" fontFamily="Arial, Helvetica, sans-serif">
    <rect width="856" height="540" fill="#2a0010" />
    <path d="M0 2H856" stroke="#c6a04f" strokeWidth="3" />
    <rect x="264" y="38" width="328" height="328" rx="18" fill="#ffffff" />
    {qrUrl ? <image href={qrUrl} x="278" y="52" width="300" height="300" preserveAspectRatio="xMidYMid meet" /> : <text x="428" y="205" textAnchor="middle" fontSize="23" fill="#574019">QR non disponibile</text>}
    <FittedText x={46} y={411} size={26} width={764} bold>{name}</FittedText>
    <text x="46" y="452" fontSize="22" fill="#d4b45c" fontWeight="700">N. {number} · {year}</text>
    <FittedText x={46} y={491} size={19} width={764} fill="#c9a8b0">{[membershipType, validUntil ? `Scade ${new Date(validUntil).toLocaleDateString("it-IT")}` : ""].filter(Boolean).join(" · ")}</FittedText>
  </svg>
);
