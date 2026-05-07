import { publicUploadHint, validatePublicDocumentUpload } from "./uploadValidation";
import { expect, test } from "vitest";

function makeFile(name: string, type: string, size: number) {
  return new File([new Uint8Array(size)], name, { type });
}

test("accepts public document uploads by supported mime type", () => {
  expect(validatePublicDocumentUpload(makeFile("documento.pdf", "application/pdf", 128))).toBeNull();
  expect(validatePublicDocumentUpload(makeFile("foto.jpg", "image/jpeg", 128))).toBeNull();
  expect(validatePublicDocumentUpload(makeFile("foto.png", "image/png", 128))).toBeNull();
});

test("accepts public document uploads by supported extension fallback", () => {
  expect(validatePublicDocumentUpload(makeFile("documento.PDF", "", 128))).toBeNull();
});

test("rejects unsupported public document uploads and oversized files", () => {
  expect(validatePublicDocumentUpload(makeFile("script.svg", "image/svg+xml", 128))).toBe(
    "Formato non supportato. Usa PDF, JPG o PNG.",
  );
  expect(validatePublicDocumentUpload(makeFile("grande.pdf", "application/pdf", 10 * 1024 * 1024 + 1))).toBe(
    "File troppo grande. Carica un file fino a 10 MB.",
  );
});

test("public upload hint matches validator limits", () => {
  expect(publicUploadHint).toContain("PDF");
  expect(publicUploadHint).toContain("10 MB");
});
