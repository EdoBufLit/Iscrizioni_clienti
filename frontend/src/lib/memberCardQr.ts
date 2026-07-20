const VERIFICATION_PATH_MARKER = "/api/cards/verify/";

export const buildMemberCardQrImageUrl = (verificationUrl?: string | null): string | null => {
  const normalizedUrl = verificationUrl?.trim();
  if (!normalizedUrl) return null;

  const markerIndex = normalizedUrl.indexOf(VERIFICATION_PATH_MARKER);
  if (markerIndex < 0) return null;

  const rawToken = normalizedUrl
    .slice(markerIndex + VERIFICATION_PATH_MARKER.length)
    .split(/[?#]/, 1)[0]
    ?.trim();
  if (!rawToken) return null;

  let token = rawToken;
  try {
    token = decodeURIComponent(rawToken);
  } catch {
    // Keep the raw token; encodeURIComponent below still produces a safe path segment.
  }

  return `/api/cards/${encodeURIComponent(token)}/qr.png`;
};
