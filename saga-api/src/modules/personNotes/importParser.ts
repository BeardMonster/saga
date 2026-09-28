// Turns pasted Google Keep text into proposed notes. Rules-based on purpose
// (no AI): the structure in these notes is regular — "- Title -" headings,
// "Title:" headings, bullets, indentation — and a deterministic parser gives
// the same answer every time and never sends private text anywhere. The
// result is only a PROPOSAL: the user reviews and edits it before anything
// is saved.

export interface ParsedChild {
  label: string | null;
  text: string;
}
export interface ParsedItem extends ParsedChild {
  children: ParsedChild[];
}
export interface ParsedNote {
  title: string;
  kind: "list" | "text";
  body: string | null;
  items: ParsedItem[];
  suggestedSection: string;
}

const LABEL_RE = /^([^:/]{1,40}?):\s+(.+)$/;

function splitLabel(raw: string): ParsedChild {
  const text = raw.trim().replace(/[;,]\s*$/, "");
  const m = text.match(LABEL_RE);
  return m ? { label: m[1].trim(), text: m[2].trim() } : { label: null, text };
}

interface Line {
  indent: number;
  bullet: boolean;
  text: string; // bullet marker removed
  blankBefore: boolean;
  headingTitle: string | null; // set for "- Title -", "Title:" and "(Title)" lines
  wrapped: boolean; // "- Title -" style
  paren: boolean; // "(Title)" style
}

function tokenize(text: string): Line[] {
  const out: Line[] = [];
  let blank = true;
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const expanded = rawLine.replace(/\t/g, "  ");
    const trimmed = expanded.trim();
    // Blank lines and "---" separators both break a block.
    if (!trimmed || /^[-_=*]{3,}$/.test(trimmed)) {
      blank = true;
      continue;
    }
    const indent = expanded.length - expanded.trimStart().length;

    const wrappedMatch = trimmed.match(/^[-*•]\s*([^-*•\s].*?)\s*[-–—]$/);
    const bulletMatch = trimmed.match(/^[-*•]\s*(.*)$/);
    const body = wrappedMatch ? wrappedMatch[1] : bulletMatch ? bulletMatch[1].trim() : trimmed;

    let headingTitle: string | null = null;
    let wrapped = false;
    let paren = false;
    if (wrappedMatch) {
      headingTitle = wrappedMatch[1].trim();
      wrapped = true;
    } else if (body.endsWith(":") && body.length <= 60 && body.length > 1) {
      headingTitle = body.slice(0, -1).trim();
    } else if (/^\(.+\)$/.test(body) && body.length <= 40) {
      headingTitle = body.slice(1, -1).trim();
      paren = true;
    }

    out.push({ indent, bullet: !!bulletMatch && !wrappedMatch, text: body, blankBefore: blank, headingTitle, wrapped, paren });
    blank = false;
  }
  return out;
}

// PINs, passwords and account/phone activation codes: kept apart from the
// ordinary loose lines so they land in a Private section.
const SENSITIVE_LINE = /\b(pin|password|passcode)\b|activated/i;

const LONG_LABELED = /^([^:/]{1,40}?):\s+(.{70,})$/;

function suggestSection(title: string, items: ParsedItem[]): string {
  const t = title.toLowerCase();
  const everything = `${t} ${items.map((i) => `${i.label ?? ""} ${i.text}`).join(" ").toLowerCase()}`;
  if (/aftercare|hentai|\bsex\b|kink|\b(pin|password|passcode)\b/.test(t)) return "Private";
  if (/gift/.test(t)) return "Gift Ideas";
  if (/size|cloth|\bring\b|\bwear\b/.test(t)) return "Sizes & Clothing";
  if (/date|kiss|song|memor|ideal|valentine|expectation/.test(t)) return "Dates & Memories";
  if (/(^|\s)fav(orite)?s?(\s|$)/.test(t) && !/food/.test(t)) return "Favorites";
  if (/food|drink|beer|wine|cigar|soda|\btea\b|coffee|dislike|preference/.test(t)) return "Food & Drink";
  if (/\b(add|extra|toasted|no cream|light|less|combo|sauce|make sure)\b/.test(everything)) return "Orders";
  if (/cartoon|disney|character|book|movie|hobb/.test(t)) return "Favorites";
  return "Unsorted";
}

export function parseKeepNotes(text: string): ParsedNote[] {
  const lines = tokenize(text);
  const notes: ParsedNote[] = [];
  const looseItems: ParsedItem[] = [];
  const sensitiveItems: ParsedItem[] = [];
  let cur: ParsedNote | null = null;
  let curIndent = 0;
  let lastTop: ParsedItem | null = null;
  let lastTopIndent = 0;

  const newNote = (title: string, indent: number) => {
    cur = { title, kind: "list", body: null, items: [], suggestedSection: "Unsorted" };
    notes.push(cur);
    curIndent = indent;
    lastTop = null;
  };

  const addLoose = (raw: string) => {
    const long = raw.match(LONG_LABELED);
    if (long) {
      notes.push({ title: long[1].trim(), kind: "text", body: long[2].trim(), items: [], suggestedSection: "Dates & Memories" });
      return;
    }
    const { label, text: t } = splitLabel(raw);
    if (t) (SENSITIVE_LINE.test(raw) ? sensitiveItems : looseItems).push({ label, text: t, children: [] });
  };

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const next = lines[i + 1];

    // ── Headings ──
    if (ln.headingTitle) {
      const deeper = cur !== null && ln.indent > curIndent;
      let asNoteHeading: boolean;
      if (ln.wrapped) asNoteHeading = !deeper;
      else if (ln.paren) asNoteHeading = cur === null;
      else if (ln.bullet) asNoteHeading = cur === null || ln.blankBefore;
      else asNoteHeading = !deeper;

      if (asNoteHeading) {
        newNote(ln.headingTitle, ln.indent);
      } else if (cur) {
        const sub: ParsedItem = { label: null, text: ln.headingTitle, children: [] };
        (cur as ParsedNote).items.push(sub);
        lastTop = sub;
        lastTopIndent = ln.indent;
      }
      continue;
    }

    // ── A plain short line that opens a block of bullets is a heading ──
    const opensList =
      !ln.bullet &&
      ln.blankBefore &&
      next !== undefined &&
      !next.blankBefore &&
      (next.bullet || next.indent > ln.indent) &&
      ln.text.length <= 50 &&
      !LABEL_RE.test(ln.text);
    if (opensList) {
      newNote(ln.text.trim(), ln.indent);
      continue;
    }

    // ── A plain line back at the left edge after a blank line ends the current note ──
    if (cur && !ln.bullet && ln.blankBefore && ln.indent <= curIndent) cur = null;

    if (!cur) {
      addLoose(ln.text);
      continue;
    }

    // ── An item inside the current note ──
    const content = ln.text.trim();
    if (!content) continue;
    const parsed = splitLabel(content);
    if (lastTop && ln.indent > lastTopIndent) {
      // One nesting level only: anything deeper attaches to the item above.
      (lastTop as ParsedItem).children.push(parsed);
    } else {
      const item: ParsedItem = { ...parsed, children: [] };
      (cur as ParsedNote).items.push(item);
      lastTop = item;
      lastTopIndent = ln.indent;
    }
  }

  if (looseItems.length > 0) {
    notes.push({ title: "Imported notes", kind: "list", body: null, items: looseItems, suggestedSection: "Unsorted" });
  }

  if (sensitiveItems.length > 0) {
    notes.push({ title: "Private details", kind: "list", body: null, items: sensitiveItems, suggestedSection: "Private" });
  }

  // The two catch-all notes keep their fixed suggestions.
  const fixed = new Set(["Imported notes", "Private details"]);
  return notes
    .filter((n) => n.kind === "text" || n.items.length > 0)
    .map((n) => (n.kind === "text" || fixed.has(n.title) ? n : { ...n, suggestedSection: suggestSection(n.title, n.items) }));
}
