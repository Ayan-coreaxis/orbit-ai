import { redirect } from "next/navigation";

/** The growth plan lives inside "Talk to your Orchestrator" — one chat, one Orchestrator. */
export default function StrategyRedirect() {
  redirect("/dashboard/orchestrator");
}
