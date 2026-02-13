import { useId, useState } from "react";

export type PublicFaqItem = {
  question: string;
  answer: string;
};

type Props = {
  items: PublicFaqItem[];
};

const PublicFaqAccordion = ({ items }: Props) => {
  const [openIndex, setOpenIndex] = useState(0);
  const baseId = useId();

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const panelId = `${baseId}-panel-${index}`;
        const buttonId = `${baseId}-button-${index}`;

        return (
          <article key={item.question} className="public-faq-item surface">
            <h3>
              <button
                id={buttonId}
                className="public-faq-button"
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() =>
                  setOpenIndex((current) => (current === index ? -1 : index))
                }
              >
                <span>{item.question}</span>
                <span className="public-faq-icon" aria-hidden="true">
                  {isOpen ? "−" : "+"}
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              className={`public-faq-answer${isOpen ? " is-open" : ""}`}
            >
              <div>
                <p className="public-faq-answer-text">{item.answer}</p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};

export default PublicFaqAccordion;
