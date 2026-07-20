import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  establishMemberDocumentCorrectionSession,
  fetchMemberDocumentCorrection,
  resubmitMemberDocumentCorrection,
  type MemberDocumentCorrectionResponse,
} from "../lib/api";
import { applySeo } from "../lib/seo";
import {
  publicUploadHint,
  validatePublicDocumentUpload,
} from "../lib/uploadValidation";


const DOCUMENT_LABELS: Record<string, string> = {
  identity: "Documento di identità",
  fiscal_code: "Documento del codice fiscale",
};


const MemberDocumentCorrection = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [context, setContext] = useState<MemberDocumentCorrectionResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");

  useEffect(() => {
    applySeo({
      title: "Correzione documento",
      description: "Area riservata per la correzione dei documenti associativi.",
      canonicalPath: "/dashboard/documenti/correzione",
      noindex: true,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        if (token && typeof window !== "undefined") {
          window.history.replaceState(
            window.history.state,
            "",
            window.location.pathname,
          );
        }
        const result = token
          ? await establishMemberDocumentCorrectionSession(token)
          : await fetchMemberDocumentCorrection();
        if (cancelled) return;
        setContext(result);
      } catch (requestError) {
        if (cancelled) return;
        setContext(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Il link di correzione non è disponibile.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFileError("");
    if (!selected) {
      setFile(null);
      return;
    }
    const validationError = validatePublicDocumentUpload(selected);
    if (validationError) {
      setFile(null);
      setFileError(validationError);
      event.target.value = "";
      return;
    }
    setFile(selected);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!context || !file || submitting) return;

    setSubmitting(true);
    setError("");
    try {
      await resubmitMemberDocumentCorrection(context.document.id, file);
      setCompleted(true);
      setFile(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Non è stato possibile inviare il documento.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <section className="auth-page" aria-busy="true">
        <div className="container-shell w-full">
          <div className="auth-shell mx-auto max-w-3xl p-8 md:p-10">
            <p className="section-title">Area riservata</p>
            <h1 className="section-heading auth-title">Verifica del link in corso</h1>
            <p className="auth-copy mt-4 text-sm leading-7" role="status">
              Stiamo aprendo la sessione protetta per la correzione del documento.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (completed) {
    return (
      <section className="auth-page">
        <div className="container-shell w-full">
          <div className="auth-shell mx-auto max-w-3xl p-8 md:p-10">
            <p className="section-title">Documento inviato</p>
            <h1 className="section-heading auth-title">Nuova versione ricevuta</h1>
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-7 text-emerald-800" role="status">
              Il documento è tornato in revisione. Riceverai le successive comunicazioni
              dalla tua associazione.
            </div>
            <div className="mt-8">
              <Link className="btn-primary px-6 py-2.5" to="/">
                Torna al sito
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!context) {
    return (
      <section className="auth-page">
        <div className="container-shell w-full">
          <div className="auth-shell mx-auto max-w-3xl p-8 md:p-10">
            <p className="section-title">Area riservata</p>
            <h1 className="section-heading auth-title">Link non disponibile</h1>
            <div className="auth-alert mt-6 px-4 py-3 text-sm leading-6" role="alert">
              {error || "Il link non è valido, è scaduto oppure il documento è già stato corretto."}
            </div>
            <p className="auth-copy mt-5 text-sm leading-7">
              Se devi ancora inviare la nuova versione, chiedi alla tua associazione di
              controllare la pratica.
            </p>
            <div className="mt-8">
              <Link className="btn-ghost px-6 py-2.5" to="/">
                Torna al sito
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const documentLabel = DOCUMENT_LABELS[context.document.type] ?? "Documento";

  return (
    <section className="auth-page">
      <div className="container-shell w-full">
        <div className="auth-shell mx-auto max-w-3xl p-8 md:p-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="section-title">Area riservata · accesso limitato</p>
              <h1 className="section-heading auth-title">Correggi il documento</h1>
            </div>
            <span className="inline-flex w-fit rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
              Correzione richiesta
            </span>
          </div>

          <p className="auth-copy mt-5 text-sm leading-7">
            Questa sessione permette esclusivamente di consultare la motivazione e
            caricare la nuova versione richiesta.
          </p>

          <dl className="mt-7 grid gap-4 rounded-2xl border border-neutral-200 bg-white/70 p-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-neutral-500">Socio</dt>
              <dd className="mt-1 text-sm font-semibold text-neutral-900">
                {context.member.display_name || "Socio"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-neutral-500">Associazione</dt>
              <dd className="mt-1 text-sm font-semibold text-neutral-900">
                {context.organization.name}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-bold uppercase tracking-wide text-neutral-500">Documento</dt>
              <dd className="mt-1 text-sm font-semibold text-neutral-900">{documentLabel}</dd>
              <p className="mt-1 break-all text-xs text-neutral-500">{context.document.filename}</p>
            </div>
          </dl>

          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
            <h2 className="text-sm font-bold text-red-900">Motivazione del rigetto</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-red-800">
              {context.document.rejection_note || "Il documento necessita di una nuova versione."}
            </p>
          </div>

          {error ? (
            <div className="auth-alert mt-6 px-4 py-3 text-sm" role="alert">
              {error}
            </div>
          ) : null}

          <form className="mt-7" onSubmit={handleSubmit}>
            <label className="auth-label text-sm font-semibold" htmlFor="corrected-document">
              Nuova versione del documento
            </label>
            <input
              id="corrected-document"
              className="auth-input mt-2 w-full rounded-xl px-4 py-3 text-sm"
              type="file"
              accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
              aria-describedby={
                fileError
                  ? "corrected-document-help corrected-document-error"
                  : "corrected-document-help"
              }
              aria-invalid={Boolean(fileError)}
              disabled={submitting}
              onChange={handleFileChange}
            />
            <p id="corrected-document-help" className="mt-2 text-xs leading-5 text-neutral-500">
              {publicUploadHint}
            </p>
            {fileError ? (
              <p id="corrected-document-error" className="mt-2 text-sm font-semibold text-red-700" role="alert">
                {fileError}
              </p>
            ) : null}
            {file ? (
              <p className="mt-3 break-all text-sm font-semibold text-neutral-700" role="status">
                File selezionato: {file.name}
              </p>
            ) : null}

            <button
              className="btn-primary mt-6 w-full justify-center px-6 py-3 sm:w-auto"
              type="submit"
              disabled={!file || submitting}
              aria-busy={submitting}
            >
              {submitting ? "Invio in corso…" : "Invia nuova versione"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
};


export default MemberDocumentCorrection;
