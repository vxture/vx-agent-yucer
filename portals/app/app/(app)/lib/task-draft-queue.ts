/** Serialize private-draft mutations per task, including edits from native forms.
 * A failed operation rejects its caller but must not poison the next attempt. */
const tails = new Map<string,Promise<unknown>>();
export function withTaskDraftWrite<T>(taskId: string, work: () => Promise<T>): Promise<T> {
  const previous=tails.get(taskId) ?? Promise.resolve();
  const next=previous.catch(()=>{}).then(work);
  tails.set(taskId,next);
  void next.finally(()=>{if(tails.get(taskId)===next)tails.delete(taskId);}).catch(()=>{});
  return next;
}
