import { ChangeEvent, useMemo, useState } from "react";

type Affiliation = {
  name: string;
  province: string;
  category: string;
  members: number;
  status: "Attiva" | "Sospesa" | "In revisione";
};

const affiliations: Affiliation[] = [
  { name: "Associazione Artigiani Lodigiani", province: "LO", category: "Artigiani", members: 34, status: "Attiva" },
  { name: "Unione Commercianti Milano Centro", province: "MI", category: "Commercianti", members: 61, status: "Attiva" },
  { name: "Associazione Professionisti Pavia", province: "PV", category: "Professionisti", members: 22, status: "Attiva" },
  { name: "Confederazione Artigiana Cremona", province: "CR", category: "Artigiani", members: 18, status: "Attiva" },
  { name: "Associazione Commercianti Bergamo", province: "BG", category: "Commercianti", members: 45, status: "Attiva" },
  { name: "Forum Professionisti Lodi", province: "LO", category: "Professionisti", members: 11, status: "Attiva" },
  { name: "Artigiani Metropolitani Milano", province: "MI", category: "Artigiani", members: 29, status: "Attiva" },
  { name: "Commercianti Pavia Sud", province: "PV", category: "Commercianti", members: 15, status: "Attiva" },
];

const STATUS_CHIP: Record<string, string> = {
  Attiva: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Sospesa: "border-amber-200 bg-amber-50 text-amber-700",
  "In revisione": "border-blue-200 bg-blue-50 text-blue-700",
};

const categories = [...new Set(affiliations.map((a) => a.category))].sort();

const thClass =
  "px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-400";
const tdClass = "px-5 py-3.5 text-sm text-neutral-700";

const AdminAffiliations = () => {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  const results = useMemo(() => {
    const q = search.toLowerCase();
    return affiliations.filter((item) => {
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.province.toLowerCase().includes(q);
      const matchesCategory = !category || item.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [search, category]);

  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Affiliazioni</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Elenco delle associazioni affiliate e relativo stato.
      </p>

      {/* Filters surface */}
      <div className="mt-8 surface px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              className="w-full rounded-md border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-neutral-800 placeholder:text-neutral-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 sm:max-w-xs"
              type="search"
              placeholder="Cerca per nome o provincia…"
              value={search}
              onChange={handleSearch}
            />
          </div>
          <select
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 sm:w-44"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Tutte le categorie</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <p className="text-xs text-neutral-400 sm:ml-auto">
            {results.length === 1
              ? "1 risultato"
              : `${results.length} risultati`}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="surface mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-white/60 bg-white/40">
              <tr>
                <th className={thClass}>Nome</th>
                <th className={thClass}>Provincia</th>
                <th className={thClass}>Categoria</th>
                <th className={`${thClass} text-right`}>Iscritti</th>
                <th className={thClass}>Stato</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-sm text-neutral-500"
                  >
                    Nessuna affiliazione corrisponde ai filtri impostati.
                  </td>
                </tr>
              ) : (
                results.map((item, i) => (
                  <tr
                    key={item.name}
                    className={`transition hover:bg-brand/[0.02] ${
                      i % 2 === 1 ? "bg-white/30" : ""
                    }`}
                  >
                    <td className={`${tdClass} font-medium text-neutral-900`}>
                      {item.name}
                    </td>
                    <td className={tdClass}>
                      <span className="inline-flex items-center rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600">
                        {item.province}
                      </span>
                    </td>
                    <td className={tdClass}>{item.category}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>
                      {item.members}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          STATUS_CHIP[item.status] ?? "border-neutral-200 bg-neutral-50 text-neutral-600"
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminAffiliations;
