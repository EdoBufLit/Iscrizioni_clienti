type CardIdentity = {
  card_no?: number | null;
  card_number?: number | null;
  card_namespace?: string | null;
  card_number_label?: string | null;
};

export function displayCardNumber(card: CardIdentity): string | null {
  const label = card.card_number_label?.trim();
  if (label) return label;
  const number = card.card_number ?? card.card_no;
  return number == null ? null : `${number}${card.card_namespace === "paper_exception" ? "*" : ""}`;
}
