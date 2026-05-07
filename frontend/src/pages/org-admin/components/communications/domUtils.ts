export function clearElement(container: Element) {
  // Clears only a component-owned container; this never injects untrusted HTML.
  container.replaceChildren();
}
