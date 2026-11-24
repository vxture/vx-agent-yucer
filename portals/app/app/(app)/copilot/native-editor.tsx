import { taskRequestContext } from "../../api/copilot/tasks/context";
import { readPrivateTask } from "../../domains/copilot/task-service";
import { readBusinessForm } from "../../domains/copilot/lib/business-form";
import { UUID } from "../../domains/copilot/lib/task-contract";
import { XiaoyuFormReview } from "../components/xiaoyu-form-review";
import AccountPage from "../account/new/page";
import SegmentPage from "../segment/new/page";
import SolutionPage from "../solution/new/page";
import StrategyPage from "../strategy/new/page";
import PlanningPage from "../planning/page";
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
  const editor = form.module === "account" ? <AccountPage searchParams={Promise.resolve({})} /> : form.module === "segment" ? <SegmentPage searchParams={Promise.resolve(query)} />
    : form.module === "solution" ? <SolutionPage searchParams={Promise.resolve(query)} />
    : form.module === "strategy" ? <StrategyPage searchParams={Promise.resolve(query)} />
    : <PlanningPage searchParams={Promise.resolve({year: String(form.fields.year)})} />;
  return <XiaoyuFormReview taskId={taskId} formKey={key}>{editor}</XiaoyuFormReview>;
}
