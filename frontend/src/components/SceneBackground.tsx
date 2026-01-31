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
          "linear-gradient(135deg, #f7f8fa 0%, #faf9f7 40%, #eef0ec 100%)",
          "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(31,75,122,0.06) 0%, transparent 70%)",
          "radial-gradient(ellipse 60% 50% at 80% 100%, rgba(138,152,128,0.06) 0%, transparent 70%)",
        ].join(", "),
      }}
    />

    {/* 2. Glow blobs */}
    <div
      className="absolute -left-[10%] -top-[15%] h-[55vh] w-[55vh] rounded-full"
      style={{
        background:
          "radial-gradient(circle, rgba(31,75,122,0.09) 0%, rgba(31,75,122,0.03) 40%, transparent 70%)",
        filter: "blur(70px)",
      }}
    />
    <div
      className="absolute -right-[5%] top-[30%] h-[45vh] w-[45vh] rounded-full"
      style={{
        background:
          "radial-gradient(circle, rgba(138,152,128,0.10) 0%, rgba(138,152,128,0.03) 40%, transparent 70%)",
        filter: "blur(60px)",
      }}
    />
    <div
      className="absolute bottom-[5%] left-[35%] h-[35vh] w-[50vh] rounded-full"
      style={{
        background:
          "radial-gradient(circle, rgba(41,92,148,0.06) 0%, transparent 65%)",
        filter: "blur(80px)",
      }}
    />

    {/* 3. Subtle dot grid overlay */}
    <div
      className="absolute inset-0 opacity-[0.35]"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(31,75,122,0.12) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    />
  </div>
);

export default SceneBackground;
