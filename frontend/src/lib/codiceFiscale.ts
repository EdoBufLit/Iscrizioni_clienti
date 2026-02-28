const MONTH_CODES = ["A", "B", "C", "D", "E", "H", "L", "M", "P", "R", "S", "T"] as const;
const VOWELS = new Set(["A", "E", "I", "O", "U"]);
const FORMAL_PATTERN =
  /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;
const OMOCODIA_DECODE: Record<string, string> = {
  L: "0",
  M: "1",
  N: "2",
  P: "3",
  Q: "4",
  R: "5",
  S: "6",
  T: "7",
  U: "8",
  V: "9",
};
const OMOCODIA_POSITIONS = new Set([6, 7, 9, 10, 12, 13, 14]);
const ODD_VALUES: Record<string, number> = {
  "0": 1,
  "1": 0,
  "2": 5,
  "3": 7,
  "4": 9,
  "5": 13,
  "6": 15,
  "7": 17,
  "8": 19,
  "9": 21,
  A: 1,
  B: 0,
  C: 5,
  D: 7,
  E: 9,
  F: 13,
  G: 15,
  H: 17,
  I: 19,
  J: 21,
  K: 2,
  L: 4,
  M: 18,
  N: 20,
  O: 11,
  P: 3,
  Q: 6,
  R: 8,
  S: 12,
  T: 14,
  U: 16,
  V: 10,
  W: 22,
  X: 25,
  Y: 24,
  Z: 23,
};
const EVEN_VALUES: Record<string, number> = Object.fromEntries([
  ...Array.from({ length: 10 }, (_, index) => [String(index), index]),
  ...Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ").map((char, index) => [char, index]),
]);
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export type CodiceFiscaleValidation = {
  normalized: string;
  canonical: string | null;
  expected: string | null;
  isFormallyValid: boolean;
  matchesExpected: boolean | null;
};

function normalizeLetters(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

export function normalizeCodiceFiscale(value: string): string {
  return value.replace(/\s+/g, "").trim().toUpperCase();
}

export function normalizeMunicipalityLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function encodeNamePart(value: string, isFirstName: boolean): string {
  const letters = normalizeLetters(value);
  const consonants = Array.from(letters).filter((char) => !VOWELS.has(char));
  const vowels = Array.from(letters).filter((char) => VOWELS.has(char));
  const selected =
    isFirstName && consonants.length >= 4
      ? [consonants[0], consonants[2], consonants[3]]
      : consonants.slice(0, 3);
  return [...selected, ...vowels, "X", "X", "X"].slice(0, 3).join("");
}

function checksumChar(firstFifteen: string): string {
  let total = 0;
  for (let index = 0; index < firstFifteen.length; index += 1) {
    const char = firstFifteen[index]!;
    total += (index + 1) % 2 === 0 ? EVEN_VALUES[char] : ODD_VALUES[char];
  }
  return ALPHABET[total % 26] ?? "X";
}

export function calculateCodiceFiscale(input: {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: "M" | "F";
  birthPlaceCode: string;
}): string {
  const date = new Date(`${input.birthDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid birth date");
  }

  const surnameCode = encodeNamePart(input.lastName, false);
  const nameCode = encodeNamePart(input.firstName, true);
  const yearCode = String(date.getFullYear() % 100).padStart(2, "0");
  const monthCode = MONTH_CODES[date.getMonth()];
  const day = date.getDate() + (input.gender === "F" ? 40 : 0);
  const birthPlaceCode = normalizeCodiceFiscale(input.birthPlaceCode);
  const partial = `${surnameCode}${nameCode}${yearCode}${monthCode}${String(day).padStart(2, "0")}${birthPlaceCode}`;
  return `${partial}${checksumChar(partial)}`;
}

export function canonicalizeCodiceFiscale(value: string): string | null {
  const normalized = normalizeCodiceFiscale(value);
  if (normalized.length !== 16) {
    return null;
  }

  const chars = normalized.slice(0, 15).split("");
  for (let index = 0; index < chars.length; index += 1) {
    if (!OMOCODIA_POSITIONS.has(index)) {
      continue;
    }
    const char = chars[index]!;
    if (/^[0-9]$/.test(char)) {
      continue;
    }
    const decoded = OMOCODIA_DECODE[char];
    if (!decoded) {
      return null;
    }
    chars[index] = decoded;
  }

  const canonicalFirstFifteen = chars.join("");
  return `${canonicalFirstFifteen}${checksumChar(canonicalFirstFifteen)}`;
}

export function isFormallyValidCodiceFiscale(value: string): boolean {
  const normalized = normalizeCodiceFiscale(value);
  return FORMAL_PATTERN.test(normalized) && normalized.slice(-1) === checksumChar(normalized.slice(0, 15));
}

export function validateCodiceFiscale(input: {
  fiscalCode: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  gender?: "M" | "F" | "";
  birthPlaceCode?: string;
}): CodiceFiscaleValidation {
  const normalized = normalizeCodiceFiscale(input.fiscalCode);
  const isFormallyValid = isFormallyValidCodiceFiscale(normalized);
  const canonical = isFormallyValid ? canonicalizeCodiceFiscale(normalized) : null;

  let expected: string | null = null;
  if (
    input.firstName?.trim() &&
    input.lastName?.trim() &&
    input.birthDate &&
    input.gender &&
    input.birthPlaceCode?.trim()
  ) {
    expected = calculateCodiceFiscale({
      firstName: input.firstName,
      lastName: input.lastName,
      birthDate: input.birthDate,
      gender: input.gender,
      birthPlaceCode: input.birthPlaceCode,
    });
  }

  return {
    normalized,
    canonical,
    expected,
    isFormallyValid,
    matchesExpected: canonical && expected ? canonical === expected : null,
  };
}
