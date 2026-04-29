const PUBLIC_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const PUBLIC_UPLOAD_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const PUBLIC_UPLOAD_ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

const hasAllowedExtension = (fileName: string) => {
  const normalized = fileName.trim().toLowerCase();
  return PUBLIC_UPLOAD_ALLOWED_EXTENSIONS.some((extension) => normalized.endsWith(extension));
};

export function validatePublicDocumentUpload(file: File): string | null {
  if (file.size > PUBLIC_UPLOAD_MAX_BYTES) {
    return "File troppo grande. Carica un file fino a 10 MB.";
  }

  if (!PUBLIC_UPLOAD_ALLOWED_MIME_TYPES.has(file.type) && !hasAllowedExtension(file.name)) {
    return "Formato non supportato. Usa PDF, JPG o PNG.";
  }

  return null;
}

export const publicUploadHint = "Formati supportati: PDF, JPG, PNG (max 10 MB)";
