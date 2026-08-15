# Progress Model — Logical Specification

## Core principle

**Only raw inputs are ever stored. Every progress percentage, at any
level, is derived at render time from those inputs — never persisted
as a fact.** This is the rule that fixes the "stuck 30%"-style bugs:
if a number is stored anywhere except at the leaf level below, delete
that field and compute it instead.

## The hierarchy

```
Life Area (root category: Family / Growth / Career / Finance)
  └─ Sub-category (any depth, e.g. Growth > Video games > Dofus)
       └─ Goal
            ├─ Task (0..N)
            └─ Habit (0..N)
```

Only **Task.done** and **Habit check-ins** are raw, user-entered
facts. Everything above them is computed.

## Level-by-level rules

### 1. Task
- Raw input: `done` (boolean). No progress concept beyond binary.
- **v1.19.0 — recurring tasks**: a task with `recurrence` is NOT
  binary. Its raw inputs are `completions` (a `{dateKey: boolean}` map
  of done occurrences) and `exceptions` (dates skipped). It contributes
  to its Goal's progress through the **exact same consistency formula
  as Habits** — never via `done`/total. Implementation: `computeTaskConsistency(task)`
  (in `js/habits.js`) projects `completions` onto a habit-like
  `{ checkIns, frequency, deadline }` object and calls
  `computeHabitProgress()` unchanged (no duplicated math):
  - `recurrence.frequency` → the habit `frequency` (`'daily' | 'weekly' | 'monthly' | '3_months'`).
  - `recurrence.endDate` → the habit `deadline` (deadline-based window);
    absent → rolling 30-day consistency window (open-ended series).
  - One-off tasks keep the binary rule above.
- **v1.24.0 — "Tous les 3 mois" (`frequency: '3_months'`)**: exactly the
  `'monthly'` logic with a 3× wider window — the unit is *calendar
  quarters* (`triMonthKey` = `YYYY-Qn`, e.g. `2026-Q3`) instead of
  months. One check-in anywhere inside a 3-month window = one
  "successful window". Deadline progress =
  `successfulWindows / triMonthsBetweenKeys(createdAt, deadline)` where
  `triMonthsBetweenKeys(a, b) = max(1, ceil(monthsBetweenKeys(a, b) / 3))`;
  rolling (no end date) = distinct recent windows /
  `triMonthsBetweenKeys(30 days ago, today)` (≈1, i.e. any recent
  check-in reads as fully consistent). `calcStreak` steps back 3 months
  per streak unit. Implemented as new `'3_months'` branches in
  `computeHabitProgress` + `calcStreak` (`js/habits.js`) with the same
  `mode` handling; `computeTaskConsistency` passes the frequency through
  unchanged.

### 2. Habit
- Raw inputs: check-in history (per-day boolean, as already tracked),
  `createdAt`, and now an optional `deadline` (target date).
- Optional `frequency` (`'daily'` (default) | `'weekly'` |
  `'3x_per_week'` | `'monthly'` | `'once'`). Absent or `'daily'` = the
  day-based rules below unchanged (no migration needed for existing
  habits).
- **If a deadline is set:** progress is deadline-based, not a rolling
  window —
  `totalDaysWindow = daysBetween(createdAt, deadline)` (fixed, doesn't
  shrink after the deadline passes)
  `completedCheckIns = count of true check-ins between createdAt and
  min(today, deadline)`
  `progress = min(1, completedCheckIns / totalDaysWindow)`
  This gives a genuine "how far along toward the goal" figure, exactly
  like a task's done/not-done but continuous — and it plugs directly
  into the Goal's weighted average the same way task completion does.
- **If no deadline is set** (legacy habits, or ones the user
  deliberately leaves open-ended): fall back to the rolling-window
  consistency score — `completedDays / totalDays` over the last 30
  days. This is a snapshot of recent behavior, not a march toward a
  target, and is treated separately from deadline-based progress in
  any aggregation (don't average a rolling-window score with a
  deadline-based score as if they meant the same thing).
- Current streak (`calcStreak`) stays a separate, complementary number
  either way — shown alongside whichever progress figure applies, not
  merged into it.
- **Per-frequency rules (v1.7.0)** — both the streak and the progress
  switch unit from *days* to *ISO weeks* (`isoWeekKey` = `YYYY-Www`):
  - `'weekly'`: any number of check-ins within one ISO week = one
    "successful week". Progress (deadline) =
    `successfulWeeks / weeksBetweenKeys(createdAt, deadline)`; streak =
    consecutive successful ISO weeks ending this week (current week
    not yet checked breaks it, like the daily "not checked today").
  - `'3x_per_week'`: an ISO week is "successful" iff ≥3 check-ins land
    in it. Progress (deadline) = `checkInsInWindow /
    (3 × weeksBetweenKeys(createdAt, deadline))` — partial weeks earn
    partial credit proportionally; streak = consecutive successful
    weeks (≥3 check-ins each).
  - `'once'`: single check-in anywhere in the window ⇒ 100%. Streak is
    1 once any check-in exists, else 0.
  - `'monthly'` (v1.15.0): the unit becomes *calendar months*
    (`monthKey` = `YYYY-MM`) — any number of check-ins within one
    calendar month = one "successful month". Deadline progress =
    `successfulMonths / monthsBetweenKeys(createdAt, deadline)`;
    streak = consecutive successful calendar months ending this month
    (current month not yet checked breaks it, like daily/weekly).
    Rolling (no deadline) = distinct recent calendar months /
    `monthsBetweenKeys(30 days ago, today)`.
  - No-deadline (rolling) versions: `'weekly'` =
    distinct recent weeks / `ceil(30/7)`; `'3x_per_week'` = recent
    check-ins / (3 × `ceil(30/7)`); `'once'` = any recent check-in.
  - The progress value returned still carries `mode:
    'deadline' | 'rolling'` so Goal/Sprint aggregation treats it the
    same regardless of frequency.

### 3. Goal
- **If the Goal has 0 tasks AND 0 habits attached:** progress is a
  manual value the user sets directly (a pure aspirational goal not
  yet broken down). This is the ONLY case where a stored `progress`
  field is legitimate.
- **As soon as at least one task or habit is attached:** progress
  becomes fully computed:
  `progress = (taskCompletionRate * taskWeight) + (habitConsistencyRate * habitWeight)`
  - If only tasks exist: `progress = tasksDone / tasksTotal`.
  - If only habits exist: `progress = average(habit consistency scores)`.
  - If both exist: weight by count (e.g. 3 tasks + 1 habit → tasks
    count 3x more) rather than a fixed 50/50 split, so a goal with
    many small tasks and one habit isn't dominated by the habit.
  - The stored manual `progress` field is ignored/cleared the moment
    a task or habit is attached — there is no "manual override that
    coexists silently" anymore, because that's exactly the mechanism
    that produced the stuck-32% bug. A user can still see and
    understand the number (via the "what's this made of" detail view
    already built), but they influence it by completing
    tasks/checking habits, not by nudging a slider.

### 4. Sub-category / Life Area rollups (Suivi, Dashboard)
- `progress = average(progress of every Goal under this node)`,
  recursive through children. Purely derived, never stored.

### 5. Sprint (current quarter)
- `progress = average(progress of every Goal where isSprintObjective
  is true AND its quarter matches the current quarter)`.
- Purely derived. If 0 objectives are flagged, show an empty state,
  never a leftover number.

## Why this is "fluid"

Every number in the app is a live read of current state — check a
task, uncheck a habit, remove a task from a goal, and every rollup
above it (goal → sub-category → life area → sprint) updates on the
same render pass, because nothing between the leaf and the top is
ever written to disk as a snapshot. There's exactly one place a manual
number can exist (an empty goal with no tasks/habits yet), and it
disappears automatically the moment real content is attached — so
there's never a question of "which number wins, the manual one or the
computed one."

## What to check if a number ever looks wrong again

1. Is there a Firestore field storing this percentage? If yes, that's
   the bug — it should be computed, not stored (except the one
   documented exception above).
2. Does the "detail" view (tasks/habits counted) match what's
   displayed? If the detail is empty but a number shows anyway, the
   render is reading two different sources — find and unify them.
