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

const toQrImageUrl = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized.length) return null;
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=0&data=${encodeURIComponent(normalized)}`;
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
  const cardYear = toDisplayYear(cardData.cardYear) || ASSONAM_CARD_YEAR_LABEL;
  const qrImageUrl = useMemo(() => toQrImageUrl(cardData.verificationUrl), [cardData.verificationUrl]);
  const verificationUrl = cardData.verificationUrl?.trim() ? cardData.verificationUrl.trim() : null;

  return (
    <div className={className}>
      <button
        type="button"
        className="member-card-flip group relative block w-full cursor-pointer select-none"
        onClick={() => setIsFlipped((prev) => !prev)}
        aria-pressed={isFlipped}
        aria-label="Ruota tessera"
      >
        <span className="pointer-events-none absolute right-4 top-4 z-10">
          <img
            src={ASSONAM_LOGO_SRC}
            alt="Logo ASSO.N.A.M."
            className="h-9 w-auto object-contain sm:h-11"
            loading="lazy"
          />
        </span>

        <span
          className="member-card-flip-stage"
          style={{
            aspectRatio: "1.586 / 1",
            transformStyle: "preserve-3d",
            WebkitTransformStyle: "preserve-3d",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
            WebkitTransform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          <span
            className="member-card-face member-card-face-front overflow-hidden rounded-[28px] border border-[#cfb97a]/70 bg-[#fbf7eb] shadow-[0_20px_40px_rgba(15,61,58,0.18)]"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(0deg) translateZ(1px)",
              WebkitTransform: "rotateY(0deg) translateZ(1px)",
            }}
          >
              <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,rgba(15,61,58,0.16),transparent_52%),radial-gradient(circle_at_95%_88%,rgba(198,160,79,0.26),transparent_48%)]" />
              <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.84)_0%,rgba(251,247,235,0.95)_38%,rgba(244,232,199,0.96)_100%)]" />
              <span className="pointer-events-none absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-[#0f3d3a] via-[#c6a04f] to-[#0f3d3a]" />

              <span className="relative flex h-full flex-col px-5 py-5 text-[#123a38] sm:px-7 sm:py-6">
                <span className="pr-16 text-right sm:pr-20">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#315d5a]">
                    Tessera Socio {ASSONAM_CARD_YEAR_LABEL}
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

          <span
            className="member-card-face member-card-face-back overflow-hidden rounded-[28px] border border-[#cfb97a]/70 bg-[#f7f2e3] shadow-[0_20px_40px_rgba(15,61,58,0.18)]"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg) translateZ(1px)",
              WebkitTransform: "rotateY(180deg) translateZ(1px)",
            }}
          >
              <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(18,58,56,0.06),rgba(198,160,79,0.14))]" />
              <span className="relative flex h-full flex-col items-center justify-center px-5 py-5 sm:px-7 sm:py-6">
                <span className="grid place-items-center rounded-2xl border border-[#c8b07a]/70 bg-white/90 p-3 shadow-[0_10px_20px_rgba(15,61,58,0.12)]">
                  {qrImageUrl ? (
                    <img
                      src={qrImageUrl}
                      alt="QR code per verifica tessera"
                      className="h-40 w-40 rounded-xl border border-[#e4d7b5] bg-white p-1 sm:h-44 sm:w-44"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="inline-flex h-40 w-40 items-center justify-center rounded-xl border border-dashed border-[#ccb98a] text-[0.62rem] font-medium uppercase tracking-[0.15em] text-[#8a6f34] sm:h-44 sm:w-44">
                      QR non disponibile
                    </span>
                  )}
                </span>

                <span className="mt-4 w-full max-w-[18rem] space-y-2 rounded-xl border border-[#d7c797]/70 bg-white/65 px-3 py-3 text-left">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[#5b6f6d]">
                      Numero tessera
                    </span>
                    <span className="text-xs font-semibold tracking-[0.08em] text-[#183d3b] sm:text-sm">
                      {cardNumber}
                    </span>
                  </span>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[#5b6f6d]">Nome</span>
                    <span className="truncate text-xs font-semibold text-[#183d3b] sm:text-sm">{displayName}</span>
                  </span>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[#5b6f6d]">Anno</span>
                    <span className="text-xs font-semibold text-[#183d3b] sm:text-sm">{cardYear}</span>
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
