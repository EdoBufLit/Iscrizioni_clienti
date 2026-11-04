import type { MemberProfile } from "./api";
import { memberAccountStatus } from "./memberAccount";

const KEY = "assonam:member-card-snapshot:v2";
const IDENTITY = "assonam:member-card-identity:v2";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export type MemberSnapshot = { profile: MemberProfile; savedAt: number };

function isSnapshotCardCurrent(profile: MemberProfile): boolean {
  if (memberAccountStatus(profile) !== "active") return false;
  if (profile.membership_type === "temporary" || profile.card?.membership_type === "temporary") {
    const expiry = profile.card?.valid_until ?? profile.valid_until;
    return Boolean(expiry && Number.isFinite(Date.parse(expiry)));
  }
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(Date.now());
  const year = Number(parts.find(part => part.type === "year")?.value);
  const cardYear = Number(profile.card?.year ?? profile.card_year);
  const januaryFirst = parts.find(part => part.type === "month")?.value === "01" && parts.find(part => part.type === "day")?.value === "01";
  return cardYear === year || (januaryFirst && cardYear === year - 1);
}

export function clearMemberSnapshot() {
  try { localStorage.removeItem(KEY); localStorage.removeItem("assonam:member-profile-snapshot:v1"); sessionStorage.removeItem(IDENTITY); } catch { /* Storage may be unavailable. */ }
}

export function readMemberSnapshot(): MemberSnapshot | null {
  try {
    const snapshot = JSON.parse(localStorage.getItem(KEY) || "null") as MemberSnapshot | null;
    if (!snapshot || !Number.isFinite(snapshot.savedAt) || snapshot.savedAt > Date.now() || Date.now() - snapshot.savedAt > MAX_AGE) return null;
    if (String(snapshot.profile?.id) !== sessionStorage.getItem(IDENTITY)) return null;
    if (!isSnapshotCardCurrent(snapshot.profile)) return null;
    return snapshot;
  } catch { return null; }
}

export function saveMemberSnapshot(profile: MemberProfile) {
  clearMemberSnapshot();
  if (!isSnapshotCardCurrent(profile) || !profile.card_verification_url && !profile.card?.verification_url) return;
  // Persist only the data needed to render the card, without contact or fiscal data.
  const cardProfile: MemberProfile = {
    id: profile.id, first_name: profile.first_name, last_name: profile.last_name,
    email: "", phone: null, fiscal_code: null, joined_at: null,
    status: profile.status, card_no: profile.card_no, card_status: profile.card_status,
    card_year: profile.card_year, membership_type: profile.membership_type,
    membership_type_label: profile.membership_type_label, valid_until: profile.valid_until,
    card_verification_url: profile.card_verification_url, card: profile.card,
    organization: profile.organization,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify({ profile: cardProfile, savedAt: Date.now() }));
    sessionStorage.setItem(IDENTITY, String(profile.id));
  } catch { clearMemberSnapshot(); }
}
