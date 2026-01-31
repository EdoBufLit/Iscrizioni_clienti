import { ChangeEvent, useMemo, useState } from "react";

const affiliations = [
  { name: "Associazione Artigiani Lodigiani", province: "LO", category: "Artigiani", members: 34, status: "Attiva" },
  { name: "Unione Commercianti Milano Centro", province: "MI", category: "Commercianti", members: 61, status: "Attiva" },
  { name: "Associazione Professionisti Pavia", province: "PV", category: "Professionisti", members: 22, status: "Attiva" },
  { name: "Confederazione Artigiana Cremona", province: "CR", category: "Artigiani", members: 18, status: "Attiva" },
  { name: "Associazione Commercianti Bergamo", province: "BG", category: "Commercianti", members: 45, status: "Attiva" },
  { name: "Forum Professionisti Lodi", province: "LO", category: "Professionisti", members: 11, status: "Attiva" },
  { name: "Artigiani Metropolitani Milano", province: "MI", category: "Artigiani", members: 29, status: "Attiva" },
  { name: "Commercianti Pavia Sud", province: "PV", category: "Commercianti", members: 15, status: "Attiva" },
];

const thClass =
  "px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.15em] text-neutral-400";
const tdClass = "px-4 py-3 text-sm text-neutral-700";

const AdminAffiliations = () => {
  const [search, setSearch] = useState("");

  const results = useMemo(() => {
    const q = search.toLowerCase();
    return affiliations.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.province.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [search]);

  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Affiliazioni</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Elenco delle associazioni affiliate e relativo stato.
      </p>

      <div className="mt-8">
        <input
          className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-neutral-300 md:max-w-xs"
          type="search"
          placeholder="Cerca per nome, provincia o categoria..."
          value={search}
          onChange={handleSearch}
        />
      </div>

      <div className="surface mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-neutral-100">
              <tr>
                <th className={thClass}>Nome</th>
                <th className={thClass}>Provincia</th>
                <th className={thClass}>Categoria</th>
                <th className={`${thClass} text-right`}>Iscritti</th>
                <th className={thClass}>Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-500">
                    Nessuna affiliazione corrisponde alla ricerca.
                  </td>
                </tr>
              ) : (
                results.map((item) => (
                  <tr
                    key={item.name}
                    className="transition hover:bg-neutral-25"
                  >
                    <td className={`${tdClass} font-medium text-neutral-900`}>
                      {item.name}
                    </td>
                    <td className={tdClass}>{item.province}</td>
                    <td className={tdClass}>{item.category}</td>
                    <td className={`${tdClass} text-right`}>{item.members}</td>
                    <td className={tdClass}>
                      <span className="inline-block rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
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

      <p className="mt-4 text-xs text-neutral-400">
        {results.length === 1
          ? "1 affiliazione"
          : `${results.length} affiliazioni`}
      </p>
    </div>
  );
};

export default AdminAffiliations;
