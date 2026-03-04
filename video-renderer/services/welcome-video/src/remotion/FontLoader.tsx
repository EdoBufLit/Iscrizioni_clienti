import { staticFile } from "remotion";

export const FontLoader: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <>
      <style>
        {`
          @font-face {
            font-family: 'Inter';
            src: url('${staticFile("fonts/Inter-Regular.woff2")}') format('woff2');
            font-weight: 400;
            font-style: normal;
          }
          @font-face {
            font-family: 'Inter';
            src: url('${staticFile("fonts/Inter-SemiBold.woff2")}') format('woff2');
            font-weight: 600;
            font-style: normal;
          }
          @font-face {
            font-family: 'Inter';
            src: url('${staticFile("fonts/Inter-Bold.woff2")}') format('woff2');
            font-weight: 700;
            font-style: normal;
          }
          @font-face {
            font-family: 'Inter';
            src: url('${staticFile("fonts/Inter-ExtraBold.woff2")}') format('woff2');
            font-weight: 800;
            font-style: normal;
          }
        `}
      </style>
      <div style={{ fontFamily: "'Inter', system-ui, 'Segoe UI', Arial, sans-serif" }}>
        {children}
      </div>
    </>
  );
};
