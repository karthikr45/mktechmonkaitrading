export function displayTime(utc: string, timezone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(utc));
}
export const integrationLabels = {
  mock: "Synthetic simulation",
  sandbox: "Broker sandbox",
  configured: "Credentials configured",
  unavailable: "Integration unavailable",
} as const;
