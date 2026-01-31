const DashboardDocuments = () => {
  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">Documenti</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Documenti disponibili relativi all'iscrizione e all'attività
        associativa.
      </p>

      <div className="surface mt-8 p-7">
        <p className="text-base font-semibold text-neutral-900">
          Nessun documento disponibile
        </p>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          I documenti saranno visibili in questa sezione una volta confermata
          l'iscrizione e completata la pratica.
        </p>
      </div>
    </div>
  );
};

export default DashboardDocuments;
