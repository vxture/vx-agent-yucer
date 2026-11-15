/** Use transport metadata for model identity, never the model's self-description. */
export function modelIdentityReply(question: string, codes: readonly string[], locale?: string): string | undefined {
  const asksIdentity = /(?:\u4f60|\u60a8|\u52a9\u624b|\u672c\u6b21|\u5f53\u524d).{0,12}(?:\u54ea\u4e2a|\u4ec0\u4e48|\u4f55\u79cd|\u7528\u7684|\u8c03\u7528\u7684).{0,5}\u6a21\u578b|(?:which|what)\s+model\s+(?:are|is|do|did)/i.test(question);
  if (!asksIdentity) return;
  const english = locale ? locale === "en-US" : !/[\u3400-\u9fff]/.test(question);
  const served = [...new Set(codes)].join(" / ");
  if (english) return served ? `This reply uses ${served}, routed through Atlas.` : "This assistant uses Atlas. The response did not report a model name, so I cannot confirm it.";
  return served ? `\u672c\u6b21\u56de\u590d\u901a\u8fc7 Atlas \u8c03\u7528 ${served}\u3002` : "\u52a9\u624b\u901a\u8fc7 Atlas \u8c03\u7528\u6a21\u578b\uff0c\u672c\u6b21\u54cd\u5e94\u672a\u8fd4\u56de\u6a21\u578b\u540d\u79f0\uff0c\u65e0\u6cd5\u51c6\u786e\u786e\u8ba4\u3002";
}
