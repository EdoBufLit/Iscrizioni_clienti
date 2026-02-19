import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchPublicOrganizationInfo,
  ingestPienissimoMember,
  type PienissimoIngestResponse,
} from "../lib/api";
import { applySeo } from "../lib/seo";

type SubmitStatus = "idle" | "loading" | "success" | "error";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PienissimoThankYouPage = () => {
  const { orgSlug } = useParams<{ orgSlug: string }>();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [clubDisplayName, setClubDisplayName] = useState("Associazione");
  const [cardLogoUrl, setCardLogoUrl] = useState<string | null>(null);
  const [walletEnabled, setWalletEnabled] = useState(false);
  const [successData, setSuccessData] = useState<PienissimoIngestResponse | null>(null);

  useEffect(() => {
    applySeo({
      title: "Conferma tessera digitale",
      description: "Conferma i tuoi dati per ricevere e scaricare la tessera associativa.",
      canonicalPath: window.location.pathname,
      noindex: true,
    });
  }, []);

  useEffect(() => {
    let active = true;
    if (!orgSlug) return () => { active = false; };

    fetchPublicOrganizationInfo(orgSlug)
      .then((payload) => {
        if (!active) return;
        setClubDisplayName(payload.club_display_name || payload.name || "Associazione");
        setCardLogoUrl(payload.card_logo_url ?? null);
        setWalletEnabled(Boolean(payload.wallet_enabled));
      })
      .catch(() => {
        if (!active) return;
        setClubDisplayName("Associazione");
        setCardLogoUrl(null);
        setWalletEnabled(false);
      });

    return () => { active = false; };
  }, [orgSlug]);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const isEmailValid = EMAIL_REGEX.test(normalizedEmail);
  const isLoading = status === "loading";
  const isSuccess = status === "success";

  const canSubmit = Boolean(orgSlug) && !isLoading && normalizedEmail.length > 0 && isEmailValid;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!orgSlug) {
      setStatus("error");
      setErrorMessage("Associazione non trovata nel link.");
      return;
    }
    if (!normalizedEmail || !isEmailValid) {
      setEmailError("Inserisci una email valida.");
      return;
    }

    setStatus("loading");
    setErrorMessage("");
    setEmailError("");
    setSuccessData(null);

    const payload: {
      email: string;
      external_customer_id: string;
      first_name?: string;
      last_name?: string;
    } = {
      email: normalizedEmail,
      external_customer_id: `email:${normalizedEmail}`,
    };

    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    if (cleanFirstName) payload.first_name = cleanFirstName;
    if (cleanLastName) payload.last_name = cleanLastName;

    try {
      const result = await ingestPienissimoMember(orgSlug, payload);
      setSuccessData(result);
      setWalletEnabled(Boolean(result.wallet_enabled));
      setStatus("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore temporaneo. Riprova.";
      if (message.toLowerCase().includes("email valida")) {
        setStatus("error");
        setEmailError("Inserisci una email valida.");
        return;
      }
      setStatus("error");
      setErrorMessage(message);
    }
  };

  const downloadUrl = successData?.card_download_url ?? null;
  const verifyUrl = successData?.card_verification_url ?? null;
  const walletAppleUrl = successData?.card_wallet_apple_url ?? null;
  const walletGoogleUrl = successData?.card_wallet_google_url ?? null;

  return (
    <section className="py-16" data-reveal="fade-up">
      <div className="container-shell">
        <div className="surface-strong mx-auto max-w-[32rem] p-6 sm:p-8">

          {/* ── Branding header ── */}
          <div className="mb-6 flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-4">
            {cardLogoUrl && (
              <img
                src={cardLogoUrl}
                alt={`Logo ${clubDisplayName}`}
                className="object-contain"
                style={{
                  height: "clamp(48px, 10vw, 72px)",
                  maxWidth: "clamp(120px, 40vw, 220px)",
                  minWidth: 80,
                  minHeight: 40,
                }}
                loading="lazy"
              />
            )}
            <div className="text-center sm:text-left">
              <h1 className="text-2xl font-bold leading-tight text-neutral-900 sm:text-3xl">
                {clubDisplayName}
              </h1>
              <p className="mt-1 text-sm text-neutral-500">Tessera associativa digitale</p>
            </div>
          </div>

          {isSuccess ? (
            /* ── Success state ── */
            <div className="space-y-4">
              <div className="rounded-xl border border-[#c6a04f]/30 bg-[#2d0015]/5 px-4 py-4">
                <p className="text-base font-semibold text-neutral-800">
                  Tessera pronta! Scaricala in PDF o verificala.
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  Ti abbiamo inviato un'email con la tessera. Se non la ricevi entro 5 minuti,
                  controlla Spam/Promozioni.
                </p>
              </div>

              {downloadUrl && (
                <a
                  className="btn-primary inline-flex w-full items-center justify-center py-3 text-sm"
                  href={downloadUrl}
                >
                  Scarica tessera (PDF)
                </a>
              )}

              {verifyUrl && (
                <a
                  className="inline-flex w-full items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                  href={verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Verifica tessera
                </a>
              )}

              {/* Wallet links — only show if actually enabled */}
              {walletEnabled && (walletAppleUrl || walletGoogleUrl) && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {walletAppleUrl && (
                    <a
                      className="inline-flex items-center justify-center rounded-xl border border-brand/40 bg-white px-3 py-2 text-xs font-semibold text-brand hover:bg-brand/5"
                      href={walletAppleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Aggiungi a Apple Wallet
                    </a>
                  )}
                  {walletGoogleUrl && (
                    <a
                      className="inline-flex items-center justify-center rounded-xl border border-brand/40 bg-white px-3 py-2 text-xs font-semibold text-brand hover:bg-brand/5"
                      href={walletGoogleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Aggiungi a Google Wallet
                    </a>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ── Form ── */
            <form className="space-y-4" onSubmit={handleSubmit} noValidate>
              <p className="text-sm leading-7 text-neutral-600">
                Inserisci i tuoi dati per ricevere e scaricare la tessera associativa.
              </p>

              {errorMessage && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              )}

              <div>
                <label htmlFor="pienissimo-email" className="text-sm font-semibold text-neutral-700">
                  Email
                </label>
                <input
                  id="pienissimo-email"
                  className="mt-2 w-full px-4 py-2.5 text-sm"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  disabled={isLoading}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (emailError) setEmailError("");
                  }}
                  placeholder="nome@esempio.it"
                  aria-invalid={emailError ? "true" : "false"}
                />
                {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
              </div>

              <div>
                <label htmlFor="pienissimo-first-name" className="text-sm font-semibold text-neutral-700">
                  Nome <span className="font-normal text-neutral-500">(opzionale)</span>
                </label>
                <input
                  id="pienissimo-first-name"
                  className="mt-2 w-full px-4 py-2.5 text-sm"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  disabled={isLoading}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </div>

              <div>
                <label htmlFor="pienissimo-last-name" className="text-sm font-semibold text-neutral-700">
                  Cognome <span className="font-normal text-neutral-500">(opzionale)</span>
                </label>
                <input
                  id="pienissimo-last-name"
                  className="mt-2 w-full px-4 py-2.5 text-sm"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  disabled={isLoading}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </div>

              <button
                className="btn-primary mt-2 w-full py-3 text-sm"
                type="submit"
                disabled={!canSubmit}
              >
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Elaborazione...
                  </span>
                ) : (
                  "Ricevi e scarica la tessera"
                )}
              </button>
            </form>
          )}

          <p className="mt-5 text-xs leading-6 text-neutral-500">
            Se non ricevi l&#39;email entro 5 minuti, controlla Spam o Promozioni.
          </p>
          <p className="mt-2 text-sm">
            <Link className="font-semibold text-brand hover:text-brand-dark" to="/contatti">
              Contatta l&#39;associazione
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
};

export default PienissimoThankYouPage;
