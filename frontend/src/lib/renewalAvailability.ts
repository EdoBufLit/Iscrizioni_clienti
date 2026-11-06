/** First public release of annual renewals: midnight in Italy, not UTC midnight. */
export const RENEWAL_LAUNCH_DATE = "2027-01-01";
export const RENEWAL_LAUNCH_TIME = Date.parse("2027-01-01T00:00:00+01:00");

export function renewalLaunchAvailable(serverAvailable?: boolean, now = new Date()): boolean {
  return serverAvailable !== false && now.getTime() >= RENEWAL_LAUNCH_TIME;
}

export function renewalOpeningMessage(opensOn?: string | null): string {
  const opening = opensOn && opensOn > RENEWAL_LAUNCH_DATE ? opensOn : RENEWAL_LAUNCH_DATE;
  const label = new Date(`${opening}T12:00:00+01:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
  return `I rinnovi saranno disponibili dal ${label}.`;
}
