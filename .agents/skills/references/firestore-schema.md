# Firestore Schema & Security Rules

## Security rules (firestore.rules — deploy via SETUP.md §1)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Everything lives under `users/{uid}/...` and is only readable/writable by that authenticated user. **Any new collection must sit under this path** — there is no other allowed path in the ruleset, and adding one requires re-deploying rules (Firebase CLI or Console, see SETUP.md).

## Storage rules (storage.rules — deploy via SETUP.md §1b)

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

Mirrors Firestore rules: each user can only access their own files under `users/{uid}/`. Required for the Documents module (file uploads). Deploy via `firebase deploy --only storage` or Firebase Console.

## Collection map

Each top-level `state.<key>` array is a Firestore subcollection `users/{uid}/<key>/{docId}`, written via `saveDoc('<key>', id, data)`:

| Collection | Written by | Notes |
|---|---|---|---|
| `tasks` | Tasks module | timer fields (`timerRunning`, elapsed seconds) live on the task doc itself. `completedAt` (YYYY-MM-DD string) set when task is marked done. **Phase 7**: `goalId` (obligatoire) remplace `categoryId`. La catégorie se déduit via `goal.categoryId` (getter `getTaskCategoryId()`). Les tasks legacy avec `categoryId` mais sans `goalId` sont migrées automatiquement au lancement vers un goal "Non classé". **v1.12.0**: optional `isDayPriority: true` — auto-created from the morning ritual's "one priority" (dueDate = today, goalId/categoryId null); surfaces at the top of the Today list, on the Dashboard Morning Check-in, and on the calendar. **v1.14.0**: also auto-created from the afternoon check-in's "tomorrow priority" button (dueDate = tomorrow); shared upsert via `ensureDayPriorityTask`. **v1.17.0**: optional `attachedRewardId` (id of a `rewards` doc, nullable) — completing the task (`done: true`) grants the reward (see `rewardGrants`). **v1.19.0**: optional `startTime`/`endTime` (HH:MM strings, nullable) + optional `recurrence` — `{ frequency: 'daily'|'weekly'|'monthly'|'3_months', daysOfWeek: number[]|null (0=Sun..6=Sat, required for weekly), endDate: 'YYYY-MM-DD'|null }` (null/absent = one-off, no migration). **v1.21.0**: quick-recurrence chips (popover + task modal) create these recurrence objects directly with **`endDate: null`** (no-end by default — set later via the full modal); a weekly chip stores `daysOfWeek: [<weekday of the clicked slot>]`; monthly needs no extra field (day-of-month derives from `dueDate` at render time). **v1.23.0**: in the Edit Task modal, `daysOfWeek` is edited via 7 weekday toggle buttons (L M M J V S D) instead of a typed array — **storage format unchanged** (`number[]` in 0-6, 0 = dimanche, same getDay() convention as FullCalendar/`taskOccursOnDate`). **v1.24.0**: "Une fois" is the UNCHECKED "Récurrent" checkbox — `recurrence` null/absent = one-off (no `frequency:'once'` ever stored); unchecking also CLEARS any existing rule (no phantom). New chip **`'3_months'`** = every 3 months, same day-of-month as `dueDate` (rrule `interval:3`; `taskOccursOnDate`: `monthDiff ≥ 0 && % 3 === 0`; progress = 1 check-in per 3-month window). A recurring task replaces the binary `done` with `completions` (a `{dateKey: boolean}` map of done occurrences) and optional `exceptions` (string[] of skipped `dateKey`s). It is NOT binary: it contributes to its Goal's progress via the same consistency formula as Habits (`computeTaskConsistency` → `computeHabitProgress`, see `progress-model-spec.md`). It is also the calendar's only manually-creatable object — the old `events` collection is gone (see below). |
| `rewards` | **v1.17.0** — Rewards module | `{ id, name, icon (emoji, defaults '🎁'), description, archived (bool), createdAt }`. Currency-free celebration rewards; attached to tasks/goals via `attachedRewardId`. |
| `rewardGrants` | **v1.17.0** — Rewards module | `{ id: 'task:{id}:completed' | 'goal:{id}:completed', sourceType: 'task'|'goal', sourceId, rewardId, grantedAt, createdAt }`. One grant per source, forever — the deterministic doc id is the dedupe key (checked in local state + a remote `.get()` before writing). Auto-created on task completion / goal progress ≥ 100%. |
| `notes` | Notes module | rich text stored as HTML string, stripped via `stripHtml()` for previews |
| `journal` | Journal module | **keyed by date string, not `uid()`** — doc id is `YYYY-MM-DD` (`dk()`), one entry per day. Shape: `{ morning: string, afternoon: string, morningMood?, mood?, energy?, highlight?, tomorrow?, morningDone?, afternoonDone?, eveningDone? }`. **v1.14.0**: morning ritual writes `morningFocus`/`morningObstacle`/`energy`/`mood`; afternoon check-in writes `highlight`/`tomorrow` and sets `afternoonDone`. `morningMood` kept as a legacy read-fallback (`js/dashboard.js`, `js/journal.js` read `mood || morningMood`). Backward compat: legacy entries with plain string or `morningFocus`/`freeText`/`eveningWell` fields are migrated on read. **v1.15.0**: `energy` is now a 3-level string `'low' | 'medium' | 'high'` (ritual slider 1-10 mapped via `energyLevel(v)`; dashboard Weekly Energy widget writes the same values). Legacy numeric energy values are normalized on read by `energyLevel`/`energyLabel`. |
| `habits` | Habits module | check-ins stored as an array/map on the doc; `renderHeatmap`/`calcStreak` derive from it. **Phase 7**: `goalId` (obligatoire) remplace `categoryId`. La catégorie se déduit via `goal.categoryId` (getter `getHabitCategoryId()`). Migration automatique des habits legacy. **v1.3.0**: optional `deadline` (target date, 'YYYY-MM-DD' string, nullable) — when set, `computeHabitProgress` uses the deadline-based window instead of the rolling 30-day score. `createdAt` (ms timestamp) anchors the window start. **v1.7.0**: optional `frequency` (`'daily'` (default) \| `'weekly'` \| `'3x_per_week'` \| `'once'`) — absent = daily (no migration). `'weekly'` counts one check-in per ISO week as one "successful week" (streak & progress in weeks); `'3x_per_week'` needs ≥3 check-ins per ISO week for a successful week, progress = check-ins / (3 × weeks-in-window); `'once'` is binary (any check-in = 100%). Heatmap cells clickable on any past day via `toggleHabitDay(id, dateKey)` (not just today). **v1.15.0**: adds `'monthly'` — successful month = ≥1 check-in in the calendar month (`monthKey` = `YYYY-MM`); deadline progress = successfulMonths / `monthsBetweenKeys(createdAt, deadline)`; rolling = distinct recent months / months in the 30-day window. |
| `goals` | Goals module | includes nested `milestones`. **Phase 4**: `isSprintObjective` (bool), `sprintQuarter` (string like '2026-Q3'), `weeklyActions` (string[]), `categoryId` (nullable). **Phase 7**: Goal = conteneur de tasks/habits. `area` est calculé automatiquement depuis `categoryId` via la racine de l'arbre (Family/Growth/Career/Finance). **v1.12.0**: `deadline` (YYYY-MM-DD, the Edit-Goal modal "Target Date" field) is merged into the calendar as `type:'goal'` events. **v1.16.0**: merged by FullCalendar `buildAllEvents()` (`js/calendar.js`), replacing the old `getEventsForDate` fusion. **v1.17.0**: optional `sprintPriority: 'primary'|'secondary'` (required at save time when `isSprintObjective === true`, `null` otherwise; legacy goals without it group as primary) + optional `attachedRewardId` (id of a `rewards` doc, nullable) — goal grants the reward when derived progress ≥ 100% (`checkGoalRewardCompletion`). |
| `captures` | Quick Capture / Inbox | ephemeral — processed into `tasks` or `notes` via `processCapture()`, or dismissed |
| `documents` | Documents module | Firestore doc holds metadata; actual file bytes go to Firebase **Storage**, not Firestore |
| `sprints` | **LEGACY** — 3-Month Sprint module | Previously held quarterly objectives. Data should be migrated to `goals` with `isSprintObjective: true`. New sprint objectives are created as goals. Kept for backward compat during migration. |
| `timeEntries` | Time Audit module | logged time blocks. **Phase 5**: `categoryId` (nullable) derived from the task's category at log time. |
| `familyBlocks` | Family mode | protected/sacred time blocks. No longer used for calendar event creation (v1.19.0: use tasks with a `dueDate` + optional `startTime` instead — the old `events` collection was removed). |
| `wins` | Wins log | simple append-only list, no edit/delete UI beyond delete. **Phase 5**: `categoryId` (nullable) links to a category node for root-category grouping. |
| `babyMilestones` | Family mode | checklist items with boolean done state |
| `recipes` | Meals module | `{ id, name, ingredients: [{name, amount, unit}], categoryId?, createdAt }` — unit is freeform (g, kg, ml, pièce…). **Phase 4**: `categoryId` links to a category node with `moduleType: 'meals'`. |
| `mealPlan` | Meals module | `{ id, day: 'mon'|'tue'|…, recipeId, repas: 'midi'|'soir', categoryId?, createdAt }` — one doc per planned meal slot. **Phase 4**: `categoryId` scopes meal plan to a category. |
| `hobbies` | Hobbies module | `{ id, name, objectives: [{ id, title, progress (0-100) }], createdAt }` |
| `categories` | **Phase 4** | `{ id, name, icon?, color?, parentId: null|id, moduleType: 'generic'|'meals'|'finance-table', tabs: [{id, type: 'tasks'|'goals'|'habits'|'list', label}], order, createdAt }`. Self-referencing tree. `parentId: null` = root. Le champ `tabs` stocke les onglets activés par page ; absent ou vide → page vide avec bouton "+ Ajouter un onglet". **v1.4.0**: `ensureCategoryTabForType()` auto-ajoute un onglet (goals/tasks/habits) à la création d'un contenu ciblant ce nœud si l'onglet correspondant manque. |
| ~~`events`~~ | **Phase 4** — Calendar | **v1.19.0: REMOVED.** Local app-created calendar events were merged into Tasks — Task is now the calendar's only creatable object (day click / "+ Task" both open the Add Task modal). `state.events` is gone from `js/state.js` and `'events'` from the `collections` array in `js/data.js`; the old `openAddEventModal`/`openAppEventModal` were deleted (read-only `openExternalEventModal` kept for Google/Outlook). The `tasks` row above now carries the local calendar fields (`startTime`/`endTime`) plus `recurrence`. Legacy `events` docs already in Firestore are simply ignored (never read again). |
| `financeMonths` | **Phase 5** — Finance | `{ id: 'YYYY-MM', revenus: { a: {income, previousSavings}, b: {income, previousSavings} }, sharedExpenses: [{id, name, amount, account, type: 'fixed'|'variable'}], individualExpenses: { a: [{id, name, amount}], b: [{id, name, amount}] }, createdAt }` |
| `wishlist` | **Phase 5** — Finance | `{ id, list: string, name, price, saved, link, createdAt }` — items grouped by `list` name |
| `googleCalendarEvents` / `outlookCalendarEvents` | Calendar integrations | cached read-only copies of external calendar events, refreshed on connect/fetch, not user-edited |
| `dateIdeas` | Date Ideas module (quiz / "à choix") | `{ id, name, tags: { location: 'indoor'|'outdoor'|'both', physical: boolean, social: 'couple'|'friends'|'both', goOut: boolean }, createdAt }`. Seeded with 50 ideas on first launch. Editable by user. The parent category must have `moduleType: 'dateIdeas'` to activate the quiz UI. |
| `checklistItems` | Phase 6 — Tab "Liste simple" | `{ id, categoryId: string|null, tabId: string, text: string, done: boolean, createdAt: number }`. Checklist items liés à un onglet de type 'list' sur une page catégorie (categoryId set) ou sur le Suivi (categoryId null). |

## Non-array state

- `settings` — single object (`name`, `babyDueDate`, `areas`, `finance`, `drinkReminder` (v1.11.0), `bottomNav` (v1.13.0: ordered array of bottom-nav entry keys — `dashboard|journal|calendar|documents|suivi|family|growth|career|finance`), `suiviTabs`), saved via `saveProfile()` to `users/{uid}/profile/main`, not a subcollection.
- `journal` — object keyed by date string rather than an array; treat each date key as one Firestore doc in the `journal` subcollection with that date string as the doc id.

## Phase 5: Finance settings (in `settings.finance`)

Stored as a nested object within the profile doc (`users/{uid}/profile/main`):

```js
{
  partners: {
    a: { name: string },   // e.g. "Saif"
    b: { name: string }    // e.g. "Tari"
  },
  accounts: [
    { id: string, name: string, owner: 'a' | 'b' | 'joint' }
  ],
  discretionarySplit: {
    enabled: { a: boolean, b: boolean },
    buckets: [{ name: string, ratio: number }]  // ratios must sum to 1.0
  },
  wishlistLists: string[]  // pre-defined list names for wishlist grouping (v1.13.0: created on the fly from the Wishlist page via `openAddWishlistList`) — item modal options are `union(wishlistLists, item lists)`
}
```

## Phase 5: Finance month (`financeMonths` collection)

Doc id is `YYYY-MM` (e.g. `2026-01`). One doc per month, auto-created on first access.

**IMPORTANT — raw inputs only.** This document stores ONLY the raw user-entered data
(income, savings, expense names/amounts/accounts). All derived values (prorata, totals,
restes, reconciliation amounts, discretionary split) are calculated at display time by
`calcFinanceMonth()` — NEVER stored in Firestore. This ensures:
- The app recalculates correctly as new months are added
- The import script (`scripts/finance-import/`) writes only raw data
- Changes to support settings (partner names, accounts, split ratios) update retroactively

```js
{
  id: string,          // 'YYYY-MM'
  revenus: {
    a: { income: number, previousSavings: number },
    b: { income: number, previousSavings: number }
  },
  sharedExpenses: [{
    id: string,          // MUST have UUID — app uses it for edit/delete
    name: string,
    amount: number,
    account: string,    // account ID from financeSettings.accounts
    type: 'fixed' | 'variable'
  }],
  individualExpenses: {
    a: [{ id: string, name: string, amount: number }],  // each MUST have UUID
    b: [{ id: string, name: string, amount: number }]   // each MUST have UUID
  },
  createdAt: number
}
```

**Firestore path:** `users/{uid}/financeMonths/{docId}` (NOT a top-level collection).
The import script originally wrote to the wrong path (`financeMonths/{docId}` at root),
which meant data was invisible to the app and rejected by security rules. Fixed in v2
of `import_finance.py` — now writes to the correct subcollection path and requires
`--uid` to authenticate the target user.

## Phase 5: Reconciliation logic

The reconciliation is **derived at display time**, never stored. Algorithm:

1. **Prorata**: `prorataA = a.income / (a.income + b.income)`, `prorataB = 1 - prorataA` (defaults to 50/50 if total is 0).
2. **Shared expense split**: Each shared expense's `partA = amount × prorataA`, `partB = amount × prorataB`.
3. **Account-based reconciliation**:
   - For each shared expense, look up its `account` → find the account's `owner` in `financeSettings.accounts`.
   - If `owner = 'a'`: B owes A the `partB` amount (B should transfer to A's account).
   - If `owner = 'b'`: A owes B the `partA` amount.
   - If `owner = 'joint'`: Both A and B must transfer their respective parts to the joint account (no debt between them).
4. **Aggregation**: For non-joint accounts, sum all amounts owed to the owner. For joint accounts, show separate amounts for A and B.
5. **Net calculation**: If A owes B on one account AND B owes A on another, compute the net: display "Net: X owes Y to Z" to avoid redundant transfers.

## Phase 5: Wishlist (`wishlist` collection)

```js
{
  id: string,
  list: string,       // freeform group name (e.g. "Voyage", "Plaisirs à deux")
  name: string,       // item name
  price: number,      // target price
  saved: number,      // amount saved so far
  link: string,       // optional URL
  createdAt: number
}
```

Items are displayed grouped by `list`. Available list names are pre-populated in `settings.finance.wishlistLists` but new names can be created inline.

## Phase 4: Category tree data model

Each category node is a Firestore doc in `users/{uid}/categories/{docId}`:

```js
{
  id: string,           // uid()
  name: string,         // display name
  icon: string,         // optional emoji
  color: string,        // optional hex color
  parentId: null|string, // null = root, otherwise parent category id
  moduleType: 'generic'|'meals'|'finance-table'|'dateIdeas',
  order: number,        // sort order among siblings
  createdAt: number     // Date.now()
}
```

**Seed tree** (created by `seedInitialCategories()` on first launch):
```
Family (👨‍👩‍👧)  [generic]
├─ House (🏠)  [generic]
├─ Meal (🍽️)  [meals]
├─ Baby (👶)  [generic]
├─ Wife (❤️)  [generic]
│  └─ Dates (🌹)  [dateIdeas]
Growth (🌱)  [generic]
├─ Video games (🎮)
├─ Chess (♟️)
├─ Soccer (⚽)
├─ Art (🎨)
└─ Comedy (😂)
Career (💼)  [generic]  — empty, user builds sub-categories
Finance (💰)  [finance-table]
```

**Delete cascade strategy**: When deleting a category, children are reparented to the deleted node's parent. Linked content (tasks/goals/habits) gets `categoryId` set to null. Confirmation dialog warns about orphans and linked content before proceeding.

## Phase 4: Sprint→Goals migration (updated Phase 7)

The `sprints` collection is deprecated and no longer read by `renderSprint()`. The overall Sprint tracker is **always computed live** as the average of each sprint objective's `displayPct` (auto+manual) — never stored.

Goal fields used in Sprint:
```js
// goals/{docId}
{
  ...existing goal fields,
  isSprintObjective: true,     // marks this goal as a sprint objective
  sprintQuarter: '2026-Q3',    // which quarter (YYYY-QN format)
  progress: number,             // 0-100, per-objective (can be adjusted manually)
  weeklyActions: string[]       // weekly action items (from sprint objectives)
}
```

No standalone sprint-level progress field exists in Firestore. The `sprints` collection is kept for backward compat only (loaded into `state.sprints` but never rendered).

## Adding a new collection — checklist

1. Add the array to `state` (architecture.md).
2. No rule change needed as long as you write through `saveDoc('newCollection', id, data)` — it already resolves to `users/{uid}/newCollection/{id}`, which the existing rule covers.
3. Add the read into `loadAllData()` so it's populated on login.
4. If the collection needs different access rules than "owner-only" (e.g. sharing between users), that requires an explicit new `match` block in `firestore.rules` and a redeploy — flag this explicitly rather than assuming it works, since the current ruleset denies everything not under `users/{uid}`.
