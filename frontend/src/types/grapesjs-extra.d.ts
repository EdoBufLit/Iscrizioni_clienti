declare module "grapesjs-mjml" {
  const plugin: (editor: unknown, options?: Record<string, unknown>) => void;
  export default plugin;
}

declare module "mjml-browser" {
  type MjmlResult = {
    html: string;
    errors?: Array<Record<string, unknown>>;
    json?: Record<string, unknown>;
  };

  const mjml2html: (
    input: string,
    options?: Record<string, unknown>,
  ) => MjmlResult;

  export default mjml2html;
}
