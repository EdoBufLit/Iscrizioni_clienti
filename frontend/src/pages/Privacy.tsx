import { useEffect } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "../lib/seo";

type PrivacySection = {
  title: string;
  intro?: string;
  paragraphs?: string[];
  bullets?: string[];
  note?: string;
};

const CONTACT_DETAILS = {
  organization: "ASSONAM - Associazione Nazionale Arti e Mestieri",
  address: "Via Sambucuccio d'Alando, 10 - 00162 Roma (RM)",
  email: "asso.nam@email.it",
  phone: "+39 06 3972 4643",
} as const;

const HIGHLIGHTS = [
  {
    label: "Ambito",
    value: "iscrizione socio online e gestione del rapporto associativo",
  },
  {
    label: "Servizi coperti",
    value: "tessera digitale, area riservata, libro soci digitale",
  },
  {
    label: "Documenti",
    value: "eventuale verifica del documento di identità solo nei casi necessari",
  },
] as const;

const SECTIONS: PrivacySection[] = [
  {
    title: "1. Titolare del trattamento",
    paragraphs: [
      `${CONTACT_DETAILS.organization}, con sede operativa in ${CONTACT_DETAILS.address}, agisce quale Titolare del trattamento dei dati personali trattati tramite il portale dedicato alle iscrizioni, alla gestione dei soci e ai servizi associativi digitali.`,
      `Per informazioni sul trattamento dei dati personali o per l'esercizio dei diritti previsti dal GDPR è possibile contattare il Titolare ai recapiti seguenti: email ${CONTACT_DETAILS.email}; telefono ${CONTACT_DETAILS.phone}.`,
    ],
  },
  {
    title: "2. Categorie di dati trattati",
    intro:
      "Nel contesto dell'iscrizione e della gestione del rapporto associativo ASSONAM può trattare, a seconda del caso concreto, le seguenti categorie di dati:",
    bullets: [
      "dati identificativi e anagrafici del socio o aspirante socio, quali nome, cognome, data e luogo di nascita, sesso, codice fiscale e altri dati necessari alla corretta identificazione;",
      "dati di contatto, quali indirizzo email e numero di telefono, utilizzati per la gestione della pratica, dell'account e delle comunicazioni operative;",
      "dati associativi, quali data di iscrizione, stato della pratica, numero tessera, anno di validità, associazione o club di riferimento e informazioni connesse al rapporto associativo;",
      "dati di accesso e account, incluse credenziali, token di autenticazione, log di accesso e informazioni tecniche strettamente collegate alla sicurezza dell'area riservata, ove applicabile;",
      "eventuale documento di identità e dati in esso contenuti, esclusivamente ove richiesto per attività di verifica, validazione o documentazione della pratica;",
      "dati tecnici di navigazione, log applicativi e cookie tecnici necessari al funzionamento del portale e dei servizi collegati.",
    ],
  },
  {
    title: "3. Finalità del trattamento",
    intro: "I dati personali sono trattati per finalità determinate, esplicite e legittime, tra cui:",
    bullets: [
      "gestione della richiesta di iscrizione socio online e delle relative verifiche preliminari;",
      "verifica dell'identità dell'interessato e della documentazione allegata, ove necessaria;",
      "costituzione, gestione e aggiornamento del rapporto associativo;",
      "emissione, attivazione, invio, verifica e gestione della tessera associativa digitale con assegnazione del numero tessera;",
      "tenuta del libro soci digitale, gestione organizzativa e amministrativa del rapporto e tracciamento dello stato dell'iscrizione;",
      "creazione e gestione delle credenziali di accesso all'area riservata, prevenzione di accessi non autorizzati e tutela della sicurezza dell'account;",
      "invio di comunicazioni strettamente operative, amministrative o di servizio legate all'iscrizione, alla tessera, ai documenti o allo stato del rapporto associativo;",
      "adempimento di obblighi previsti dalla normativa applicabile, nonche esigenze di tutela dei diritti del Titolare.",
    ],
  },
  {
    title: "4. Base giuridica",
    intro:
    "Le basi giuridiche non sono richiamate in modo generico, ma vengono collegate alle singole finalità di trattamento:",
    bullets: [
      "la gestione della richiesta di iscrizione, delle verifiche preliminari e dei contatti avviati dall'interessato si fonda sull'esecuzione di misure precontrattuali o comunque sulla gestione della richiesta dell'interessato;",
      "la gestione del rapporto associativo, dell'area riservata, del libro soci digitale, della tessera digitale e dei servizi connessi si fonda sull'esecuzione del rapporto associativo e dei servizi richiesti dall'interessato;",
      "gli adempimenti amministrativi, organizzativi, contabili o comunque imposti dalla normativa applicabile si fondano sull'adempimento di obblighi legali o regolamentari, ove applicabili;",
    "i log di sicurezza, i controlli tecnici, la prevenzione di abusi e la protezione del portale si fondano sul legittimo interesse del Titolare alla sicurezza dei sistemi, alla continuità operativa e alla difesa dei propri diritti;",
    "eventuali trattamenti facoltativi ulteriori potranno essere basati sul consenso solo se effettivamente richiesto con informativa e raccolta dedicate; il presente flusso di iscrizione non presenta, allo stato, finalità promozionali o newsletter opzionali.",
    ],
  },
  {
    title: "5. Natura del conferimento dei dati",
    paragraphs: [
      "Il conferimento dei dati contrassegnati come necessari nel flusso di iscrizione e indispensabile per istruire la richiesta, creare l'account, gestire il rapporto associativo, emettere la tessera digitale e mantenere aggiornato il libro soci digitale.",
      "Il mancato conferimento dei dati necessari può comportare l'impossibilità di completare l'iscrizione, di verificare correttamente la pratica, di attivare l'accesso all'area riservata o di erogare i servizi associativi richiesti.",
      "L'eventuale documento di identità è richiesto solo nei casi in cui sia necessario ai fini di verifica, validazione o documentazione della pratica; negli altri casi il mancato caricamento del documento non impedisce automaticamente il proseguimento se tale verifica non ? necessaria.",
    ],
  },
  {
    title: "6. Destinatari o categorie di destinatari",
    intro: "I dati possono essere comunicati, nei limiti strettamente pertinenti alle finalità sopra indicate, a:",
    bullets: [
      "personale interno, collaboratori e soggetti autorizzati dal Titolare che operano secondo istruzioni ricevute;",
      "fornitori di servizi tecnici e organizzativi, quali hosting, cloud, manutenzione applicativa, gestione infrastrutturale, servizi email, archiviazione documentale e strumenti di wallet o pass digitale, ove utilizzati;",
      "associazione, circolo o club di riferimento del socio, ove pertinente rispetto al modello organizzativo ASSONAM e nella misura necessaria per gestire iscrizione, validità della tessera e rapporto associativo;",
      "soggetti che trattano dati per conto del Titolare quali responsabili del trattamento ai sensi dell'art. 28 GDPR;",
      "autorita, enti pubblici o soggetti legittimati a ricevere i dati in forza di disposizioni di legge, regolamento o provvedimenti dell'autorita competente.",
    ],
  },
  {
    title: "7. Trasferimenti verso Paesi extra SEE",
    paragraphs: [
      "Il Titolare privilegia, ove possibile, fornitori e infrastrutture localizzati nello Spazio Economico Europeo. Tuttavia, alcuni servizi tecnici o componenti applicativi adottati per l'erogazione del portale potrebbero comportare trattamenti o accessi ai dati anche al di fuori dello SEE.",
      "Ove ci? avvenga, il trasferimento sarà gestito nel rispetto del GDPR, mediante decisioni di adeguatezza della Commissione europea, clausole contrattuali standard o altri strumenti di garanzia ritenuti idonei in relazione al servizio utilizzato.",
    ],
  },
  {
    title: "8. Periodo di conservazione",
    intro:
    "I dati sono conservati secondo criteri differenziati, proporzionati alla finalità perseguita e alla natura del rapporto con il socio:",
    bullets: [
      "i dati relativi alla richiesta di iscrizione sono conservati per il tempo necessario alla gestione della pratica, agli eventuali controlli successivi e alla tutela del Titolare in caso di contestazioni;",
      "i dati del rapporto associativo, del libro soci digitale, dell'account e della tessera associativa digitale sono trattati per la durata dell'anno associativo corrente e, al termine del relativo ciclo annuale, i dati non più necessari vengono cancellati o resi non identificativi insieme alla tessera associativa, salvo ulteriore conservazione strettamente necessaria per adempimenti amministrativi, organizzativi, fiscali o per la tutela dei diritti del Titolare;",
    "i log tecnici e di autenticazione sono conservati per tempi proporzionati alle finalità di sicurezza, prevenzione abusi e continuità operativa;",
    "la copia del documento di identità, quando richiesta, è conservata solo per il tempo strettamente necessario alla finalità di verifica o documentazione per cui è stata acquisita, salvo eventuali ulteriori obblighi di conservazione o esigenze di tutela giuridica.",
    ],
    note:
      "Il criterio di conservazione legato all'anno associativo deve riflettere l'effettiva organizzazione interna di ASSONAM e va confermato in sede legale e operativa prima della pubblicazione definitiva.",
  },
  {
    title: "9. Modalità del trattamento e misure di sicurezza",
    paragraphs: [
    "Il trattamento avviene mediante strumenti informatici, telematici e organizzativi adeguati alla natura dei dati trattati e alle finalità perseguite, secondo principi di liceità, correttezza, trasparenza, minimizzazione e limitazione della conservazione.",
      "Il Titolare adotta misure ragionevoli per limitare l'accesso ai dati ai soli soggetti autorizzati, nonche misure idonee a ridurre i rischi di perdita, distruzione, divulgazione non autorizzata, accesso abusivo o uso illecito dei dati personali.",
    ],
  },
  {
    title: "10. Diritti dell'interessato",
    intro:
      "Nei casi previsti dagli articoli 15 e seguenti del GDPR, l'interessato può esercitare i seguenti diritti:",
    bullets: [
      "ottenere conferma che sia o meno in corso un trattamento di dati personali che lo riguardano e accedere ai relativi dati;",
      "chiedere la rettifica dei dati inesatti o l'integrazione dei dati incompleti;",
      "chiedere la cancellazione dei dati nei casi consentiti dalla normativa;",
      "chiedere la limitazione del trattamento nei casi previsti dal GDPR;",
      "opporsi al trattamento nei casi in cui cio sia consentito dalla legge;",
      "ricevere i dati in formato strutturato, di uso comune e leggibile da dispositivo automatico e chiederne la trasmissione ad altro titolare, ove applicabile;",
    "revocare in qualsiasi momento l'eventuale consenso prestato, senza pregiudicare la liceità del trattamento precedente alla revoca, nei soli casi in cui il trattamento si fondi effettivamente sul consenso;",
      "proporre reclamo al Garante per la protezione dei dati personali.",
    ],
    note:
      `Per esercitare i propri diritti è possibile scrivere a ${CONTACT_DETAILS.email}. Il Titolare potr? richiedere informazioni aggiuntive strettamente necessarie a verificare l'identità del richiedente.`,
  },
  {
    title: "11. Cookie",
    paragraphs: [
      "Il portale utilizza cookie tecnici e strumenti analoghi necessari al corretto funzionamento delle pagine pubbliche, dell'area riservata, dell'autenticazione e delle funzioni essenziali del servizio.",
      "Per eventuali strumenti ulteriori o per aggiornamenti della configurazione tecnica potr? essere resa disponibile una informativa o cookie policy dedicata, ove necessaria.",
    ],
  },
] as const;

const Privacy = () => {
  useEffect(() => {
    applySeo({
      title: "Informativa privacy iscrizione soci",
      description:
        "Informativa ASSONAM sul trattamento dei dati personali per iscrizione soci, tessera digitale, area riservata e libro soci digitale.",
      canonicalPath: "/privacy",
    });
  }, []);

  return (
    <section className="py-16" data-reveal="fade-up">
      <div className="container-shell">
        <div className="surface-strong overflow-hidden p-8 md:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)] lg:items-start">
            <div className="max-w-4xl">
              <p className="section-title">Privacy</p>
              <h1 className="section-heading">Informativa sul trattamento dei dati personali</h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-neutral-600">
                Informativa resa ai sensi del Regolamento (UE) 2016/679 e della normativa italiana
                vigente per il trattamento dei dati personali effettuato tramite il portale ASSONAM
                dedicato all'iscrizione socio online, alla tessera associativa digitale, al libro
                soci digitale e all'accesso ai servizi riservati.
              </p>
            </div>

            <aside className="surface h-full p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Riferimenti
              </p>
              <dl className="mt-4 space-y-4">
                <div>
                  <dt className="text-xs uppercase tracking-[0.16em] text-neutral-400">Titolare</dt>
                  <dd className="mt-1 text-sm font-medium leading-6 text-neutral-900">
                    {CONTACT_DETAILS.organization}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.16em] text-neutral-400">Sede</dt>
                  <dd className="mt-1 text-sm leading-6 text-neutral-700">{CONTACT_DETAILS.address}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.16em] text-neutral-400">Contatti</dt>
                  <dd className="mt-1 space-y-1 text-sm leading-6 text-neutral-700">
                    <p>{CONTACT_DETAILS.email}</p>
                    <p>{CONTACT_DETAILS.phone}</p>
                  </dd>
                </div>
              </dl>
            </aside>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3" data-reveal="stagger">
            {HIGHLIGHTS.map((item) => (
              <article key={item.label} className="surface p-5" data-reveal-item>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  {item.label}
                </p>
                <p className="mt-3 text-sm leading-7 text-neutral-700">{item.value}</p>
              </article>
            ))}
          </div>

          <div className="mt-10 space-y-4" data-reveal="stagger">
            {SECTIONS.map((section) => (
              <article key={section.title} className="surface p-6 md:p-7" data-reveal-item>
                <h2 className="text-lg font-semibold text-neutral-900">{section.title}</h2>
                {section.intro ? (
                  <p className="mt-3 text-sm leading-7 text-neutral-600">{section.intro}</p>
                ) : null}
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="mt-3 text-sm leading-7 text-neutral-600">
                    {paragraph}
                  </p>
                ))}
                {section.bullets?.length ? (
                  <ul className="mt-4 space-y-2.5 text-sm leading-7 text-neutral-600">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-3">
                        <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/70" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {section.note ? (
                  <div className="mt-4 rounded-xl border border-brand/15 bg-brand/[0.04] px-4 py-3">
                    <p className="text-sm leading-7 text-neutral-700">{section.note}</p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200/70 pt-6">
            <p className="text-xs text-neutral-500">Ultimo aggiornamento: 14 marzo 2026</p>
            <div className="flex flex-wrap gap-3">
              <Link className="btn-ghost px-5 py-2.5" to="/contatti">
                Contatti
              </Link>
              <Link className="btn-ghost px-5 py-2.5" to="/">
                Torna alla home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Privacy;
