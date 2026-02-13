import { useEffect } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "../lib/seo";

const SECTIONS = [
  {
    title: "1. Titolare del trattamento",
    body: [
      "Il titolare del trattamento e ASSONAM - Associazione Nazionale Arti e Mestieri, con sede operativa in Via Sambucuccio d'Alando, 10 - 00162 Roma (RM).",
      "Email: asso.nam@email.it - Telefono: +39 06 3972 4643",
    ],
  },
  {
    title: "2. Finalita e base giuridica",
    body: [
      "I dati personali sono utilizzati per gestione iscrizioni, verifica documentale, emissione tessera, adempimenti amministrativi e comunicazioni operative.",
      "La base giuridica include consenso dell'interessato, esecuzione di obblighi contrattuali e adempimento di obblighi di legge.",
    ],
  },
  {
    title: "3. Dati raccolti",
    body: [
      "Nome, cognome, data di nascita, codice fiscale, email, telefono, credenziali di accesso e, dove previsto, documento di identita.",
    ],
  },
  {
    title: "4. Conservazione e sicurezza",
    body: [
      "I dati sono trattati con strumenti informatici protetti e conservati per il tempo necessario alle finalita indicate e agli obblighi normativi.",
    ],
  },
  {
    title: "5. Diritti dell'interessato",
    body: [
      "L'interessato puo esercitare i diritti previsti dagli articoli 15-22 GDPR: accesso, rettifica, cancellazione, limitazione, opposizione, portabilita e revoca del consenso.",
      "Le richieste possono essere inviate a asso.nam@email.it.",
    ],
  },
  {
    title: "6. Cookie",
    body: [
      "Il portale utilizza cookie tecnici necessari al funzionamento della sessione e non impiega cookie di profilazione per finalita pubblicitarie.",
    ],
  },
] as const;

const Privacy = () => {
  useEffect(() => {
    applySeo({
      title: "Informativa sulla privacy",
      description:
        "Informativa sul trattamento dei dati personali ai sensi del GDPR (Regolamento UE 2016/679) - ASSONAM.",
      canonicalPath: "/privacy",
    });
  }, []);

  return (
    <section className="py-16" data-reveal="fade-up">
      <div className="container-shell">
        <div className="surface-strong p-8 md:p-10">
          <div className="max-w-3xl">
            <p className="section-title">Privacy</p>
            <h1 className="section-heading">Informativa sul trattamento dei dati personali</h1>
            <p className="mt-5 text-base leading-8 text-neutral-600">
              Informativa resa ai sensi del Regolamento (UE) 2016/679 (GDPR) e della normativa
              italiana vigente.
            </p>
          </div>

          <div className="mt-10 space-y-4" data-reveal="stagger">
            {SECTIONS.map((section) => (
              <article key={section.title} className="surface p-6" data-reveal-item>
                <h2 className="text-lg font-semibold text-neutral-900">{section.title}</h2>
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="mt-3 text-sm leading-7 text-neutral-600">
                    {paragraph}
                  </p>
                ))}
              </article>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-neutral-500">Ultimo aggiornamento: 13 febbraio 2026</p>
            <Link className="btn-ghost px-5 py-2.5" to="/">
              Torna alla home
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Privacy;
