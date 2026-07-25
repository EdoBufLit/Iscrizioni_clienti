import { describe, expect, it } from "vitest";
import {
  cameraAccessErrorMessage,
  isCameraAllowedByDocumentPolicy,
} from "./cameraAccess";

function documentWithPolicy(allowsCamera: boolean) {
  return {
    permissionsPolicy: {
      allowsFeature: (feature: string) =>
        feature === "camera" ? allowsCamera : false,
    },
  } as unknown as Document;
}

describe("camera access helpers", () => {
  it("detects when the response policy blocks the camera before a prompt", () => {
    expect(isCameraAllowedByDocumentPolicy(documentWithPolicy(false))).toBe(false);
    expect(isCameraAllowedByDocumentPolicy(documentWithPolicy(true))).toBe(true);
  });

  it("allows browsers that do not expose a permissions-policy API", () => {
    expect(isCameraAllowedByDocumentPolicy({} as Document)).toBe(true);
  });

  it("does not claim the user denied a permission that the browser did not authorize", () => {
    const message = cameraAccessErrorMessage(
      new DOMException("Permission denied", "NotAllowedError"),
    );

    expect(message).toContain("Il browser non ha autorizzato");
    expect(message).toContain("impostazioni del telefono");
    expect(message).not.toContain("Permesso fotocamera negato");
  });

  it("distinguishes a missing or busy camera", () => {
    expect(
      cameraAccessErrorMessage(new DOMException("", "NotFoundError")),
    ).toContain("Nessuna fotocamera");
    expect(
      cameraAccessErrorMessage(new DOMException("", "NotReadableError")),
    ).toContain("già usata");
  });
});
