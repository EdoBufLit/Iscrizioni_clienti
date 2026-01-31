const DashboardDocuments = () => {
  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Documenti</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Documenti disponibili relativi all'iscrizione e all'attività
        associativa.
      </p>

      {/* Empty state */}
      <div className="surface mt-8 overflow-hidden">
        <div className="flex flex-col items-center px-7 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-50">
            <svg
              className="h-6 w-6 text-neutral-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
            </svg>
          </div>
          <p className="mt-5 text-base font-semibold text-neutral-900">
            Nessun documento disponibile
          </p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-neutral-500">
            I documenti saranno visibili in questa sezione una volta confermata
            l'iscrizione e completata la pratica.
          </p>
        </div>
      </div>

      {/* Guidance */}
      <div className="mt-6 rounded-lg border border-neutral-100 bg-neutral-25 px-7 py-5">
        <div className="flex gap-4">
          <svg
            className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-neutral-700">
              Come funziona
            </p>
            <p className="mt-1 text-sm leading-6 text-neutral-500">
              Al termine della verifica, lo studio renderà disponibili in questa
              area la tessera associativa, le ricevute e gli eventuali documenti
              integrativi. Non è necessaria alcuna azione da parte tua.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardDocuments;
