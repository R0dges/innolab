import { redirect } from "next/navigation";

/**
 * Innovation Lab exposes projects, not a separate generic team catalogue.
 * Keep the historical URL working while routing users to the canonical view.
 */
export default function TeamsPage() {
  redirect("/projects");
}
