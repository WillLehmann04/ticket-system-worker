// ---------------------------------------------------------------------------
// emailParser.js
// ---------------------------------------------------------------------------

import * as chrono from "chrono-node";

// Words that carry no signal – filtered out before keyword extraction.
const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "is","it","its","i","my","me","we","our","you","your","he","she","they",
  "this","that","these","those","was","are","be","been","have","has","had",
  "do","did","not","no","so","if","as","from","by","about","just","can",
  "will","would","could","should","get","got","please","thank","thanks",
  "hi","hello","hey","dear","regards","sincerely","cheers","sent","via",
  "re","fw","fwd","email","mail",
]);

// ---------------------------------------------------------------------------
// Priority signals — first match wins
// ---------------------------------------------------------------------------
const PRIORITY_SIGNALS = [
  {
    priority: "high",
    words: [
      "urgent","urgently","asap","as soon as possible","emergency","critical","immediately",
      "high priority","blocking","blocker","p0","p1","escalate",
    ],
  },
  {
    priority: "low",
    words: [
      "when you can","when you get a chance","no rush","low priority",
      "whenever","not urgent","p3","minor",
    ],
  },
];

// ---------------------------------------------------------------------------
// Category rules — checked in order, first match wins, "general" is catch-all
// ---------------------------------------------------------------------------
const CATEGORY_RULES = [
  {
    category: "bug",
    terms: [
      "error","broken","crash","crashes","not working","doesn't work",
      "bug","issue","problem","failed","failing","exception","defect",
      "regression","incorrect","wrong result","unexpected",
    ],
  },
  {
    category: "improvement",
    terms: [
      "improve","improvement","optimise","optimize","slow","performance",
      "refactor","cleanup","clean up","technical debt","better","faster",
    ],
  },
  {
    category: "feature",
    terms: [
      "feature","request","new feature","add","would love","wish",
      "idea","suggestion","enhance","enhancement","could we","can we",
    ],
  },
  {
    category: "billing",
    terms: [
      "invoice","invoices","payment","payments","billing","charge",
      "charges","refund","subscription","receipt","overdue","quote",
    ],
  },
  {
    category: "account",
    terms: [
      "password","login","sign in","sign-in","locked","access",
      "account","username","reset","2fa","authenticator","permissions",
    ],
  },
  { category: "general", terms: [] }, // catch-all
];

// Phrases that signal a due date is nearby in the text
const DUE_DATE_CONTEXT = [
  /(?:due|deadline|by|before|needed?\s+by|required?\s+by|no\s+later\s+than|complete\s+by|finish\s+by|deliver(?:ed)?\s+by)[:\s]+([^\n.!?]{1,60})/gi,
  /\b(asap|end\s+of\s+(?:the\s+)?(?:day|week|month)|eod|cob|today|tomorrow|this\s+(?:week|friday|monday))\b/gi,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripNoise(text) {
  if (!text) return "";

  const lines = text.split("\n");
  const cleaned = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith(">")) continue;
    if (trimmed === "--" || trimmed === "—") break;

    if (
      /^sent from my (iphone|ipad|android|samsung|galaxy|blackberry)/i.test(trimmed) ||
      /^get outlook for/i.test(trimmed) ||
      /^sent via/i.test(trimmed)
    ) break;

    if (/^-{3,}\s*(forwarded|original)\s+message/i.test(trimmed)) break;

    cleaned.push(line);
  }

  return cleaned.join("\n").trim();
}

function extractKeywords(text, topN = 8) {
  if (!text) return [];

  const freq = {};
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));
}

function detectPriority(subject, body) {
  const haystack = `${subject} ${body}`.toLowerCase();

  for (const { words, priority } of PRIORITY_SIGNALS) {
    if (words.some((w) => haystack.includes(w))) return priority;
  }

  return "normal";
}

function detectCategory(subject, body) {
  const haystack = `${subject} ${body}`.toLowerCase();

  for (const { category, terms } of CATEGORY_RULES) {
    if (terms.length === 0) return category;
    if (terms.some((t) => haystack.includes(t))) return category;
  }

  return "general";
}

/**
 * Look for due date language in the text and parse it into a Date.
 * Only looks near explicit due-date phrases to avoid false positives
 * (e.g. dates mentioned in a history or signature).
 */
function extractDueDate(subject, body) {
  const haystack = `${subject}\n${body}`;

  for (const pattern of DUE_DATE_CONTEXT) {
    // Reset lastIndex each pass since we reuse the same regex objects
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(haystack)) !== null) {
      // match[1] is the capture group after the keyword; match[0] for the
      // second pattern which has no group
      const candidate = match[1] ?? match[0];
      const date = chrono.parseDate(candidate, new Date(), { forwardDate: true });
      if (date) return date;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @param {{ subject: string, body: string }} email
 * @returns {{
 *   cleanBody: string,
 *   keywords:  { word: string, count: number }[],
 *   priority:  "high" | "normal" | "low",
 *   category:  string,
 *   dueDate:   Date | null,
 * }}
 */
export function parseEmail({ subject = "", body = "" }) {
  const cleanBody = stripNoise(body);
  const keywords  = extractKeywords(`${subject} ${cleanBody}`);
  const priority  = detectPriority(subject, cleanBody);
  const category  = detectCategory(subject, cleanBody);
  const dueDate   = extractDueDate(subject, cleanBody);

  return { cleanBody, keywords, priority, category, dueDate };
}
