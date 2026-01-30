import { ChangeEvent, useMemo, useState } from "react";
import AffiliationCard from "../components/AffiliationCard";

const affiliations = [
  {
    slug: "lodi-artigiani",
    name: "Associazione Artigiani Lodigiani",
    city: "Lodi",
    province: "LO",
    category: "Artigiani",
    description:
      "Supporto amministrativo e gestionale per botteghe e attività artigiane del territorio lodigiano.",
  },
  {
    slug: "milano-commercianti",
    name: "Unione Commercianti Milano Centro",
    city: "Milano",
    province: "MI",
    category: "Commercianti",
    description:
      "Servizi contabili e consulenza per imprese commerciali e realtà urbane nel cuore della città.",
  },
  {
    slug: "pavia-professionisti",
    name: "Associazione Professionisti Pavia",
    city: "Pavia",
    province: "PV",
    category: "Professionisti",
    description:
      "Rete professionale con percorsi di adesione e documentazione guidata per studi e consulenti.",
  },
  {
    slug: "cremona-artigiani",
    name: "Confederazione Artigiana Cremona",
    city: "Cremona",
    province: "CR",
    category: "Artigiani",
    description:
      "Gestione associativa e supporto operativo per imprese artigiane con sportelli territoriali dedicati.",
  },
  {
    slug: "bergamo-commercianti",
    name: "Associazione Commercianti Bergamo",
    city: "Bergamo",
    province: "BG",
    category: "Commercianti",
    description:
      "Assistenza per attività commerciali e adesioni digitali con documentazione standardizzata.",
  },
  {
    slug: "lodi-professionisti",
    name: "Forum Professionisti Lodi",
    city: "Lodi",
    province: "LO",
    category: "Professionisti",
    description:
      "Iscrizioni tracciabili e gestione dei documenti per i professionisti affiliati del territorio.",
  },
  {
    slug: "milano-artigiani",
    name: "Artigiani Metropolitani Milano",
    city: "Milano",
    province: "MI",
    category: "Artigiani",
    description:
      "Percorsi di adesione uniformi e consulenza fiscale per attività artigiane metropolitane.",
  },
  {
    slug: "pavia-commercianti",
    name: "Commercianti Pavia Sud",
    city: "Pavia",
    province: "PV",
    category: "Commercianti",
    description:
      "Supporto per attività locali con gestione ordinata delle iscrizioni e assistenza continuativa.",
  },
];

const provinces = ["Tutte", "LO", "MI", "PV", "CR", "BG"] as const;
const categories = ["Tutte", "Artigiani", "Commercianti", "Professionisti"] as const;

const Associazioni = () => {
  const [search, setSearch] = useState("");
  const [province, setProvince] = useState("Tutte");
  const [category, setCategory] = useState("Tutte");

  const results = useMemo(() => {
    return affiliations.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.city.toLowerCase().includes(search.toLowerCase());
      const matchesProvince = province === "Tutte" || item.province === province;
      const matchesCategory = category === "Tutte" || item.category === category;
      return matchesSearch && matchesProvince && matchesCategory;
    });
  }, [search, province, category]);

  const handleSearch = (event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
  };

  const handleReset = () => {
    setSearch("");
    setProvince("Tutte");
    setCategory("Tutte");
  };

  return (
    <section className="py-12">
      <div className="container-shell">
        <div className="max-w-3xl">
          <p className="section-title">AFFILIAZIONI</p>
          <h1 className="section-heading">Trova la tua associazione</h1>
          <p className="section-subtitle">
            Seleziona l’affiliata corretta per avviare l’iscrizione o accedere ai servizi dedicati.
          </p>
        </div>

        <div className="surface mt-8">
          <div className="flex flex-col gap-4 p-6 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Ricerca
              </label>
              <input
                className="mt-2 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
                type="search"
                placeholder="Cerca per nome, città…"
                value={search}
                onChange={handleSearch}
              />
            </div>
            <div className="w-full md:w-44">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Provincia
              </label>
              <select
                className="mt-2 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
                value={province}
                onChange={(event) => setProvince(event.target.value)}
              >
                {provinces.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full md:w-56">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Categoria
              </label>
              <select
                className="mt-2 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {categories.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="text-left text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 transition hover:text-neutral-800"
              type="button"
              onClick={handleReset}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between text-sm text-neutral-500">
          <p className="font-medium text-neutral-700">{results.length} risultati</p>
        </div>

        {results.length === 0 ? (
          <div className="surface mt-6 p-6">
            <h3 className="text-lg font-semibold text-neutral-900">Nessun risultato</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Prova a modificare i filtri o a cercare un’altra località.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {results.map((item) => (
              <AffiliationCard key={item.slug} {...item} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default Associazioni;
