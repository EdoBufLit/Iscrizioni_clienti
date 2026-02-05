# Lessons

- When a user reports runtime errors, add defensive guards around optional/unknown values and make the logger safe-by-default.
- If a logo needs true background removal, create a transparent asset instead of relying on blend modes.
- When onboarding spans multiple internal routes, persist in-progress state (run + stepIndex) per role and add bounded retries for TARGET_NOT_FOUND to avoid tour interruption on tab/route changes.
- When the user marks a layout requirement as non-negotiable, keep that element in a dedicated section and remove duplicate representations from KPI cards.
- When multiple entry points trigger the same auth gate ("Area riservata"), route all of them through one deterministic redirect flow to prevent first-click race/redirect issues.
