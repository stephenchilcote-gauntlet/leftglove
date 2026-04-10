import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseEdn } from "../edn/parser.js";

type ElementType = "clickable" | "typable" | "readable" | "chrome";

interface GlossaryElement {
  key: string;
  desc: string;
  type: ElementType;
  verbs: string[];
  testid: string | null;
}

interface IntentRegion {
  intent: string;
  description: string;
  elements: GlossaryElement[];
}

export interface Glossary {
  intents: IntentRegion[];
}

const VALID_TYPES: ElementType[] = [
  "clickable",
  "typable",
  "readable",
  "chrome",
];

const VERBS_FOR_TYPE: Record<ElementType, string[]> = {
  clickable: ["click"],
  typable: ["fill", "see"],
  readable: ["see"],
  chrome: [],
};

function extractElement(
  key: string,
  value: unknown,
): GlossaryElement {
  const obj = value as Record<string, unknown>;
  const desc = (obj["desc"] as string) ?? "";
  const rawType = (obj["type"] as string) ?? "readable";
  const type: ElementType = (VALID_TYPES as string[]).includes(rawType)
    ? (rawType as ElementType)
    : "readable";
  const bindings = obj["bindings"] as Record<string, unknown> | undefined;
  const web = bindings?.["web"] as Record<string, unknown> | undefined;
  const testid = (web?.["testid"] as string) ?? null;
  return { key, desc, type, verbs: VERBS_FOR_TYPE[type], testid };
}

function parseIntentFile(content: string): IntentRegion | null {
  const data = parseEdn(content) as Record<string, unknown>;
  const intent = data["intent"];
  if (typeof intent !== "string") return null;
  const description = (data["description"] as string) ?? "";
  const elementsMap = (data["elements"] as Record<string, unknown>) ?? {};
  const elements: GlossaryElement[] = Object.entries(elementsMap).map(
    ([key, value]) => extractElement(key, value),
  );
  return { intent, description, elements };
}

export async function loadGlossary(slProjectDir: string): Promise<Glossary> {
  const intentsDir = join(slProjectDir, "glossary", "intents");
  try {
    const s = await stat(intentsDir);
    if (!s.isDirectory()) return { intents: [] };
  } catch {
    return { intents: [] };
  }

  const files = (await readdir(intentsDir)).filter((f) => f.endsWith(".edn"));
  const intents: IntentRegion[] = [];

  for (const file of files) {
    try {
      const content = await readFile(join(intentsDir, file), "utf8");
      const region = parseIntentFile(content);
      if (region) intents.push(region);
    } catch (err) {
      console.error(`Failed to parse ${file}:`, err);
    }
  }

  return { intents };
}
