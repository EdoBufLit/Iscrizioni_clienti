import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

const InvitoAffiliazioneRedirect = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();

  useEffect(() => {
    const normalizedSlug = (slug || "").trim().toLowerCase();
    if (!normalizedSlug) {
      navigate("/affiliazione", { replace: true });
      return;
    }
    navigate(`/affiliazione?ref=${encodeURIComponent(normalizedSlug)}`, {
      replace: true,
    });
  }, [navigate, slug]);

  return (
    <section className="py-16" data-reveal="fade-up">
      <div className="container-shell">
        <div className="surface-strong mx-auto max-w-xl p-8 text-center md:p-10">
          <p className="section-title">Invito associazione</p>
          <h1 className="section-heading">Reindirizzamento in corso</h1>
          <p className="mt-4 text-sm leading-7 text-neutral-600">
            Ti stiamo portando al percorso di affiliazione.
          </p>
        </div>
      </div>
    </section>
  );
};

export default InvitoAffiliazioneRedirect;
