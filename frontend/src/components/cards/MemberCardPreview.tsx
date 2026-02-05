import { ASSONAM_CARD_YEAR_LABEL, ASSONAM_LOGO_SRC } from "../../lib/brand";

export type MemberCardPreviewData = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  organizationName?: string | null;
  cardNumber?: string | number | null;
  joinedAt?: string | null;
  status?: string | null;
};

type MemberCardPreviewProps = {
  cardData: MemberCardPreviewData;
  className?: string;
};

const toSafeText = (value?: string | null): string => {
  if (!value) return "—";
  const trimmed = value.trim();
  return trimmed.length ? trimmed : "—";
};

const toDisplayName = (cardData: MemberCardPreviewData): string => {
  const fullName = toSafeText(cardData.fullName);
  if (fullName !== "—") return fullName;

  const firstName = toSafeText(cardData.firstName);
  const lastName = toSafeText(cardData.lastName);
  const merged = `${firstName === "—" ? "" : firstName} ${lastName === "—" ? "" : lastName}`.trim();
  return merged.length ? merged : "—";
};

const toDisplayCardNumber = (value?: string | number | null): string => {
  if (value === null || value === undefined) return "—";
  const raw = String(value).trim();
  if (!raw.length) return "—";
  return raw;
};

const formatItalianDate = (value?: string | null): string => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("it-IT");
};

const toStatusLabel = (status?: string | null): { label: string; tone: string } => {
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

export const isMemberCardPreviewData = (value: unknown): value is MemberCardPreviewData => {
  if (!value || typeof value !== "object") return false;

  const data = value as Record<string, unknown>;
  const fields = [
    "firstName",
    "lastName",
    "fullName",
    "organizationName",
    "joinedAt",
    "status",
  ];

  const stringsOk = fields.every((field) => {
    const fieldValue = data[field];
    return (
      fieldValue === undefined ||
      fieldValue === null ||
      typeof fieldValue === "string"
    );
  });

  if (!stringsOk) return false;

  const cardNumber = data.cardNumber;
  return (
    cardNumber === undefined ||
    cardNumber === null ||
    typeof cardNumber === "string" ||
    typeof cardNumber === "number"
  );
};

export const MemberCardPreview = ({ cardData, className = "" }: MemberCardPreviewProps) => {
  const displayName = toDisplayName(cardData);
  const organizationName = toSafeText(cardData.organizationName);
  const cardNumber = toDisplayCardNumber(cardData.cardNumber);
  const activatedAt = formatItalianDate(cardData.joinedAt);
  const statusMeta = toStatusLabel(cardData.status);

  return (
    <div
      className={`relative overflow-hidden rounded-[20px] border border-[#cfb97a]/70 bg-[#fbf7eb] shadow-[0_16px_30px_rgba(15,61,58,0.14)] ${className}`}
      style={{ aspectRatio: "1.586 / 1" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,rgba(15,61,58,0.14),transparent_50%),radial-gradient(circle_at_95%_88%,rgba(198,160,79,0.24),transparent_46%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.78)_0%,rgba(251,247,235,0.92)_36%,rgba(244,232,199,0.95)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[5px] bg-gradient-to-r from-[#0f3d3a] via-[#c6a04f] to-[#0f3d3a]" />

      <div className="relative flex h-full flex-col px-4 py-4 text-[#123a38] sm:px-5 sm:py-5">
        <div className="flex items-start justify-between gap-3">
          <img
            src={ASSONAM_LOGO_SRC}
            alt="ASSO.N.A.M."
            className="h-8 w-auto object-contain sm:h-9"
            loading="lazy"
          />
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0f3d3a]/85">
              ASSO.N.A.M.
            </p>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#315d5a]">
              Tessera Socio {ASSONAM_CARD_YEAR_LABEL}
            </p>
          </div>
        </div>

        <div className="mt-4 flex-1 sm:mt-5">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#5b6f6d]">
            Titolare
          </p>
          <p className="mt-1 line-clamp-2 text-lg font-semibold leading-tight text-[#133331] sm:text-xl" style={{ fontFamily: '"Source Serif 4", serif' }}>
            {displayName}
          </p>

          <p className="mt-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#5b6f6d]">
            Associazione
          </p>
          <p className="mt-1 line-clamp-1 text-sm font-medium text-[#214745] sm:text-[0.95rem]">
            {organizationName}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-[#d7c797]/70 pt-3 sm:mt-5 sm:pt-4">
          <div className="min-w-[9.5rem]">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#5b6f6d]">
              N° Tessera
            </p>
            <p className="mt-1 text-sm font-semibold tracking-[0.08em] text-[#103432] sm:text-base">
              {cardNumber}
            </p>
          </div>

          <div className="min-w-[7.5rem]">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#5b6f6d]">
              Valida
            </p>
            <p className="mt-1 text-sm font-semibold text-[#103432] sm:text-base">{ASSONAM_CARD_YEAR_LABEL}</p>
            <p className="mt-0.5 text-[0.62rem] text-[#5b6f6d]">Attivazione: {activatedAt}</p>
          </div>

          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.67rem] font-semibold uppercase tracking-[0.12em] ${statusMeta.tone}`}
          >
            {statusMeta.label}
          </span>
        </div>
      </div>
    </div>
  );
};

export default MemberCardPreview;
