import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { registerMember } from "../lib/api";

const Register = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orgSlug = searchParams.get("org") ?? "";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fiscalCode, setFiscalCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    password === confirmPassword &&
    !submitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (password !== confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const result = await registerMember({
        email: email.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || undefined,
        fiscal_code: fiscalCode.trim() || undefined,
        org_slug: orgSlug || undefined,
      });
      if (result.authenticated) {
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/login", { replace: true });
      }
    } catch {
      setError("Errore nella registrazione. Verifica i dati e riprova.");
    } finally {
      setSubmitting(false);
    }
  };

  const imagePanel = (
    <div className="relative hidden overflow-hidden md:block">
      <img
        src={`${import.meta.env.BASE_URL}piazza-bologna2.webp`}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-gradient-to-t from-neutral-900/80 via-neutral-900/50 to-neutral-900/20"
        aria-hidden="true"
      />
      <div className="relative flex h-full flex-col justify-end p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
          Nuovo socio
        </p>
        <p className="mt-2 text-lg font-semibold leading-snug text-white">
          Crea il tuo account<br />per accedere ai servizi.
        </p>
        <p className="mt-3 text-sm leading-6 text-white/70">
          Iscriviti per gestire la tua tessera, caricare documenti e monitorare lo stato della pratica.
        </p>
      </div>
    </div>
  );

  return (
    <section className="flex min-h-[70vh] items-center justify-center py-16">
      <div className="container-shell">
        <div className="mx-auto grid max-w-4xl overflow-hidden rounded-lg border border-neutral-100 bg-white shadow-elevated md:grid-cols-2">
          <div className="flex flex-col justify-center px-8 py-12 sm:px-12">
            <div className="flex items-center gap-3">
              <img
                src={`${import.meta.env.BASE_URL}logo.jpg`}
                alt="ASSO.N.A.M."
                className="h-10 rounded"
              />
              <div>
                <p className="text-sm font-bold text-neutral-900">ASSO.N.A.M.</p>
                <p className="text-[11px] leading-tight text-neutral-500">
                  Associazione Nazionale Arti e Mestieri
                </p>
              </div>
            </div>

            <div className="mt-8">
              <h1 className="text-xl font-semibold text-neutral-900">
                Crea un account
              </h1>
              <p className="mt-1.5 text-sm leading-6 text-neutral-500">
                Inserisci i tuoi dati per registrarti come socio.
                {orgSlug && (
                  <span className="block mt-1 text-brand font-medium">
                    Associazione: {orgSlug}
                  </span>
                )}
              </p>
            </div>

            {error && (
              <div className="mt-5 rounded-md border border-red-200/60 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="reg-first"
                    className="block text-sm font-medium text-neutral-700"
                  >
                    Nome
                  </label>
                  <input
                    id="reg-first"
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="text"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-last"
                    className="block text-sm font-medium text-neutral-700"
                  >
                    Cognome
                  </label>
                  <input
                    id="reg-last"
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="text"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="reg-email"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Email
                </label>
                <input
                  id="reg-email"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  type="email"
                  autoComplete="email"
                  placeholder="nome@esempio.it"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="reg-phone"
                    className="block text-sm font-medium text-neutral-700"
                  >
                    Telefono{" "}
                    <span className="text-neutral-400 font-normal">(facoltativo)</span>
                  </label>
                  <input
                    id="reg-phone"
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-cf"
                    className="block text-sm font-medium text-neutral-700"
                  >
                    Codice fiscale{" "}
                    <span className="text-neutral-400 font-normal">(facoltativo)</span>
                  </label>
                  <input
                    id="reg-cf"
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                    type="text"
                    autoComplete="off"
                    value={fiscalCode}
                    onChange={(e) => setFiscalCode(e.target.value.toUpperCase())}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="reg-pw"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Password
                </label>
                <input
                  id="reg-pw"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Minimo 8 caratteri"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div>
                <label
                  htmlFor="reg-pw2"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Conferma password
                </label>
                <input
                  id="reg-pw2"
                  className={`mt-1 w-full rounded-md border bg-white px-3.5 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:ring-2 ${
                    confirmPassword && confirmPassword !== password
                      ? "border-red-300 focus:border-red-400 focus:ring-red-200/40"
                      : "border-neutral-200 focus:border-brand focus:ring-brand/20"
                  }`}
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                {confirmPassword && confirmPassword !== password && (
                  <p className="mt-1 text-xs text-red-600">Le password non coincidono</p>
                )}
              </div>

              <button
                className="mt-2 inline-flex w-full items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-subtle transition hover:-translate-y-px hover:bg-brand-dark hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-subtle"
                type="submit"
                disabled={!canSubmit}
              >
                {submitting ? "Registrazione in corso…" : "Registrati"}
              </button>
            </form>

            <div className="mt-6 border-t border-neutral-100 pt-4">
              <p className="text-sm text-neutral-600">
                Hai già un account?{" "}
                <Link
                  className="font-medium text-brand transition hover:text-brand-dark"
                  to="/login"
                >
                  Accedi
                </Link>
              </p>
            </div>

            <div className="mt-4 border-t border-neutral-100 pt-4">
              <Link
                className="text-sm font-medium text-neutral-600 transition hover:text-neutral-900"
                to="/"
              >
                &larr; Torna alla home
              </Link>
            </div>
          </div>
          {imagePanel}
        </div>
      </div>
    </section>
  );
};

export default Register;
