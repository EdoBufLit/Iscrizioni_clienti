type FeaturePolicyLike = {
  allowsFeature: (feature: string) => boolean;
};

type DocumentWithFeaturePolicy = Document & {
  permissionsPolicy?: FeaturePolicyLike;
  featurePolicy?: FeaturePolicyLike;
};

export function isCameraAllowedByDocumentPolicy(
  currentDocument: Document = document,
) {
  const policyDocument = currentDocument as DocumentWithFeaturePolicy;
  const policy =
    policyDocument.permissionsPolicy ?? policyDocument.featurePolicy;

  if (!policy) return true;

  try {
    return policy.allowsFeature("camera");
  } catch {
    // Older browsers expose partial policy APIs. Let getUserMedia provide the
    // authoritative result instead of blocking a potentially valid request.
    return true;
  }
}

function errorName(error: unknown) {
  if (typeof error === "object" && error && "name" in error) {
    return String(error.name);
  }
  return "";
}

export function cameraAccessErrorMessage(error: unknown) {
  const name = errorName(error);

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Il browser non ha autorizzato la fotocamera. Apri le impostazioni del sito e consenti Fotocamera, poi riprova. Se non compare alcuna richiesta, controlla anche il permesso Fotocamera dell’app del browser nelle impostazioni del telefono.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Nessuna fotocamera disponibile su questo dispositivo.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "La fotocamera non è disponibile: potrebbe essere già usata da un’altra app. Chiudila e riprova.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "Non è stato possibile selezionare una fotocamera compatibile. Riprova o incolla il link della tessera.";
  }
  if (name === "AbortError") {
    return "L’avvio della fotocamera è stato interrotto. Riprova.";
  }
  if (name === "SecurityError") {
    return "Le impostazioni di sicurezza del browser impediscono l’accesso alla fotocamera.";
  }

  const message = error instanceof Error ? error.message.trim() : "";
  return message || "Impossibile avviare la fotocamera.";
}
