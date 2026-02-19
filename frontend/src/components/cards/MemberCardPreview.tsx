import { useMemo, useState } from "react";
import { ASSONAM_LOGO_SRC, getCurrentCardYearLabel } from "../../lib/brand";

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
  const cardYear = toDisplayYear(cardData.cardYear) || getCurrentCardYearLabel();
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
          {/* ─── FRONT FACE ─── */}
          <span
            className="member-card-face member-card-face-front overflow-hidden rounded-[20px] sm:rounded-[24px]"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(0deg) translateZ(1px)",
              WebkitTransform: "rotateY(0deg) translateZ(1px)",
              background: "linear-gradient(135deg, #0b2e2c 0%, #143f3c 40%, #1a4f4b 70%, #0f3a37 100%)",
              boxShadow: "0 24px 48px rgba(10,40,38,0.35), 0 8px 16px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            {/* Guilloche-style decorative pattern overlay */}
            <span
              className="pointer-events-none absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, transparent, transparent 8px, rgba(198,160,79,1) 8px, rgba(198,160,79,1) 9px)," +
                  "repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(198,160,79,1) 8px, rgba(198,160,79,1) 9px)",
              }}
            />
            {/* Radial light accent */}
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(198,160,79,0.15),transparent_55%)]" />
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_80%,rgba(198,160,79,0.10),transparent_50%)]" />

            {/* Top gold accent bar */}
            <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#c6a04f] to-transparent" />
            {/* Bottom gold accent bar */}
            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-transparent via-[#c6a04f]/60 to-transparent" />

            {/* Left gold vertical accent */}
            <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-transparent via-[#c6a04f]/40 to-transparent" />

            <span className="relative flex h-full flex-col px-5 py-4 sm:px-7 sm:py-5">
              {/* Header row: year label + logo */}
              <span className="flex items-start justify-between">
                <span className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#c6a04f]/80 sm:text-[11px]">
                    Tessera Socio
                  </span>
                  <span className="mt-0.5 text-[18px] font-bold tracking-[0.06em] text-[#d4b45c] sm:text-[22px]" style={{ fontFamily: '"Source Serif 4", serif' }}>
                    {cardYear}
                  </span>
                </span>
                <span className="flex-shrink-0">
                  <img
                    src={ASSONAM_LOGO_SRC}
                    alt="Logo ASSO.N.A.M."
                    className="h-10 w-auto object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] sm:h-12"
                    loading="lazy"
                  />
                </span>
              </span>

              {/* Main content area */}
              <span className="mt-auto block">
                {/* Name */}
                <span className="block text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-[#8aaba8] sm:text-[0.62rem]">
                  Nome e cognome
                </span>
                <span
                  className="mt-1 block text-lg font-semibold leading-tight text-white sm:text-xl"
                  style={{ fontFamily: '"Source Serif 4", serif' }}
                >
                  {displayName}
                </span>

                {/* Org */}
                <span className="mt-3 block text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-[#8aaba8] sm:text-[0.62rem]">
                  Associazione
                </span>
                <span className="mt-0.5 block truncate text-sm font-medium text-[#c6d8d6] sm:text-[0.95rem]">
                  {organizationName}
                </span>
              </span>

              {/* Card number footer */}
              <span className="mt-3 flex items-end justify-between border-t border-[#c6a04f]/25 pt-2.5">
                <span>
                  <span className="block text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-[#8aaba8] sm:text-[0.62rem]">
                    N. Tessera
                  </span>
                  <span className="mt-0.5 block font-mono text-base font-bold tracking-[0.12em] text-[#d4b45c] sm:text-lg">
                    {cardNumber}
                  </span>
                </span>
                {/* Decorative gold chip */}
                <span className="mb-0.5 flex-shrink-0">
                  <span
                    className="inline-block h-7 w-10 rounded-md sm:h-8 sm:w-11"
                    style={{
                      background: "linear-gradient(145deg, #d4b45c 0%, #a8883a 50%, #d4b45c 100%)",
                      boxShadow: "inset 0 1px 2px rgba(255,255,255,0.3), inset 0 -1px 2px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.2)",
                    }}
                  >
                    <span className="block h-full w-full rounded-md opacity-30" style={{
                      backgroundImage: "repeating-linear-gradient(90deg, transparent 0px, transparent 2px, rgba(255,255,255,0.3) 2px, rgba(255,255,255,0.3) 3px)",
                    }} />
                  </span>
                </span>
              </span>
            </span>
          </span>

          {/* ─── BACK FACE ─── */}
          <span
            className="member-card-face member-card-face-back overflow-hidden rounded-[20px] sm:rounded-[24px]"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg) translateZ(1px)",
              WebkitTransform: "rotateY(180deg) translateZ(1px)",
              background: "linear-gradient(135deg, #0d3330 0%, #164542 50%, #0f3a37 100%)",
              boxShadow: "0 24px 48px rgba(10,40,38,0.35), 0 8px 16px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            {/* Subtle pattern */}
            <span
              className="pointer-events-none absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(198,160,79,1) 6px, rgba(198,160,79,1) 7px)",
              }}
            />
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(198,160,79,0.08),transparent_65%)]" />

            {/* Top gold bar */}
            <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#c6a04f] to-transparent" />

            <span className="relative flex h-full flex-col items-center justify-center px-5 py-5 sm:px-7 sm:py-6">
              {/* QR Code area */}
              <span
                className="grid place-items-center rounded-2xl p-3"
                style={{
                  background: "linear-gradient(145deg, rgba(255,255,255,0.95), rgba(251,247,235,0.9))",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.8)",
                }}
              >
                {qrImageUrl ? (
                  <img
                    src={qrImageUrl}
                    alt="QR code per verifica tessera"
                    className="h-36 w-36 rounded-xl bg-white p-1.5 sm:h-40 sm:w-40"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="inline-flex h-36 w-36 items-center justify-center rounded-xl border border-dashed border-[#ccb98a] text-[0.62rem] font-medium uppercase tracking-[0.15em] text-[#8a6f34] sm:h-40 sm:w-40">
                    QR non disponibile
                  </span>
                )}
              </span>

              {/* Info summary on back */}
              <span
                className="mt-4 w-full max-w-[18rem] space-y-1.5 rounded-xl px-4 py-3 text-left"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(198,160,79,0.2)",
                }}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-[#8aaba8]">
                    N. Tessera
                  </span>
                  <span className="font-mono text-xs font-bold tracking-[0.08em] text-[#d4b45c] sm:text-sm">
                    {cardNumber}
                  </span>
                </span>
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-[#8aaba8]">Nome</span>
                  <span className="truncate text-xs font-semibold text-[#c6d8d6] sm:text-sm">{displayName}</span>
                </span>
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-[#8aaba8]">Anno</span>
                  <span className="text-xs font-semibold text-[#d4b45c] sm:text-sm">{cardYear}</span>
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
