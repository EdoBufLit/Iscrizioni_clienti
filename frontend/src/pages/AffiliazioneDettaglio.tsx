import { Link, useParams } from "react-router-dom";

const affiliations: Record<
  string,
  {
    name: string;
    city: string;
    province: string;
    category: string;
    description: string;
    sede: string;
    requisiti: string;
    documenti: string;
    tempi: string;
  }
> = {
  "lodi-artigiani": {
    name: "Associazione Artigiani Lodigiani",
    city: "Lodi",
    province: "LO",
    category: "Artigiani",
    description:
      "Supporto amministrativo e gestionale per botteghe e attività artigiane del territorio lodigiano. L'associazione offre assistenza nella gestione documentale, negli adempimenti e nell'accesso ai servizi dedicati agli artigiani affiliati.",
    sede: "Via Roma 12, 26900 Lodi (LO)",
    requisiti:
      "Titolarità o partecipazione in attività artigiana con sede nel territorio lodigiano.",
    documenti:
      "Documento di identità, codice fiscale, visura camerale o attestazione di attività.",
    tempi: "La richiesta viene elaborata entro 5 giorni lavorativi dalla ricezione dei documenti.",
  },
  "milano-commercianti": {
    name: "Unione Commercianti Milano Centro",
    city: "Milano",
    province: "MI",
    category: "Commercianti",
    description:
      "Servizi contabili e consulenza per imprese commerciali e realtà urbane nel cuore della città. L'unione supporta i commercianti associati con assistenza gestionale e percorsi di affiliazione strutturati.",
    sede: "Corso Buenos Aires 45, 20124 Milano (MI)",
    requisiti:
      "Titolarità di attività commerciale con sede operativa nell'area metropolitana di Milano.",
    documenti:
      "Documento di identità, codice fiscale, visura camerale, eventuale licenza commerciale.",
    tempi: "La richiesta viene elaborata entro 5 giorni lavorativi dalla ricezione dei documenti.",
  },
  "pavia-professionisti": {
    name: "Associazione Professionisti Pavia",
    city: "Pavia",
    province: "PV",
    category: "Professionisti",
    description:
      "Rete professionale con percorsi di adesione e documentazione guidata per studi e consulenti. L'associazione facilita la gestione amministrativa e l'accesso a servizi dedicati ai professionisti del territorio.",
    sede: "Strada Nuova 88, 27100 Pavia (PV)",
    requisiti:
      "Iscrizione a un albo professionale o titolarità di studio/attività di consulenza.",
    documenti:
      "Documento di identità, codice fiscale, attestazione di iscrizione all'albo o partita IVA.",
    tempi: "La richiesta viene elaborata entro 7 giorni lavorativi dalla ricezione dei documenti.",
  },
  "cremona-artigiani": {
    name: "Confederazione Artigiana Cremona",
    city: "Cremona",
    province: "CR",
    category: "Artigiani",
    description:
      "Gestione associativa e supporto operativo per imprese artigiane con sportelli territoriali dedicati. La confederazione offre percorsi di adesione strutturati e assistenza continuativa.",
    sede: "Via Palestro 30, 26100 Cremona (CR)",
    requisiti:
      "Titolarità o partecipazione in impresa artigiana con sede nella provincia di Cremona.",
    documenti:
      "Documento di identità, codice fiscale, visura camerale o attestazione di attività.",
    tempi: "La richiesta viene elaborata entro 5 giorni lavorativi dalla ricezione dei documenti.",
  },
  "bergamo-commercianti": {
    name: "Associazione Commercianti Bergamo",
    city: "Bergamo",
    province: "BG",
    category: "Commercianti",
    description:
      "Assistenza per attività commerciali e adesioni digitali con documentazione standardizzata. L'associazione supporta i commercianti nella gestione degli adempimenti e nella raccolta documentale.",
    sede: "Via Tiraboschi 15, 24121 Bergamo (BG)",
    requisiti:
      "Titolarità di attività commerciale con sede nella provincia di Bergamo.",
    documenti:
      "Documento di identità, codice fiscale, visura camerale, eventuale licenza commerciale.",
    tempi: "La richiesta viene elaborata entro 5 giorni lavorativi dalla ricezione dei documenti.",
  },
  "lodi-professionisti": {
    name: "Forum Professionisti Lodi",
    city: "Lodi",
    province: "LO",
    category: "Professionisti",
    description:
      "Iscrizioni tracciabili e gestione dei documenti per i professionisti affiliati del territorio. Il forum offre un percorso di adesione guidato con assistenza nella raccolta della documentazione.",
    sede: "Piazza della Vittoria 5, 26900 Lodi (LO)",
    requisiti:
      "Esercizio di attività professionale con sede o domicilio nel territorio lodigiano.",
    documenti:
      "Documento di identità, codice fiscale, attestazione professionale o partita IVA.",
    tempi: "La richiesta viene elaborata entro 7 giorni lavorativi dalla ricezione dei documenti.",
  },
  "milano-artigiani": {
    name: "Artigiani Metropolitani Milano",
    city: "Milano",
    province: "MI",
    category: "Artigiani",
    description:
      "Percorsi di adesione uniformi e consulenza fiscale per attività artigiane metropolitane. L'associazione gestisce le pratiche di affiliazione e offre supporto operativo continuativo.",
    sede: "Via Torino 70, 20123 Milano (MI)",
    requisiti:
      "Titolarità o partecipazione in attività artigiana nell'area metropolitana di Milano.",
    documenti:
      "Documento di identità, codice fiscale, visura camerale o attestazione di attività.",
    tempi: "La richiesta viene elaborata entro 5 giorni lavorativi dalla ricezione dei documenti.",
  },
  "pavia-commercianti": {
    name: "Commercianti Pavia Sud",
    city: "Pavia",
    province: "PV",
    category: "Commercianti",
    description:
      "Supporto per attività locali con gestione ordinata delle iscrizioni e assistenza continuativa. L'associazione cura il percorso di adesione e la raccolta documentale per i commercianti del territorio.",
    sede: "Viale Libertà 22, 27100 Pavia (PV)",
    requisiti:
      "Titolarità di attività commerciale con sede nella provincia di Pavia.",
    documenti:
      "Documento di identità, codice fiscale, visura camerale, eventuale licenza commerciale.",
    tempi: "La richiesta viene elaborata entro 5 giorni lavorativi dalla ricezione dei documenti.",
  },
};

const infoItems: { label: string; key: "sede" | "requisiti" | "documenti" | "tempi" }[] = [
  { label: "Sede", key: "sede" },
  { label: "Requisiti", key: "requisiti" },
  { label: "Documenti richiesti", key: "documenti" },
  { label: "Tempi di elaborazione", key: "tempi" },
];

const AffiliazioneDettaglio = () => {
  const { slug } = useParams<{ slug: string }>();
  const data = slug ? affiliations[slug] : undefined;

  if (!data) {
    return (
      <section className="py-16">
        <div className="container-shell">
          <div className="surface max-w-2xl p-7">
            <h1 className="text-base font-semibold text-neutral-900">
              Associazione non trovata
            </h1>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              L'associazione richiesta non è disponibile o il collegamento non è
              corretto.
            </p>
            <div className="mt-5">
              <Link className="btn-primary" to="/associazioni">
                Torna all'elenco
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16">
      <div className="container-shell">
        <div className="mb-6">
          <Link
            className="text-sm font-medium text-neutral-500 transition hover:text-neutral-800"
            to="/associazioni"
          >
            Associazioni
          </Link>
          <span className="mx-2 text-sm text-neutral-300">/</span>
          <span className="text-sm font-medium text-neutral-700">
            {data.name}
          </span>
        </div>

        <div className="max-w-3xl">
          <p className="text-xs font-medium text-neutral-400">
            {data.category}
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-neutral-900 md:text-4xl">
            {data.name}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {data.city} ({data.province})
          </p>
          <p className="mt-5 text-base leading-7 text-neutral-600">
            {data.description}
          </p>
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          {infoItems.map((item) => (
            <div key={item.key} className="surface p-7">
              <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                {item.label}
              </h2>
              <p className="mt-3 text-sm leading-6 text-neutral-700">
                {data[item.key]}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 surface p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">
                Procedi con l'iscrizione
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Compila il modulo, carica i documenti richiesti e invia la
                richiesta.
              </p>
            </div>
            <Link
              className="btn-primary shrink-0"
              to={`/associazioni/${slug}/iscrizione`}
            >
              Iscriviti e ottieni la tessera
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AffiliazioneDettaglio;
