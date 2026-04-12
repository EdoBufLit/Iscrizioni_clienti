import { useMemo, useState } from "react";
import { ASSONAM_LOGO_SRC, getCurrentCardYearLabel } from "../../lib/brand";

export type MemberCardPreviewData = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  clubDisplayName?: string | null;
  organizationSlug?: string | null;
  organizationName?: string | null;
  organizationLogoUrl?: string | null;
  cardNumber?: string | number | null;
  cardStatus?: string | null;
  cardYear?: string | number | null;
  membershipTypeLabel?: string | null;
  validUntil?: string | null;
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
    "firstName", "lastName", "fullName", "clubDisplayName",
    "organizationSlug", "organizationName", "organizationLogoUrl",
    "cardStatus", "verificationUrl", "membershipTypeLabel", "validUntil",
  ];
  const stringsOk = stringFields.every((field) => {
    const fieldValue = data[field];
    return fieldValue === undefined || fieldValue === null || typeof fieldValue === "string";
  });
  if (!stringsOk) return false;
  const cardNumber = data.cardNumber;
  const cardYear = data.cardYear;
  const cardNumberOk =
    cardNumber === undefined || cardNumber === null ||
    typeof cardNumber === "string" || typeof cardNumber === "number";
  const cardYearOk =
    cardYear === undefined || cardYear === null ||
    typeof cardYear === "string" || typeof cardYear === "number";
  return cardNumberOk && cardYearOk;
};

// ── Logo with fallback ─────────────────────────────────────────────────────────
type LogoProps = {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
};

const LogoImg = ({ src, alt, className = "", style }: LogoProps) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={`inline-flex items-center justify-center text-[0.55rem] font-bold uppercase tracking-widest text-[#c9a8b0] ${className}`}
        style={style}
      >
        {alt.slice(0, 6)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
};

export const MemberCardPreview = ({ cardData, className = "" }: MemberCardPreviewProps) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const rootClassName = className ? `w-full ${className}` : "w-full";

  const displayName = toDisplayName(cardData);
  const clubDisplayName = toSafeText(cardData.clubDisplayName);
  const organizationName = toSafeText(cardData.organizationName);
  const organizationSlug = toSafeText(cardData.organizationSlug).toLowerCase();
  const organizationLogoUrl = toSafeText(cardData.organizationLogoUrl);
  const isOasi2Card = organizationSlug === "oasi-2";
  const organizationLabel = clubDisplayName !== EMPTY ? clubDisplayName : organizationName;
  const cardNumber = toDisplayCardNumber(cardData.cardNumber);
  const cardYear = toDisplayYear(cardData.cardYear) || getCurrentCardYearLabel();
  const membershipTypeLabel = toSafeText(cardData.membershipTypeLabel).toUpperCase();
  const validUntil = toSafeText(cardData.validUntil);
  const qrImageUrl = useMemo(() => toQrImageUrl(cardData.verificationUrl), [cardData.verificationUrl]);
  const verificationUrl = cardData.verificationUrl?.trim() ? cardData.verificationUrl.trim() : null;

  // Bordeaux palette
  const frontBg = isOasi2Card ? "#3a0015" : "linear-gradient(135deg, #3a0015 0%, #5a0828 40%, #2d0015 100%)";
  const backBg  = "linear-gradient(135deg, #2a0010 0%, #450620 50%, #2d0015 100%)";
  const boxShadow = "0 24px 48px rgba(40,0,10,0.40), 0 8px 16px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.06)";

  return (
    <div className={rootClassName}>
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
              background: frontBg,
              boxShadow,
            }}
          >
            {!isOasi2Card && (
              <>
                <span
                  className="pointer-events-none absolute inset-0 opacity-[0.035]"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(0deg, transparent, transparent 8px, rgba(198,160,79,1) 8px, rgba(198,160,79,1) 9px)," +
                      "repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(198,160,79,1) 8px, rgba(198,160,79,1) 9px)",
                  }}
                />
                <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(198,160,79,0.12),transparent_55%)]" />
                <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_80%,rgba(198,160,79,0.08),transparent_50%)]" />
              </>
            )}

            {!isOasi2Card && organizationLogoUrl !== EMPTY && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <img
                  src={organizationLogoUrl}
                  alt=""
                  aria-hidden="true"
                  className="h-auto w-[55%] max-w-[240px] object-contain opacity-[0.09] sm:w-[60%] sm:max-w-[280px]"
                  loading="lazy"
                />
              </span>
            )}

            {isOasi2Card ? (
              <>
                <span className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-[#c6a04f]/75" />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[1px] bg-[#c6a04f]/60" />
              </>
            ) : (
              <>
                <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#c6a04f] to-transparent" />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-transparent via-[#c6a04f]/50 to-transparent" />
                <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-transparent via-[#c6a04f]/35 to-transparent" />
              </>
            )}

            <span className="relative flex h-full flex-col px-5 py-4 sm:px-7 sm:py-5">
              {organizationLogoUrl !== EMPTY && (
                <span
                  className={
                    isOasi2Card
                      ? "pointer-events-none absolute inset-x-0 top-3 flex justify-center"
                      : "mb-1 flex justify-center sm:mb-2"
                  }
                >
                  <span
                    className="flex items-center justify-center rounded-xl px-2 py-1"
                    style={{
                      background: "rgba(0,0,0,0.28)",
                      backdropFilter: "blur(4px)",
                      transform: isOasi2Card ? "translateX(-4px)" : undefined,
                    }}
                  >
                    <LogoImg
                      src={organizationLogoUrl}
                      alt="Logo associazione"
                      className="object-contain opacity-95"
                      style={{
                        height: isOasi2Card ? "clamp(34px, 7vw, 54px)" : "clamp(22px, 4vw, 34px)",
                        minHeight: isOasi2Card ? 34 : 22,
                        minWidth: isOasi2Card ? 120 : 50,
                        maxWidth: isOasi2Card ? 260 : 160,
                      }}
                    />
                  </span>
                </span>
              )}

              {/* Header row: year label + ASSONAM logo */}
              <span className={`flex items-start justify-between ${isOasi2Card ? "mt-14" : ""}`}>
                <span className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#c9a8b0]/80 sm:text-[11px]">
                    Tessera Socio
                  </span>
                  <span
                    className="mt-0.5 font-bold tracking-[0.06em] text-[#d4b45c]"
                    style={{ fontSize: "clamp(1rem, 4vw, 1.375rem)", fontFamily: '"Source Serif 4", serif' }}
                  >
                    {cardYear}
                  </span>
                  {membershipTypeLabel === "TEMPORANEA" ? (
                    <span className="mt-2 inline-flex w-fit items-center rounded-full border border-[#d4b45c]/40 bg-[#d4b45c]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#f6e7b6]">
                      TEMPORANEA
                    </span>
                  ) : null}
                </span>

                {/* ASSONAM logo — always visible, with contrast plate */}
                <span
                  className={`flex flex-shrink-0 items-center rounded-xl px-1.5 py-1 ${isOasi2Card ? "absolute right-5 top-4" : ""}`}
                  style={{ background: "rgba(0,0,0,0.22)", backdropFilter: "blur(4px)" }}
                >
                  <LogoImg
                    src={ASSONAM_LOGO_SRC}
                    alt="Logo ASSO.N.A.M."
                    className="object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
                    style={{
                      height: "clamp(28px, 5.5vw, 44px)",
                      minHeight: 28,
                      minWidth: 50,
                      maxWidth: 130,
                    }}
                  />
                </span>
              </span>

              {/* Main content */}
              <span className="mt-auto block">
                <span className="block text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-[#c9a8b0] sm:text-[0.62rem]">
                  Nome e cognome
                </span>
                <span
                  className="mt-1 block font-semibold leading-tight text-white"
                  style={{ fontSize: "clamp(0.9rem, 3.5vw, 1.2rem)", fontFamily: '"Source Serif 4", serif' }}
                >
                  {displayName}
                </span>

                <span className="mt-3 block text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-[#c9a8b0] sm:text-[0.62rem]">
                  Associazione
                </span>
                <span className="mt-0.5 block truncate text-sm font-medium text-[#fdf6e3]/85 sm:text-[0.95rem]">
                  {organizationLabel}
                </span>
              </span>

              {/* Card number footer */}
              <span className="mt-3 flex items-end justify-between border-t border-[#c6a04f]/20 pt-2.5">
                <span>
                  <span className="block text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-[#c9a8b0] sm:text-[0.62rem]">
                    N. Tessera
                  </span>
                  <span className="mt-0.5 block font-mono text-base font-bold tracking-[0.12em] text-[#d4b45c] sm:text-lg">
                    {cardNumber}
                  </span>
                  {validUntil ? (
                    <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-[#c9a8b0]">
                      Scade {new Date(validUntil).toLocaleDateString("it-IT")}
                    </span>
                  ) : null}
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
              background: backBg,
              boxShadow,
            }}
          >
            {/* Subtle diagonal pattern */}
            <span
              className="pointer-events-none absolute inset-0 opacity-[0.025]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(198,160,79,1) 6px, rgba(198,160,79,1) 7px)",
              }}
            />
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(198,160,79,0.06),transparent_65%)]" />

            {/* Top gold bar */}
            <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#c6a04f] to-transparent" />

            <span className="relative flex h-full flex-col items-center justify-center px-5 py-5 sm:px-7 sm:py-6">
              {/* QR Code */}
              <span
                className="grid place-items-center rounded-2xl p-3"
                style={{
                  background: "linear-gradient(145deg, rgba(255,255,255,0.96), rgba(253,246,227,0.90))",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.8)",
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
                  <span className="inline-flex h-36 w-36 items-center justify-center rounded-xl border border-dashed border-[#c9a8b0] text-[0.62rem] font-medium uppercase tracking-[0.15em] text-[#8a6f34] sm:h-40 sm:w-40">
                    QR non disponibile
                  </span>
                )}
              </span>

              {/* Info summary */}
              <span
                className="mt-4 w-full max-w-[18rem] space-y-1.5 rounded-xl px-4 py-3 text-left"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(198,160,79,0.18)",
                }}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-[#c9a8b0]">N. Tessera</span>
                  <span className="font-mono text-xs font-bold tracking-[0.08em] text-[#d4b45c] sm:text-sm">{cardNumber}</span>
                </span>
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-[#c9a8b0]">Nome</span>
                  <span className="truncate text-xs font-semibold text-[#fdf6e3]/85 sm:text-sm">{displayName}</span>
                </span>
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-[#c9a8b0]">Anno</span>
                  <span className="text-xs font-semibold text-[#d4b45c] sm:text-sm">{cardYear}</span>
                </span>
                {membershipTypeLabel ? (
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-[#c9a8b0]">Tipo</span>
                    <span className="text-xs font-semibold text-[#fdf6e3]/85 sm:text-sm">{membershipTypeLabel}</span>
                  </span>
                ) : null}
                {validUntil ? (
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-[#c9a8b0]">Scadenza</span>
                    <span className="text-xs font-semibold text-[#fdf6e3]/85 sm:text-sm">
                      {new Date(validUntil).toLocaleDateString("it-IT")}
                    </span>
                  </span>
                ) : null}
              </span>
            </span>
          </span>
        </span>
      </button>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">
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
