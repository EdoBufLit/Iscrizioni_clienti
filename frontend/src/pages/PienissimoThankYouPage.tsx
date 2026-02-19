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
      description: "Conferma i tuoi dati per scaricare subito la tessera associativa.",
      canonicalPath: window.location.pathname,
      noindex: true,
    });
  }, []);

  useEffect(() => {
    let active = true;
    if (!orgSlug) {
      return () => {
        active = false;
      };
    }

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

    return () => {
      active = false;
    };
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
  const walletAppleUrl = successData?.card_wallet_apple_url ?? null;
  const walletGoogleUrl = successData?.card_wallet_google_url ?? null;

  return (
    <section className="py-16" data-reveal="fade-up">
      <div className="container-shell">
        <div className="surface-strong mx-auto max-w-[32rem] p-6 sm:p-8">
          <p className="section-title">{clubDisplayName}</p>
          <h1 className="section-heading">ULTIMO PASSO PER RICEVERE LA TESSERA</h1>
          <p className="mt-4 text-sm leading-7 text-neutral-600">
            Inserisci i dati richiesti per ricevere la tessera associativa.
          </p>

          {cardLogoUrl && (
            <div className="mt-4 flex justify-center">
              <img
                src={cardLogoUrl}
                alt={`Logo ${clubDisplayName}`}
                className="h-14 max-w-[220px] object-contain"
                loading="lazy"
              />
            </div>
          )}

          {isSuccess ? (
            <div className="mt-6 space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-700">
              <p className="font-semibold">Tessera inviata via email. Controlla anche lo spam.</p>
              {downloadUrl && (
                <a
                  className="btn-primary inline-flex w-full items-center justify-center py-2.5 text-sm"
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Scarica ora
                </a>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {walletEnabled && walletAppleUrl ? (
                  <a
                    className="inline-flex items-center justify-center rounded-xl border border-brand/40 bg-white px-3 py-2 text-xs font-semibold text-brand hover:bg-brand/5"
                    href={walletAppleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Aggiungi a Apple Wallet
                  </a>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-400"
                    disabled
                  >
                    Apple Wallet (presto)
                  </button>
                )}
                {walletEnabled && walletGoogleUrl ? (
                  <a
                    className="inline-flex items-center justify-center rounded-xl border border-brand/40 bg-white px-3 py-2 text-xs font-semibold text-brand hover:bg-brand/5"
                    href={walletGoogleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Aggiungi a Google Wallet
                  </a>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-400"
                    disabled
                  >
                    Google Wallet (presto)
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
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

              <button className="btn-primary mt-2 w-full py-2.5 text-sm" type="submit" disabled={!canSubmit}>
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Invio...
                  </span>
                ) : (
                  "Invia tessera"
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
