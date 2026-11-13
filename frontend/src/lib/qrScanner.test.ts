import { describe, expect, it } from "vitest";
import {
  BarcodeFormat, BinaryBitmap, ChecksumException, EncodeHintType, FormatException,
  HybridBinarizer, NotFoundException, QRCodeWriter, RGBLuminanceSource,
} from "@zxing/library";
import { createMemberCardQrReader, isRetryableQrScanError } from "./qrScanner";

describe("member card QR decoding", () => {
  it("reads dense membership QR codes at different sizes and positions in real camera-sized frames", async () => {
    const payload = btoa(JSON.stringify({ card_number: 876543, card_year: 2026, member_id: 12345, org_id: 99, v: 1 })).replace(/=+$/, "");
    const value = `https://assonam.it/api/cards/verify/${payload}.${"a".repeat(64)}`;
    const qr = new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 0, 0,
      new Map<EncodeHintType, unknown>([[EncodeHintType.ERROR_CORRECTION, "M"], [EncodeHintType.MARGIN, 2]]));
    const reader = await createMemberCardQrReader(250);
    for (const [width, height] of [[640, 480], [1280, 720], [1920, 1080]]) {
      for (const scale of [1, 2, 3]) {
        for (let offset = 0; offset < 25; offset += 1) {
          const pixels = new Uint8ClampedArray(width * height).fill(240);
          const size = qr.getWidth() * scale;
          const x = Math.floor((width - size) / 2);
          const y = Math.floor((height - size) / 2) + offset;
          for (let qy = 0; qy < size; qy += 1) {
            for (let qx = 0; qx < size; qx += 1) {
              pixels[(y + qy) * width + x + qx] = qr.get(Math.floor(qx / scale), Math.floor(qy / scale)) ? 0 : 255;
            }
          }
          const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, height)));
          expect(reader.decodeBitmap(bitmap).getText(), `${width}x${height}, QR ${size}px, offset ${offset}`).toBe(value);
        }
      }
    }
  });

  it("distinguishes recoverable QR frames from errors that terminate the decoder", () => {
    for (const error of [new NotFoundException(), new ChecksumException(), new FormatException()]) {
      expect(isRetryableQrScanError(error)).toBe(true);
    }
    for (const error of [new DOMException("", "InvalidStateError"), new Error("Camera stopped"), null, undefined]) {
      expect(isRetryableQrScanError(error)).toBe(false);
    }
  });
});
