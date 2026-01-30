import { Link } from "react-router-dom";

type AffiliationCardProps = {
  slug: string;
  name: string;
  city: string;
  province: string;
  category: string;
  description: string;
};

const AffiliationCard = ({
  slug,
  name,
  city,
  province,
  category,
  description,
}: AffiliationCardProps) => {
  return (
    <Link
      to={`/associazioni/${slug}`}
      className="surface flex h-full flex-col justify-between border border-neutral-200 p-6 transition hover:border-neutral-300 hover:bg-neutral-50"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
          {category}
        </p>
        <h3 className="mt-3 text-lg font-semibold text-neutral-900">{name}</h3>
        <p className="mt-2 text-sm font-medium text-neutral-500">
          {city} ({province})
        </p>
        <p className="mt-3 text-sm leading-6 text-neutral-600 line-clamp-2">
          {description}
        </p>
      </div>
      <div className="mt-6 text-sm font-semibold text-brand">
        Dettagli e iscrizione →
      </div>
    </Link>
  );
};

export default AffiliationCard;
