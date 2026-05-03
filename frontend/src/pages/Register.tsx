import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { registerMember } from "../lib/api";
import { applySeo } from "../lib/seo";

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

  useEffect(() => {
    applySeo({
      title: "Registrati",
      description:
        "Crea un account ASSONAM per accedere ai servizi associativi e monitorare le pratiche.",
      canonicalPath: "/registrati",
      noindex: true,
    });
  }, []);

  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    password === confirmPassword &&
    !submitting;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    if (password !== confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }

    setSubmitting(true);
    setError("");
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

  return (
    <section className="py-16" data-reveal="fade-up">
      <div className="container-shell">
        <div className="surface-strong mx-auto grid max-w-5xl overflow-hidden md:grid-cols-2">
          <div className="p-8 md:p-10">
            <p className="section-title">Registrazione</p>
            <h1 className="section-heading">Crea il tuo account socio</h1>
            <p className="mt-4 text-sm leading-7 text-neutral-600">
              Completa i dati essenziali per attivare l'accesso al portale.
            </p>
            {orgSlug && (
              <p className="mt-2 rounded-lg bg-brand/10 px-3 py-2 text-xs font-semibold text-brand">
                Affiliazione preselezionata: {orgSlug}
              </p>
            )}

            {error && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="reg-first" className="text-sm font-semibold text-neutral-700">
                    Nome
                  </label>
                  <input
                    id="reg-first"
                    className="mt-2 w-full px-4 py-2.5 text-sm"
                    type="text"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="reg-last" className="text-sm font-semibold text-neutral-700">
                    Cognome
                  </label>
                  <input
                    id="reg-last"
                    className="mt-2 w-full px-4 py-2.5 text-sm"
                    type="text"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reg-email" className="text-sm font-semibold text-neutral-700">
                  Email
                </label>
                <input
                  id="reg-email"
                  className="mt-2 w-full px-4 py-2.5 text-sm"
                  type="email"
                  autoComplete="email"
                  placeholder="nome@esempio.it"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="reg-phone" className="text-sm font-semibold text-neutral-700">
                    Telefono <span className="font-normal text-neutral-500">(facoltativo)</span>
                  </label>
                  <input
                    id="reg-phone"
                    className="mt-2 w-full px-4 py-2.5 text-sm"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="reg-cf" className="text-sm font-semibold text-neutral-700">
                    Codice fiscale <span className="font-normal text-neutral-500">(facoltativo)</span>
                  </label>
                  <input
                    id="reg-cf"
                    className="mt-2 w-full px-4 py-2.5 text-sm uppercase"
                    type="text"
                    value={fiscalCode}
                    onChange={(event) => setFiscalCode(event.target.value.toUpperCase())}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reg-password" className="text-sm font-semibold text-neutral-700">
                  Password
                </label>
                <input
                  id="reg-password"
                  className="mt-2 w-full px-4 py-2.5 text-sm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Minimo 8 caratteri"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              <div>
                <label htmlFor="reg-confirm-password" className="text-sm font-semibold text-neutral-700">
                  Conferma password
                </label>
                <input
                  id="reg-confirm-password"
                  className="mt-2 w-full px-4 py-2.5 text-sm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
                {confirmPassword && confirmPassword !== password && (
                  <p className="mt-1 text-xs text-red-600">Le password non coincidono.</p>
                )}
              </div>

              <button
                className="btn-primary mt-2 w-full py-2.5 text-sm"
                type="submit"
                disabled={!canSubmit}
                data-component="register-submit"
              >
                {submitting ? "Registrazione in corso..." : "Registrati"}
              </button>
            </form>

            <div className="mt-6 border-t border-neutral-200/70 pt-4 text-sm text-neutral-600">
              Hai già un account?{" "}
              <Link className="font-semibold text-brand hover:text-brand-dark" to="/login">
                Accedi
              </Link>
            </div>
          </div>

          <div className="relative hidden min-h-[24rem] md:block">
            <img
              src={`${import.meta.env.BASE_URL}piazza-bologna2.webp`}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              aria-hidden="true"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-[#12383d]/88 via-[#1f5b61]/78 to-[#0c2a2e]/86" />
            <div className="relative flex h-full flex-col justify-end p-10 text-white">
              <p className="text-xs uppercase tracking-[0.2em] text-white/70">Nuovo socio</p>
              <p className="mt-3 font-display text-2xl leading-tight">Attiva il tuo profilo in pochi minuti.</p>
              <p className="mt-4 max-w-sm text-sm leading-7 text-white/80">
                Una volta registrato potrai seguire tutta la pratica dall'area riservata.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Register;
