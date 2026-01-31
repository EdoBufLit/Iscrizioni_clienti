import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchOrganizationDetail, type OrganizationDetail } from "../lib/api";
import Skeleton from "../components/ui/Skeleton";

const AffiliazioneDettaglio = () => {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<OrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (slug) {
      setLoading(true);
      fetchOrganizationDetail(slug)
        .then(setData)
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }
  }, [slug]);

  if (loading) {
    return (
      <section className="py-16">
        <div className="container-shell">
          <Skeleton className="h-6 w-32 mb-6" />
          <div className="max-w-3xl">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-10 w-3/4 mb-2" />
            <Skeleton className="h-4 w-40 mb-5" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </section>
    );
  }

  if (error || !data) {
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

  const fullAddress = [
    data.address_line1,
    data.address_line2,
    [data.postal_code, data.city, data.province ? `(${data.province})` : null].filter(Boolean).join(" "),
    data.country
  ].filter(Boolean).join(", ");

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
          <div className="flex items-center gap-4 mb-4">
             {data.logo_url && (
                <div className="h-16 w-16 flex-shrink-0 rounded-lg bg-white p-1 border border-neutral-200 overflow-hidden">
                   <img src={data.logo_url} alt={data.name} className="h-full w-full object-contain" />
                </div>
             )}
             <div>
                 <h1 className="text-3xl font-semibold text-neutral-900 md:text-4xl">
                    {data.name}
                 </h1>
                 {(data.city || data.province) && (
                    <p className="mt-1 text-sm text-neutral-500">
                        {data.city} {data.province && `(${data.province})`}
                    </p>
                 )}
             </div>
          </div>

          {data.description && (
             <div className="mt-8 prose prose-neutral max-w-none text-neutral-600 whitespace-pre-wrap">
               {data.description}
             </div>
          )}
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {fullAddress && (
              <div className="surface p-7">
                <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                  Sede
                </h2>
                <p className="mt-3 text-sm leading-6 text-neutral-700">
                  {fullAddress}
                </p>
              </div>
            )}

            {(data.email || data.phone || data.website) && (
                <div className="surface p-7">
                    <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                      Contatti
                    </h2>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-700">
                        {data.email && (
                            <li>
                                <span className="text-neutral-500">Email:</span>{" "}
                                <a href={`mailto:${data.email}`} className="text-brand hover:underline">{data.email}</a>
                            </li>
                        )}
                        {data.phone && (
                            <li>
                                <span className="text-neutral-500">Telefono:</span>{" "}
                                <a href={`tel:${data.phone}`} className="text-brand hover:underline">{data.phone}</a>
                            </li>
                        )}
                         {data.website && (
                            <li>
                                <span className="text-neutral-500">Web:</span>{" "}
                                <a href={data.website.startsWith("http") ? data.website : `https://${data.website}`} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                                    {data.website}
                                </a>
                            </li>
                        )}
                    </ul>
                </div>
            )}
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
