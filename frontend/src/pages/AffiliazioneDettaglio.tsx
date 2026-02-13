import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchOrganizationDetail, type OrganizationDetail } from "../lib/api";
import { applySeo } from "../lib/seo";
import Skeleton from "../components/ui/Skeleton";

const AffiliazioneDettaglio = () => {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<OrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetchOrganizationDetail(slug)
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!data) return;
    applySeo({
      title: data.name,
      description: data.description
        ? data.description.slice(0, 155)
        : `Dettagli e iscrizione all'associazione ${data.name} affiliata ad ASSONAM.`,
      canonicalPath: `/associazioni/${slug}`,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: data.name,
        url: `https://assonam.it/associazioni/${slug}`,
        ...(data.email && { email: data.email }),
        ...(data.phone && { telephone: data.phone }),
        ...(data.city && {
          address: {
            "@type": "PostalAddress",
            addressLocality: data.city,
            ...(data.province && { addressRegion: data.province }),
            addressCountry: "IT",
          },
        }),
      },
    });
  }, [data, slug]);

  if (loading) {
    return (
      <section className="py-16">
        <div className="container-shell">
          <div className="surface-strong p-8 md:p-10">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="mt-4 h-10 w-2/3" />
            <Skeleton className="mt-4 h-5 w-52" />
            <Skeleton className="mt-6 h-32 w-full" />
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
            <h1 className="text-lg font-semibold text-neutral-900">Associazione non trovata</h1>
            <p className="mt-3 text-sm leading-7 text-neutral-600">
              L'associazione richiesta non e disponibile oppure il collegamento non e corretto.
            </p>
            <div className="mt-6">
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
    [data.postal_code, data.city, data.province ? `(${data.province})` : null]
      .filter(Boolean)
      .join(" "),
    data.country,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section className="py-16" data-reveal="fade-up">
      <div className="container-shell">
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <Link className="text-neutral-500 transition hover:text-neutral-800" to="/associazioni">
            Associazioni
          </Link>
          <span className="text-neutral-300">/</span>
          <span className="font-medium text-neutral-700">{data.name}</span>
        </div>

        <div className="surface-strong p-8 md:p-10">
          <div className="flex flex-col gap-7 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-4">
                {data.logo_url && (
                  <div className="h-16 w-16 overflow-hidden rounded-xl border border-white/70 bg-white p-1">
                    <img
                      src={data.logo_url}
                      alt={data.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-contain"
                    />
                  </div>
                )}
                <div>
                  <h1 className="text-3xl font-semibold text-neutral-900 md:text-4xl">{data.name}</h1>
                  {(data.city || data.province) && (
                    <p className="mt-1 text-sm text-neutral-500">
                      {data.city}
                      {data.province ? ` (${data.province})` : ""}
                    </p>
                  )}
                </div>
              </div>

              {data.description && (
                <p className="mt-6 whitespace-pre-wrap text-sm leading-8 text-neutral-600">
                  {data.description}
                </p>
              )}
            </div>

            <Link className="btn-primary px-6 py-3" to={`/associazioni/${slug}/iscrizione`}>
              Iscriviti ora
            </Link>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3" data-reveal="stagger">
            {fullAddress && (
              <article className="surface p-6" data-reveal-item>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Sede
                </p>
                <p className="mt-3 text-sm leading-7 text-neutral-700">{fullAddress}</p>
              </article>
            )}

            {(data.email || data.phone || data.website) && (
              <article className="surface p-6" data-reveal-item>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Contatti
                </p>
                <ul className="mt-3 space-y-2 text-sm leading-7 text-neutral-700">
                  {data.email && (
                    <li>
                      Email:{" "}
                      <a href={`mailto:${data.email}`} className="text-brand hover:underline">
                        {data.email}
                      </a>
                    </li>
                  )}
                  {data.phone && (
                    <li>
                      Telefono:{" "}
                      <a href={`tel:${data.phone}`} className="text-brand hover:underline">
                        {data.phone}
                      </a>
                    </li>
                  )}
                  {data.website && (
                    <li>
                      Web:{" "}
                      <a
                        href={data.website.startsWith("http") ? data.website : `https://${data.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:underline"
                      >
                        {data.website}
                      </a>
                    </li>
                  )}
                </ul>
              </article>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AffiliazioneDettaglio;
