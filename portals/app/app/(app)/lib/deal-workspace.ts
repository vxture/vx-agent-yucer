export const WORKSPACE_STEPS = ["plan", "prepare", "feedback", "history"] as const;
export type WorkspaceStep = (typeof WORKSPACE_STEPS)[number];
export type WorkspaceView = "analysis" | "progress";

type Query = { view?: string | string[]; step?: string | string[] };

export function resolveDealWorkspace(query: Query): { view: WorkspaceView; step: WorkspaceStep } {
  return {
    view: query.view === "progress" ? "progress" : "analysis",
    step: WORKSPACE_STEPS.includes(query.step as WorkspaceStep) ? query.step as WorkspaceStep : "plan",
  };
}

export function dealWorkspaceHref(id: string, view: WorkspaceView, step: WorkspaceStep = "plan", search = ""): string {
  const query = new URLSearchParams(search);
  query.delete("view");
  query.delete("step");
  if (view === "progress") {
    query.set("view", view);
    query.set("step", step);
  }
  const suffix = query.toString();
  return `/pipeline/${encodeURIComponent(id)}${suffix ? `?${suffix}` : ""}`;
}
