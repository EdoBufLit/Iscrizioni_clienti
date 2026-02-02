/**
 * Decorative scenic background rendered behind all page content.
 * Layers: base gradient → glow blobs → dot-grid overlay.
 * Pure CSS — no JS animation, no layout impact.
 */
const SceneBackground = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
  >
    {/* 1. Base gradient wash */}
    <div
      className="absolute inset-0"
      style={{
        background: [
          "linear-gradient(135deg, #fdfcf9 0%, #f6f3ee 45%, #fbfaf7 100%)",
          "radial-gradient(ellipse 90% 70% at 10% 0%, rgba(198,160,79,0.10) 0%, transparent 65%)",
          "radial-gradient(ellipse 70% 60% at 85% 20%, rgba(15,61,58,0.10) 0%, transparent 70%)",
          "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(210,112,90,0.08) 0%, transparent 70%)",
        ].join(", "),
      }}
    />

    {/* 2. Glow blobs */}
    <div
      className="absolute -left-[12%] -top-[18%] h-[60vh] w-[60vh] rounded-full animate-float-slow"
      style={{
        background:
          "radial-gradient(circle, rgba(198,160,79,0.18) 0%, rgba(198,160,79,0.05) 45%, transparent 70%)",
        filter: "blur(70px)",
      }}
    />
    <div
      className="absolute -right-[8%] top-[18%] h-[48vh] w-[48vh] rounded-full animate-float"
      style={{
        background:
          "radial-gradient(circle, rgba(15,61,58,0.18) 0%, rgba(15,61,58,0.05) 45%, transparent 72%)",
        filter: "blur(60px)",
      }}
    />
    <div
      className="absolute bottom-[2%] left-[28%] h-[42vh] w-[55vh] rounded-full animate-soft-pulse"
      style={{
        background:
          "radial-gradient(circle, rgba(210,112,90,0.14) 0%, transparent 65%)",
        filter: "blur(80px)",
      }}
    />

    {/* 3. Subtle dot grid overlay */}
    <div
      className="absolute inset-0 opacity-[0.25]"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(15,61,58,0.15) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }}
    />
  </div>
);

export default SceneBackground;
