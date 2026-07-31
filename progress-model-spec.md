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

### 2. Habit
- Raw input: check-in history (per-day boolean, as already tracked).
- Derived "consistency score" for a chosen window (e.g. last 30 days):
  `completedDays / totalDays` in that window. Use a rolling window, not
  all-time — a habit's health is about recent consistency, not history.
- Current streak (already computed via `calcStreak`) is a separate,
  complementary number — shown alongside consistency, not merged into
  one figure that hides both.

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
