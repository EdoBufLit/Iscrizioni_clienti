import { Fragment, type ReactNode } from "react";
import { communicationStyles, validateCommunicationDocument, type CommunicationDocument, type CommunicationSpan } from "../lib/communicationContent";
import "./CommunicationContent.css";

function Inline({ span }: { span: CommunicationSpan }) {
  let content: ReactNode = span.text;
  if (span.bold) content = <strong>{content}</strong>;
  if (span.italic) content = <em>{content}</em>;
  if (span.underline) content = <u>{content}</u>;
  if (span.highlight) content = <mark>{content}</mark>;
  if (span.href) content = <a href={span.href} target="_blank" rel="noopener noreferrer">{content}</a>;
  return content;
}

export default function CommunicationContent({ body, document }: { body: string; document?: CommunicationDocument | null }) {
  const valid = validateCommunicationDocument(document);
  if (!valid) return <div className="central-comms__body">{body}</div>;
  const nodes: ReactNode[] = [];
  for (let i = 0; i < valid.blocks.length; i++) {
    const block = valid.blocks[i];
    if (block.type === "image") {
      nodes.push(<figure key={i}><img src={block.src} alt={block.alt} loading="lazy" referrerPolicy="no-referrer" /><figcaption>{block.alt}</figcaption></figure>);
      continue;
    }
    const contents = block.spans.map((span, index) => <Fragment key={index}><Inline span={span} /></Fragment>);
    if (block.type === "bullet" || block.type === "ordered") {
      const items = [<li key={i}>{contents}</li>];
      while (i + 1 < valid.blocks.length && valid.blocks[i + 1].type === block.type) {
        const next = valid.blocks[++i];
        if (next.type !== "image") items.push(<li key={i}>{next.spans.map((span, index) => <Inline key={index} span={span} />)}</li>);
      }
      nodes.push(block.type === "bullet" ? <ul key={i}>{items}</ul> : <ol key={i}>{items}</ol>);
    } else nodes.push(block.type === "heading" ? <h3 key={i}>{contents}</h3> : block.type === "quote" ? <blockquote key={i}>{contents}</blockquote> : <p key={i}>{contents.length ? contents : <br />}</p>);
  }
  return <div className={`platform-message platform-message--${valid.style}`}>
    {valid.style !== "standard" && <span className="platform-message__category">{communicationStyles[valid.style]}</span>}
    {nodes}
  </div>;
}
