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
      <section className="auth-page" data-reveal="fade-up">
        <div className="container-shell w-full">
          <div className="auth-shell mx-auto max-w-3xl p-8 md:p-10">
            <p className="section-title">Area riservata</p>
            <h1 className="section-heading auth-title">Controlla la tua email</h1>
            <p className="auth-copy mt-5 max-w-2xl text-sm leading-7">
              Se l'indirizzo e associato a un account, riceverai un link di accesso sicuro entro
              pochi istanti.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                className="btn-primary px-6 py-2.5"
                type="button"
                onClick={() => setSent(false)}
              >
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
    <section className="auth-page" data-reveal="fade-up">
      <div className="container-shell w-full">
        <div className="auth-shell mx-auto grid max-w-5xl md:grid-cols-2">
          <div className="auth-panel p-8 md:p-10">
            <p className="section-title">Area riservata</p>
            <h1 className="section-heading auth-title">Accedi al portale soci</h1>
            <p className="auth-copy mt-4 text-sm leading-7">
              Inserisci le credenziali oppure richiedi un link di accesso via email.
            </p>

            {error ? (
              <div className="auth-alert mt-6 px-4 py-3 text-sm">{error}</div>
            ) : null}

            <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="login-email" className="auth-label text-sm font-semibold">
                  Email
                </label>
                <input
                  id="login-email"
                  className="auth-input mt-2 w-full rounded-xl px-4 py-2.5 text-sm"
                  type="email"
                  autoComplete="email"
                  placeholder="nome@esempio.it"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              {mode === "password" ? (
                <div>
                  <label htmlFor="login-password" className="auth-label text-sm font-semibold">
                    Password
                  </label>
                  <input
                    id="login-password"
                    className="auth-input mt-2 w-full rounded-xl px-4 py-2.5 text-sm"
                    type="password"
                    autoComplete="current-password"
                    placeholder="La tua password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
              ) : null}

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
                className="auth-link"
                type="button"
                onClick={() => setMode(mode === "password" ? "magic" : "password")}
              >
                {mode === "password" ? "Usa link via email" : "Usa password"}
              </button>
              {mode === "password" ? (
                <button
                  className="auth-link auth-link--accent"
                  type="button"
                  onClick={() => {
                    const query = email.trim()
                      ? `?email=${encodeURIComponent(email.trim())}`
                      : "";
                    navigate(`/recupera-password${query}`);
                  }}
                >
                  Password dimenticata?
                </button>
              ) : null}
            </div>

            <div className="auth-divider auth-copy mt-6 border-t pt-4 text-xs">
              Accessi amministrativi:{" "}
              <Link className="auth-link font-semibold" to="/super-admin/login">
                Super Admin
              </Link>{" "}
              ·{" "}
              <Link className="auth-link font-semibold" to="/org-admin/login">
                Admin Associazione
              </Link>
            </div>
          </div>

          <div className="auth-media hidden min-h-[24rem] md:block">
            <img
              src={`${import.meta.env.BASE_URL}studio-commercialista_800x504.jpg`}
              alt=""
              className="auth-media__image"
              aria-hidden="true"
            />
            <div className="auth-media__overlay" />
            <div className="auth-media__content flex h-full flex-col justify-end p-10">
              <p className="auth-media__eyebrow text-xs uppercase tracking-[0.2em]">ASSONAM</p>
              <p className="mt-3 font-display text-2xl leading-tight text-white">
                Accesso protetto per soci e flussi associativi.
              </p>
              <p className="auth-media__copy mt-4 max-w-sm text-sm leading-7">
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
