const VERIFICATION_PATH_MARKER = "/api/cards/verify/";

export const extractMemberCardVerificationToken = (
  qrValue?: string | null,
): string | null => {
  const normalizedValue = qrValue?.trim();
  if (!normalizedValue) return null;

  const markerIndex = normalizedValue.indexOf(VERIFICATION_PATH_MARKER);
  let rawToken: string | null = null;
  if (markerIndex >= 0) {
    rawToken = normalizedValue
      .slice(markerIndex + VERIFICATION_PATH_MARKER.length)
      .split(/[?#]/, 1)[0]
      ?.trim() || null;
  } else {
    try {
      const parsed = new URL(normalizedValue, window.location.origin);
      rawToken = parsed.searchParams.get("card_token")?.trim() || null;
    } catch {
      rawToken = normalizedValue;
    }
    if (!rawToken && /^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/i.test(normalizedValue)) {
      rawToken = normalizedValue;
    }
  }

  if (!rawToken) return null;

  try {
    return decodeURIComponent(rawToken);
  } catch {
    return rawToken;
  }
};

export const buildMemberCardQrImageUrl = (verificationUrl?: string | null): string | null => {
  const token = extractMemberCardVerificationToken(verificationUrl);
  if (!token) return null;

  return `/api/cards/${encodeURIComponent(token)}/qr.png`;
};
