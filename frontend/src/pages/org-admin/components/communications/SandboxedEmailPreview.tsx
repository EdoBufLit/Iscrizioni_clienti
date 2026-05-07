type SandboxedEmailPreviewProps = {
  html: string;
  title: string;
  className?: string;
};

export default function SandboxedEmailPreview({
  html,
  title,
  className = "min-h-[36rem] w-full border-0 bg-white",
}: SandboxedEmailPreviewProps) {
  return (
    <iframe
      title={title}
      srcDoc={html}
      sandbox=""
      referrerPolicy="no-referrer"
      className={className}
    />
  );
}
