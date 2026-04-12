// Robust JSON extraction from Claude responses.
// Ported from apps/content-cannon/src/main/services/claude.service.ts.
// Claude sometimes wraps JSON in code fences or surrounding prose; this
// helper tries several strategies in order.
export function extractJSON(text: string): string {
  let str = text.trim();

  try {
    JSON.parse(str);
    return str;
  } catch {}

  if (str.includes("```")) {
    const codeBlockMatch = str.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      try {
        JSON.parse(codeBlockMatch[1].trim());
        return codeBlockMatch[1].trim();
      } catch {}
    }
  }

  const objStart = str.indexOf("{");
  if (objStart >= 0) {
    const lastBrace = str.lastIndexOf("}");
    if (lastBrace > objStart) {
      const candidate = str.substring(objStart, lastBrace + 1);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {}
    }
  }

  const arrStart = str.indexOf("[");
  if (arrStart >= 0) {
    const lastBracket = str.lastIndexOf("]");
    if (lastBracket > arrStart) {
      const candidate = str.substring(arrStart, lastBracket + 1);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {}
    }
  }

  return str;
}
