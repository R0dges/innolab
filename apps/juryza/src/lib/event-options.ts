export const EVENT_MODES = ["online", "in-person", "hybrid"] as const;
export type EventMode = (typeof EVENT_MODES)[number];

export const DEFAULT_EVENT_MODE: EventMode = "in-person";

export const EVENT_WORKFLOWS = ["standard", "innolab"] as const;
export type EventWorkflow = (typeof EVENT_WORKFLOWS)[number];

export const DEFAULT_EVENT_WORKFLOW: EventWorkflow = "innolab";

export const EVENT_LOCATIONS = ["Neuchâtel", "Genève", "Lausanne"] as const;
export const DEFAULT_EVENT_LOCATION = "Genève";

export function eventLocationOptions(current?: string) {
  const locations =
    current && !EVENT_LOCATIONS.some((location) => location === current)
      ? [current, ...EVENT_LOCATIONS]
      : EVENT_LOCATIONS;

  return locations.map((location) => ({ label: location, value: location }));
}
