import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AuthError,
  createMemberGoogleWalletSaveLink,
  requestMagicLink,
} from "../lib/api";

type WalletHandoffState =
  | "checking"
  | "redirecting"
  | "needs_login"
  | "magic_link_sent"
  | "error";

const WalletGoogleAdd = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<WalletHandoffState>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [email, setEmail] = useState(() => (searchParams.get("email") ?? "").trim());
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);

  const isAndroid = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /android/i.test(navigator.userAgent ?? "");
  }, []);

  useEffect(() => {
    let active = true;

    const redirectToGoogleWallet = async () => {
      setErrorMessage(null);
      try {
        const payload = await createMemberGoogleWalletSaveLink();
        if (!active) return;
        setStatus("redirecting");
        window.location.href = payload.url;
      } catch (error) {
        if (!active) return;
        if (error instanceof AuthError) {
          setStatus("needs_login");
          return;
        }
        setStatus("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Impossibile generare il link Google Wallet. Riprova.",
        );
      }
    };

    void redirectToGoogleWallet();
    return () => {
      active = false;
    };
  }, []);

  const handleRequestMagicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim();
    if (!normalized) {
      setErrorMessage("Inserisci la tua email per ricevere il link di accesso.");
      return;
    }
    setMagicLinkLoading(true);
    setErrorMessage(null);
    try {
      await requestMagicLink(normalized);
      setStatus("magic_link_sent");
    } catch {
      setErrorMessage("Impossibile inviare il link di accesso. Riprova tra poco.");
    } finally {
      setMagicLinkLoading(false);
    }
  };

  if (status === "checking" || status === "redirecting") {
    return (
      <section className="py-16" data-reveal="fade-up">
        <div className="container-shell">
          <div className="surface-strong mx-auto max-w-xl p-8 text-center md:p-10">
            <p className="section-title">Google Wallet</p>
            <h1 className="section-heading">
              {status === "redirecting" ? "Reindirizzamento in corso" : "Preparazione tessera"}
            </h1>
            <p className="mt-4 text-sm leading-7 text-neutral-600">
              {status === "redirecting"
                ? "Ti stiamo portando su Google Wallet per aggiungere la tessera."
                : "Verifichiamo il tuo accesso e generiamo il link sicuro."}
            </p>
            <p className="mt-4 text-xs uppercase tracking-[0.18em] text-neutral-400">
              Disponibile su Android
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16" data-reveal="fade-up">
      <div className="container-shell">
        <div className="surface-strong mx-auto max-w-xl p-8 md:p-10">
          <p className="section-title">Google Wallet</p>
          <h1 className="section-heading">Aggiungi la tua tessera ASSO.N.A.M.</h1>
          <p className="mt-4 text-sm leading-7 text-neutral-600">
            Questo collegamento funziona meglio da smartphone Android con Google Wallet installato.
          </p>

          {!isAndroid && (
            <div className="mt-5 rounded-lg border border-amber-200/70 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Apri questo link da un dispositivo Android per completare l&apos;aggiunta a Google Wallet.
            </div>
          )}

          {(status === "needs_login" || status === "magic_link_sent" || status === "error") && (
            <div className="mt-6 rounded-xl border border-neutral-200 bg-white/80 p-5">
              <p className="text-sm font-semibold text-neutral-900">
                {status === "magic_link_sent"
                  ? "Controlla la tua email"
                  : "Accesso richiesto"}
              </p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                {status === "magic_link_sent"
                  ? "Ti abbiamo inviato un link di accesso. Dopo l'apertura del link, torna qui per aggiungere la tessera a Google Wallet."
                  : "Per continuare, accedi all'area riservata oppure richiedi un link di accesso via email."}
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <Link className="btn-primary px-5 py-2.5" to="/login">
                  Accedi
                </Link>
              </div>

              <form className="mt-5 space-y-3" onSubmit={handleRequestMagicLink}>
                <label htmlFor="wallet-google-add-email" className="block text-sm font-semibold text-neutral-700">
                  Email socio
                </label>
                <input
                  id="wallet-google-add-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  placeholder="nome@esempio.it"
                />
                <button
                  type="submit"
                  className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={magicLinkLoading}
                >
                  {magicLinkLoading ? "Invio in corso..." : "Ricevi link di accesso via email"}
                </button>
              </form>

              {errorMessage && (
                <p className="mt-4 text-sm text-red-600">{errorMessage}</p>
              )}
            </div>
          )}

          <div className="mt-6 rounded-lg border border-neutral-200/70 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
            <p className="font-medium text-neutral-800">Suggerimento</p>
            <p className="mt-1">
              Se hai gi&agrave; accesso all&apos;area riservata, puoi aggiungere la tessera anche dalla pagina
              &nbsp;
              <Link className="font-semibold text-brand hover:text-brand-dark" to="/dashboard">
                La tua tessera
              </Link>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WalletGoogleAdd;
