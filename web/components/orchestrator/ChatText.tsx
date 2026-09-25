import { Fragment, type ReactNode } from "react";

// Full links, and the app's own pages (/dashboard/…, /store/…) the Orchestrator points to.
const URL_RE = /(https?:\/\/[^\s)]+|(?<![\w/])\/(?:dashboard|store)\/[^\s),]*[^\s),.:;])/g;

/** Plain http(s) links become clickable (opened in a new tab); everything else stays text. */
function links(text: string, key: string): ReactNode {
  return text.split(URL_RE).map((p, i) =>
    /^https?:\/\//.test(p) || /^\/(dashboard|store)\//.test(p) ? (
      <a key={`${key}-${i}`} href={p} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-accent underline-offset-2 hover:underline">
        {p.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}
        {p.replace(/^https?:\/\/(www\.)?/, "").length > 60 ? "…" : ""}
      </a>
    ) : (
      <Fragment key={`${key}-${i}`}>{p}</Fragment>
    ),
  );
}

/** **bold** → <strong>, links → <a>; no HTML from the model is ever rendered. */
function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
      <strong key={i} className="font-semibold text-text">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{links(p, String(i))}</Fragment>
    ),
  );
}

const BULLET = /^\s*(?:[-•*]|\d+[.)])\s+/;
const CALLOUT = /^(needs from you|heads up|note|important)\s*:\s*/i;

/**
 * Readable layout for agent replies: paragraphs get real spacing, "-"/"1." lines become lists,
 * and a "Needs from you:" paragraph becomes a highlighted callout. Works on partially-typed text.
 */
export function ChatText({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-3">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim());
        const callout = block.match(CALLOUT);
        if (callout) {
          return (
            <div key={bi} className="rounded-lg border-l-2 border-warn bg-warn-soft/50 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-warn">{callout[1]}</div>
              <div className="mt-0.5">{inline(block.slice(callout[0].length))}</div>
            </div>
          );
        }
        if (lines.length > 0 && lines.every((l) => BULLET.test(l))) {
          const ordered = /^\s*\d/.test(lines[0]);
          const Tag = ordered ? "ol" : "ul";
          return (
            <Tag key={bi} className={ordered ? "list-decimal space-y-1 pl-5 marker:text-text-faint" : "list-disc space-y-1 pl-5 marker:text-accent"}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(BULLET, ""))}</li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
