import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AuthError,
  createSuperAdminIntegrationKey,
  disableSuperAdminIntegrationKey,
  fetchSuperAdminIntegrationKeys,
  rotateSuperAdminIntegrationKey,
  type SuperAdminIntegrationKey,
} from "../../../lib/api";

type IntegrationToast = {
  type: "success" | "error";
  message: string;
} | null;

type OneTimeKeyModalState = {
  title: string;
  rawKey: string;
} | null;

type SuperAdminPienissimoIntegrationCardProps = {
  orgId: number;
  orgName: string;
  open: boolean;
  isSuperAdmin: boolean;
};

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("it-IT");
};

const SuperAdminPienissimoIntegrationCard = ({
  orgId,
  orgName,
  open,
  isSuperAdmin,
}: SuperAdminPienissimoIntegrationCardProps) => {
  const [keys, setKeys] = useState<SuperAdminIntegrationKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<"create" | "rotate" | "disable" | null>(null);
  const [inlineError, setInlineError] = useState<string>("");
  const [toast, setToast] = useState<IntegrationToast>(null);
  const [oneTimeKeyModal, setOneTimeKeyModal] = useState<OneTimeKeyModalState>(null);
  const [copied, setCopied] = useState(false);

  const activeKey = useMemo(
    () => keys.find((key) => key.is_active) ?? null,
    [keys],
  );
  const lastUsedAt = activeKey?.last_used_at ?? keys.find((key) => key.last_used_at)?.last_used_at ?? null;

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showErrorToast = useCallback((err: unknown) => {
    if (err instanceof AuthError) {
      setToast({ type: "error", message: "Sessione scaduta (401). Effettua nuovamente il login." });
      return;
    }
    if (err instanceof Error && err.message.toLowerCase().includes("accesso negato")) {
      setToast({ type: "error", message: "Accesso negato (403)." });
      return;
    }
    setToast({
      type: "error",
      message: err instanceof Error ? err.message : "Errore inatteso",
    });
  }, []);

  const loadKeys = useCallback(async () => {
    if (!isSuperAdmin) {
      return;
    }
    setLoading(true);
    setInlineError("");
    try {
      const response = await fetchSuperAdminIntegrationKeys(orgId, "pienissimo");
      setKeys(response.items);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : "Errore caricamento integrazione");
      showErrorToast(err);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, orgId, showErrorToast]);

  useEffect(() => {
    if (!open || !isSuperAdmin) {
      return;
    }
    void loadKeys();
  }, [open, isSuperAdmin, loadKeys]);

  const handleCreateKey = useCallback(async () => {
    setActionLoading("create");
    setInlineError("");
    try {
      const created = await createSuperAdminIntegrationKey(orgId, {
        name: "pienissimo",
        scopes: ["issue_member"],
      });
      setOneTimeKeyModal({
        title: "Nuova chiave creata",
        rawKey: created.raw_key,
      });
      setCopied(false);
      setToast({ type: "success", message: "Chiave creata con successo." });
      await loadKeys();
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : "Errore creazione chiave");
      showErrorToast(err);
    } finally {
      setActionLoading(null);
    }
  }, [loadKeys, orgId, showErrorToast]);

  const handleRotateKey = useCallback(async () => {
    if (!activeKey) {
      return;
    }
    setActionLoading("rotate");
    setInlineError("");
    try {
      const rotated = await rotateSuperAdminIntegrationKey(orgId, activeKey.id);
      setOneTimeKeyModal({
        title: "Chiave ruotata",
        rawKey: rotated.raw_key,
      });
      setCopied(false);
      setToast({ type: "success", message: "Chiave ruotata con successo." });
      await loadKeys();
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : "Errore rotazione chiave");
      showErrorToast(err);
    } finally {
      setActionLoading(null);
    }
  }, [activeKey, loadKeys, orgId, showErrorToast]);

  const handleDisableKey = useCallback(async () => {
    if (!activeKey) {
      return;
    }
    if (!window.confirm("Disattivare la chiave attiva di Pienissimo?")) {
      return;
    }
    setActionLoading("disable");
    setInlineError("");
    try {
      await disableSuperAdminIntegrationKey(orgId, activeKey.id);
      setToast({ type: "success", message: "Chiave disattivata." });
      await loadKeys();
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : "Errore disattivazione chiave");
      showErrorToast(err);
    } finally {
      setActionLoading(null);
    }
  }, [activeKey, loadKeys, orgId, showErrorToast]);

  const handleCopy = useCallback(async () => {
    if (!oneTimeKeyModal) {
      return;
    }
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      setToast({ type: "error", message: "Clipboard non disponibile in questo browser." });
      return;
    }
    try {
      await navigator.clipboard.writeText(oneTimeKeyModal.rawKey);
      setCopied(true);
      setToast({ type: "success", message: "Chiave copiata." });
    } catch {
      setToast({ type: "error", message: "Impossibile copiare la chiave." });
    }
  }, [oneTimeKeyModal]);

  const closeOneTimeModal = useCallback(() => {
    setOneTimeKeyModal(null);
    setCopied(false);
  }, []);

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <>
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              Integrazione Pienissimo
            </p>
            <h4 className="mt-1 text-base font-semibold text-neutral-900">{orgName}</h4>
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
              activeKey
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-neutral-200 bg-neutral-100 text-neutral-600"
            }`}
          >
            {activeKey ? "Key attiva" : "Non configurata"}
          </span>
        </div>

        <div className="mt-4 grid gap-2 text-sm text-neutral-700">
          <p>
            <span className="font-medium text-neutral-900">Ultimo utilizzo:</span>{" "}
            {loading ? "Caricamento..." : formatDateTime(lastUsedAt)}
          </p>
          <p>
            <span className="font-medium text-neutral-900">Scope:</span>{" "}
            {activeKey ? activeKey.scopes.join(", ") || "-" : "-"}
          </p>
        </div>

        {inlineError && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {inlineError}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {!activeKey ? (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
              onClick={handleCreateKey}
              disabled={loading || actionLoading !== null}
            >
              {actionLoading === "create" ? "Creazione..." : "Crea chiave"}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
                onClick={handleRotateKey}
                disabled={loading || actionLoading !== null}
              >
                {actionLoading === "rotate" ? "Rotazione..." : "Ruota chiave"}
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                onClick={handleDisableKey}
                disabled={loading || actionLoading !== null}
              >
                {actionLoading === "disable" ? "Disattivazione..." : "Disattiva"}
              </button>
            </>
          )}
        </div>
      </section>

      {toast && (
        <div className="pointer-events-none fixed right-4 top-4 z-[80]">
          <div
            className={`rounded-md border px-4 py-2 text-sm shadow-lg ${
              toast.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      {oneTimeKeyModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4">
          <div className="modal-panel w-full max-w-xl p-6">
            <h5 className="text-lg font-semibold text-neutral-900">{oneTimeKeyModal.title}</h5>
            <p className="mt-2 text-sm text-neutral-600">
              Salvala ora: non sara piu visibile dopo la chiusura.
            </p>

            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              Chiave one-time: conserva questa stringa in un luogo sicuro.
            </div>

            <div className="mt-4 flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={oneTimeKeyModal.rawKey}
                className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-800"
              />
              <button
                type="button"
                className="rounded-md border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:border-neutral-300"
                onClick={handleCopy}
              >
                {copied ? "Copiata" : "Copia"}
              </button>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
                onClick={closeOneTimeModal}
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SuperAdminPienissimoIntegrationCard;
