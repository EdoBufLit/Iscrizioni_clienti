export async function createMemberCardQrReader(delayBetweenScanAttempts: number) {
  const [{ BrowserQRCodeReader }, { DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  // The default finder skips rows in larger frames and can miss the dense QR
  // on a membership card. Inspect every third row, including small codes.
  return new BrowserQRCodeReader(new Map([[DecodeHintType.TRY_HARDER, true]]), {
    delayBetweenScanAttempts,
  });
}

// ZXing retries these frame-level errors itself. Any other error stops its
// decode loop, so callers must leave the scanning state and offer a restart.
export function isRetryableQrScanError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("getKind" in error) || typeof error.getKind !== "function") {
    return false;
  }
  return ["NotFoundException", "ChecksumException", "FormatException"].includes(error.getKind());
}
