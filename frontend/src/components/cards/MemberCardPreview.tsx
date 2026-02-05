import { useMemo, useState } from "react";
import { ASSONAM_CARD_YEAR_LABEL, ASSONAM_LOGO_SRC } from "../../lib/brand";

export type MemberCardPreviewData = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  organizationName?: string | null;
  cardNumber?: string | number | null;
  cardStatus?: string | null;
  cardYear?: string | number | null;
  verificationUrl?: string | null;
};

type MemberCardPreviewProps = {
  cardData: MemberCardPreviewData;
  className?: string;
};

const EMPTY = "";

const toSafeText = (value?: string | null): string => {
  if (!value) return EMPTY;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : EMPTY;
};

const toDisplayName = (cardData: MemberCardPreviewData): string => {
  const fullName = toSafeText(cardData.fullName);
  if (fullName !== EMPTY) return fullName;

  const firstName = toSafeText(cardData.firstName);
  const lastName = toSafeText(cardData.lastName);
  const merged = `${firstName === EMPTY ? "" : firstName} ${lastName === EMPTY ? "" : lastName}`.trim();
  return merged.length ? merged : EMPTY;
};

const toDisplayCardNumber = (value?: string | number | null): string => {
  if (value === null || value === undefined) return EMPTY;
  const raw = String(value).trim();
  return raw.length ? raw : EMPTY;
};

const toDisplayYear = (value?: string | number | null): string => {
  if (value === null || value === undefined) return EMPTY;
  const raw = String(value).trim();
  return raw.length ? raw : EMPTY;
};

const toStatusMeta = (status?: string | null): { label: string; tone: string } => {
  const normalized = (status ?? "").toLowerCase();
  const isActive = normalized === "active" || normalized === "attiva";
  if (isActive) {
    return {
      label: "Attiva",
      tone: "border-emerald-300/80 bg-emerald-50 text-emerald-700",
    };
  }
  return {
    label: "Non attiva",
    tone: "border-amber-300/80 bg-amber-50 text-amber-700",
  };
};

const toQrImageUrl = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized.length) return null;
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(normalized)}`;
};

export const isMemberCardPreviewData = (value: unknown): value is MemberCardPreviewData => {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  const stringFields = [
    "firstName",
    "lastName",
    "fullName",
    "organizationName",
    "cardStatus",
    "verificationUrl",
  ];

  const stringsOk = stringFields.every((field) => {
    const fieldValue = data[field];
    return fieldValue === undefined || fieldValue === null || typeof fieldValue === "string";
  });
  if (!stringsOk) return false;

  const cardNumber = data.cardNumber;
  const cardYear = data.cardYear;
  const cardNumberOk =
    cardNumber === undefined ||
    cardNumber === null ||
    typeof cardNumber === "string" ||
    typeof cardNumber === "number";
  const cardYearOk =
    cardYear === undefined ||
    cardYear === null ||
    typeof cardYear === "string" ||
    typeof cardYear === "number";

  return cardNumberOk && cardYearOk;
};

export const MemberCardPreview = ({ cardData, className = "" }: MemberCardPreviewProps) => {
  const [isFlipped, setIsFlipped] = useState(false);

  const displayName = toDisplayName(cardData);
  const organizationName = toSafeText(cardData.organizationName);
  const cardNumber = toDisplayCardNumber(cardData.cardNumber);
  const cardYear = toDisplayYear(cardData.cardYear);
  const statusMeta = toStatusMeta(cardData.cardStatus);
  const qrImageUrl = useMemo(() => toQrImageUrl(cardData.verificationUrl), [cardData.verificationUrl]);
  const verificationUrl = cardData.verificationUrl?.trim() ? cardData.verificationUrl.trim() : null;

  return (
    <div className={className}>
      <button
        type="button"
        className="member-card-flip group w-full cursor-pointer"
        onClick={() => setIsFlipped((prev) => !prev)}
        aria-pressed={isFlipped}
        aria-label={isFlipped ? "Mostra fronte tessera" : "Mostra retro tessera"}
      >
        <span className={`member-card-flip-inner ${isFlipped ? "is-flipped" : ""}`}>
          <span className="relative block w-full" style={{ aspectRatio: "1.586 / 1" }}>
            <span className="member-card-face absolute inset-0 overflow-hidden rounded-[28px] border border-[#cfb97a]/70 bg-[#fbf7eb] shadow-[0_20px_40px_rgba(15,61,58,0.18)]">
              <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,rgba(15,61,58,0.16),transparent_52%),radial-gradient(circle_at_95%_88%,rgba(198,160,79,0.26),transparent_48%)]" />
              <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.84)_0%,rgba(251,247,235,0.95)_38%,rgba(244,232,199,0.96)_100%)]" />
              <span className="pointer-events-none absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-[#0f3d3a] via-[#c6a04f] to-[#0f3d3a]" />

              <span className="relative flex h-full flex-col px-5 py-5 text-[#123a38] sm:px-7 sm:py-6">
                <span className="flex items-start justify-between gap-3">
                  <img
                    src={ASSONAM_LOGO_SRC}
                    alt="Logo ASSO.N.A.M."
                    className="h-10 w-auto object-contain sm:h-12"
                    loading="lazy"
                  />
                  <span className="text-right">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#315d5a]">
                      Tessera Socio {ASSONAM_CARD_YEAR_LABEL}
                    </span>
                  </span>
                </span>

                <span className="mt-5 block flex-1">
                  <span className="block text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-[#5b6f6d]">
                    Nome e cognome
                  </span>
                  <span
                    className="mt-1 block text-xl font-semibold leading-tight text-[#133331] sm:text-2xl"
                    style={{ fontFamily: "\"Source Serif 4\", serif" }}
                  >
                    {displayName}
                  </span>

                  <span className="mt-4 block text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-[#5b6f6d]">
                    Associazione
                  </span>
                  <span className="mt-1 block truncate text-sm font-semibold text-[#214745] sm:text-[0.98rem]">
                    {organizationName}
                  </span>
                </span>

                <span className="mt-4 block border-t border-[#d7c797]/70 pt-3">
                  <span className="block text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-[#5b6f6d]">
                    Numero tessera
                  </span>
                  <span className="mt-1 block text-base font-semibold tracking-[0.08em] text-[#103432] sm:text-lg">
                    {cardNumber}
                  </span>
                </span>
              </span>
            </span>

            <span className="member-card-face member-card-face-back absolute inset-0 overflow-hidden rounded-[28px] border border-[#cfb97a]/70 bg-[#f7f2e3] shadow-[0_20px_40px_rgba(15,61,58,0.18)]">
              <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(18,58,56,0.06),rgba(198,160,79,0.14))]" />
              <span className="relative flex h-full flex-col px-5 py-5 sm:px-7 sm:py-6">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#355c59]">
                    Verifica tessera
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] ${statusMeta.tone}`}
                  >
                    {statusMeta.label}
                  </span>
                </span>

                <span className="mt-4 grid flex-1 gap-4 sm:grid-cols-[1fr_auto]">
                  <span className="flex min-w-0 flex-col gap-3">
                    <span>
                      <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#5b6f6d]">
                        Stato tessera
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-[#183d3b] sm:text-base">
                        {statusMeta.label}
                      </span>
                    </span>
                    <span>
                      <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#5b6f6d]">
                        Anno validita
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-[#183d3b] sm:text-base">
                        {cardYear}
                      </span>
                    </span>
                    <span>
                      <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#5b6f6d]">
                        Associazione
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-[#183d3b] sm:text-base">
                        {organizationName}
                      </span>
                    </span>
                  </span>

                  <span className="grid place-items-center rounded-2xl border border-[#c8b07a]/70 bg-white/80 p-2 shadow-[0_10px_20px_rgba(15,61,58,0.12)]">
                    {qrImageUrl ? (
                      <img
                        src={qrImageUrl}
                        alt="QR code per verifica tessera"
                        className="h-28 w-28 rounded-lg border border-[#e4d7b5] bg-white p-1 sm:h-32 sm:w-32"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="inline-flex h-28 w-28 items-center justify-center rounded-lg border border-dashed border-[#ccb98a] text-[0.62rem] font-medium uppercase tracking-[0.15em] text-[#8a6f34] sm:h-32 sm:w-32">
                        QR non disponibile
                      </span>
                    )}
                  </span>
                </span>
              </span>
            </span>
          </span>
        </span>
      </button>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-600">
          Clicca la tessera per vedere {isFlipped ? "il fronte" : "il retro"}.
        </p>
        {verificationUrl && (
          <a
            href={verificationUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center text-xs font-semibold text-brand transition hover:text-brand-light"
          >
            Verifica endpoint
          </a>
        )}
      </div>
    </div>
  );
};

export default MemberCardPreview;
