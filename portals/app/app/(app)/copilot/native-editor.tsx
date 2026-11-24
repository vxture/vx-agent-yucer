import { taskRequestContext } from "../../api/copilot/tasks/context";
import { readPrivateTask } from "../../domains/copilot/task-service";
import { readBusinessForm } from "../../domains/copilot/lib/business-form";
import { UUID } from "../../domains/copilot/lib/task-contract";
import { XiaoyuFormReview } from "../components/xiaoyu-form-review";
export async function nativeTaskEditor(taskId?: string, key?: string) {
  if (!taskId || !UUID.test(taskId) || !key || !/^[a-zA-Z0-9_-]{1,64}$/.test(key)) return null;
  const access = await taskRequestContext();
  if (!access) return null;
  const result = await readPrivateTask(access.context, taskId);
  if (!result.ok || result.value.task.status !== "active") return null;
  const draft = result.value.drafts.find(d => d.key === key && d.contractVersion === "business-form/1");
  if (!draft) return null;
  const form = readBusinessForm(draft.text);
  const query = form.targetId ? {id: form.targetId} : {};
  // Load only the selected native editor; ordinary chat does not import every
  // business page and its client form into the initial collaboration graph.
  const editor = await (async () => {
    switch (form.module) {
      case "account": {
        const { default: Page } = await import("../account/new/page");
        return <Page searchParams={Promise.resolve({})} />;
      }
      case "segment": {
        const { default: Page } = await import("../segment/new/page");
        return <Page searchParams={Promise.resolve(query)} />;
      }
      case "solution": {
        const { default: Page } = await import("../solution/new/page");
        return <Page searchParams={Promise.resolve(query)} />;
      }
      case "strategy": {
        const { default: Page } = await import("../strategy/new/page");
        return <Page searchParams={Promise.resolve(query)} />;
      }
      case "sales_plan": {
        if (!Number.isInteger(form.fields.year)) return null;
        const { default: Page } = await import("../planning/page");
        return <Page searchParams={Promise.resolve({ year: String(form.fields.year) })} />;
      }
    }
  })();
  return <XiaoyuFormReview key={`${taskId}:${key}`} taskId={taskId} formKey={key}>{editor}</XiaoyuFormReview>;
}
