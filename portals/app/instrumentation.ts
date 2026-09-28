// Next.js instrumentation hook: runs once per server process, before any
// request. This is where the in-app job scheduler starts (ADR-033) - the
// product's own container provides its clock; nothing on the host has to.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // FIRST: an env value that is only a comment is no value (lib/env-hygiene.ts)
  // - before the scheduler or any request reads one.
  const { dropCommentValues } = await import("./app/lib/env-hygiene");
  const cleared = dropCommentValues(process.env);
  if (cleared.length > 0) console.warn(`[env] ignored ${cleared.length} key(s) whose value was only a comment: ${cleared.join(", ")}`);
  const { startJobScheduler } = await import("./app/jobs/scheduler");
  startJobScheduler();
}
