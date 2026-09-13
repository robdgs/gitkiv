const DAY_MS = 86400 * 1000;
const WEEKS = 53; // GitHub's own graph: ~53 columns to cover a full year

// Same 5-level bucketing GitHub uses, just in the app's own pink palette
// instead of GitHub's green — level, not exact count, is what the color
// communicates.
function levelFor(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

const LEVEL_COLOR = ["#3d2632", "#5a2f42", "#84395a", "#c94a7d", "#f06fa8"];
const CELL_PX = 11;

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// A GitHub-style commit heatmap: every commit across every repo (any
// branch — see getContributionCounts), bucketed by calendar day. Pure
// server-rendered divs, not SVG: React 19 gives `<title>` special
// "document metadata" hoisting treatment wherever it appears in the tree,
// which breaks when it's nested inside an SVG `<rect>` for tooltips (a
// real hydration mismatch, confirmed by removing this component and
// watching the error disappear). A plain HTML `title` ATTRIBUTE on a div
// has no such special handling, so cell tooltips use that instead.
export default function ContributionGraph({ counts }: { counts: Map<string, number> }) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Start on the Sunday that begins the first full week, WEEKS weeks back,
  // so the grid always ends on the most recent Saturday-or-today column.
  const totalDays = WEEKS * 7;
  const start = new Date(today.getTime() - (totalDays - 1) * DAY_MS);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());

  const weeks: { key: string; count: number }[][] = [];
  let cursor = new Date(start);
  let total = 0;
  for (let w = 0; w < WEEKS; w++) {
    const week: { key: string; count: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const key = toDateKey(cursor);
      const count = cursor > today ? 0 : (counts.get(key) ?? 0);
      if (cursor <= today) total += count;
      week.push({ key, count });
      cursor = new Date(cursor.getTime() + DAY_MS);
    }
    weeks.push(week);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs uppercase tracking-wide text-[#dfa8b7]">
          {total} commit{total === 1 ? "" : "s"} in the last year
        </h2>
        <div className="flex items-center gap-1 text-[10px] text-[#dfa8b7]">
          <span>Less</span>
          {LEVEL_COLOR.map((color) => (
            <span key={color} className="inline-block rounded-sm" style={{ width: CELL_PX, height: CELL_PX, background: color }} />
          ))}
          <span>More</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: `repeat(7, ${CELL_PX}px)` }}>
          {weeks.map((week) =>
            week.map((day) => (
              <div
                key={day.key}
                title={`${day.count} commit${day.count === 1 ? "" : "s"} on ${day.key}`}
                className="rounded-sm"
                style={{ width: CELL_PX, height: CELL_PX, background: LEVEL_COLOR[levelFor(day.count)] }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
