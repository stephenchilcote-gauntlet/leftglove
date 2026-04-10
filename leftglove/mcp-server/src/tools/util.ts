/** Wrap a string in the MCP text-content response shape. */
export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
