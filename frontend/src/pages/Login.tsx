import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchWhoAmI, loginWithPassword, requestMagicLink } from "../lib/api";
import { applySeo } from "../lib/seo";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    applySeo({
      title: "Accedi",
      description:
        "Accedi all'area riservata ASSONAM per monitorare iscrizione, documenti e stato tessera.",
      canonicalPath: "/login",
      noindex: true,
    });
  }, []);

  useEffect(() => {
    fetchWhoAmI()
      .then((whoAmI) => {
        if (whoAmI.authenticated && whoAmI.redirect_to) {
          navigate(whoAmI.redirect_to, { replace: true });
        }
      })
      .catch(() => {});
  }, [navigate]);

  const canSubmit =
    email.trim().length > 0 &&
    !submitting &&
    (mode === "magic" || password.length > 0);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError("");
    try {
      if (mode === "password") {
        const result = await loginWithPassword(email.trim(), password);
        if (result.authenticated) {
          navigate("/dashboard");
          return;
        }
        setSent(true);
      } else {
        await requestMagicLink(email.trim());
        setSent(true);
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "";
      if (message.includes("429") || message.toLowerCase().includes("too many")) {
        setError("Troppi tentativi. Attendi un minuto e riprova.");
      } else {
        setError("Credenziali non valide o errore di connessione.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <section
        className="flex min-h-[calc(100dvh-10rem)] items-center pb-10 pt-28 md:min-h-[calc(100dvh-11rem)] md:pb-14 md:pt-32"
        data-reveal="fade-up"
      >
        <div className="container-shell w-full">
          <div className="surface-strong mx-auto max-w-3xl p-8 md:p-10">
            <p className="section-title">Area riservata</p>
            <h1 className="section-heading">Controlla la tua email</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-neutral-600">
              Se l'indirizzo e associato a un account, riceverai un link di accesso sicuro entro
              pochi istanti.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button className="btn-primary px-6 py-2.5" type="button" onClick={() => setSent(false)}>
                Inserisci un'altra email
              </button>
              <Link className="btn-ghost px-6 py-2.5" to="/">
                Torna alla home
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="flex min-h-[calc(100dvh-10rem)] items-center pb-10 pt-28 md:min-h-[calc(100dvh-11rem)] md:pb-14 md:pt-32"
      data-reveal="fade-up"
    >
      <div className="container-shell w-full">
        <div className="surface-strong mx-auto grid max-w-5xl overflow-hidden md:grid-cols-2">
          <div className="p-8 md:p-10">
            <p className="section-title">Area riservata</p>
            <h1 className="section-heading">Accedi al portale soci</h1>
            <p className="mt-4 text-sm leading-7 text-neutral-600">
              Inserisci le credenziali oppure richiedi un link di accesso via email.
            </p>

            {error && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="login-email" className="text-sm font-semibold text-neutral-700">
                  Email
                </label>
                <input
                  id="login-email"
                  className="mt-2 w-full px-4 py-2.5 text-sm"
                  type="email"
                  autoComplete="email"
                  placeholder="nome@esempio.it"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              {mode === "password" && (
                <div>
                  <label htmlFor="login-password" className="text-sm font-semibold text-neutral-700">
                    Password
                  </label>
                  <input
                    id="login-password"
                    className="mt-2 w-full px-4 py-2.5 text-sm"
                    type="password"
                    autoComplete="current-password"
                    placeholder="La tua password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
              )}

              <button
                className="btn-primary mt-2 w-full py-2.5 text-sm"
                type="submit"
                disabled={!canSubmit}
                data-component="login-submit"
              >
                {submitting
                  ? "Accesso in corso..."
                  : mode === "password"
                    ? "Accedi"
                    : "Ricevi link di accesso"}
              </button>
            </form>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <button
                className="text-neutral-500 transition hover:text-neutral-700"
                type="button"
                onClick={() => setMode(mode === "password" ? "magic" : "password")}
              >
                {mode === "password" ? "Usa link via email" : "Usa password"}
              </button>
              {mode === "password" && (
                <button
                  className="text-brand transition hover:text-brand-dark"
                  type="button"
                  onClick={() => setMode("magic")}
                >
                  Password dimenticata?
                </button>
              )}
            </div>

            <div className="mt-6 border-t border-neutral-200/70 pt-4 text-xs text-neutral-500">
              Accessi amministrativi:{" "}
              <Link className="font-semibold text-neutral-700 hover:text-neutral-900" to="/super-admin/login">
                Super Admin
              </Link>{" "}
              ·{" "}
              <Link className="font-semibold text-neutral-700 hover:text-neutral-900" to="/org-admin/login">
                Admin Associazione
              </Link>
            </div>
          </div>

          <div className="relative hidden min-h-[24rem] md:block">
            <img
              src={`${import.meta.env.BASE_URL}studio-commercialista_800x504.jpg`}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              aria-hidden="true"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-[#12383d]/88 via-[#1f5b61]/78 to-[#0c2a2e]/86" />
            <div className="relative flex h-full flex-col justify-end p-10 text-white">
              <p className="text-xs uppercase tracking-[0.2em] text-white/70">ASSONAM</p>
              <p className="mt-3 font-display text-2xl leading-tight">
                Accesso protetto per soci e flussi associativi.
              </p>
              <p className="mt-4 max-w-sm text-sm leading-7 text-white/80">
                Stato pratica, documenti e tessera disponibili in un ambiente unico.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Login;
