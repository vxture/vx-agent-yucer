// Next.js instrumentation hook: runs once per server process, before any
// request. This is where the in-app job scheduler starts (ADR-033) - the
// product's own container provides its clock; nothing on the host has to.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startJobScheduler } = await import("./app/jobs/scheduler");
  startJobScheduler();
}
