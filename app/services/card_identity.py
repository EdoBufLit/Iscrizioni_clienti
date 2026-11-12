"""Persisted card namespaces keep imported paper references out of stock."""

DIGITAL_CARD_NAMESPACE = "digital"
PAPER_CARD_NAMESPACE = "paper_exception"
CARD_NAMESPACES = frozenset((DIGITAL_CARD_NAMESPACE, PAPER_CARD_NAMESPACE))


def card_namespace(card) -> str:
    return getattr(card, "card_namespace", None) or DIGITAL_CARD_NAMESPACE


def format_card_number_label(number, namespace: str = DIGITAL_CARD_NAMESPACE) -> str | None:
    if number is None:
        return None
    return f"{number}{'*' if namespace == PAPER_CARD_NAMESPACE else ''}"


def card_number_label(card) -> str | None:
    return format_card_number_label(getattr(card, "card_no", None), card_namespace(card))


def card_number_for_render(card):
    """Keep existing digital renderer inputs unchanged, label paper clearly."""
    return card_number_label(card) if card_namespace(card) == PAPER_CARD_NAMESPACE else getattr(card, "card_no", None)
