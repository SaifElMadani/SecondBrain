# Architecture Map

Loaded only when a task needs it — this is the level-3 detail behind SKILL.md.

## Stack

- No build tools. `index.html` loads Firebase SDK scripts + `app.js` + `style.css` directly via `<script>`/`<link>`.
- **PWA (v1.11.0)**: `manifest.json` + `sw.js` at project root, registered in `js/main.js` (network-first for same-origin GET only, cross-origin/Firebase never intercepted). Icons `icon-192.png`/`icon-512.png`. PWA meta tags in `index.html` head (theme-color, apple-mobile-web-app-*, apple-touch-icon). This is the prerequisite for iOS (16.4+) notifications from an installed app.
- Firebase: Auth (email/password + Google), Firestore (offline persistence enabled), Storage (file uploads for the Documents module).
- Optional integrations wired but off by default: Google Calendar API (`GCAL_CLIENT_ID`, `GCAL_API_KEY` placeholders) and Microsoft Graph / MSAL for Outlook Calendar (`O365_CLIENT_ID` placeholder). Both configured in `app.js` near the top and documented in `SETUP.md`.

## Global state shape (app.js ~L26-52)

```js
let currentUser = null;      // Firebase Auth user object
let userProfile = {};        // profile doc: users/{uid}/profile/main
let state = {
  tasks: [], notes: [], journal: {},        // journal keyed by date string 'YYYY-MM-DD'
  habits: [], goals: [], captures: [],
  documents: [], sprints: [], timeEntries: [],
  familyBlocks: [], wins: [], babyMilestones: [],
  recipes: [], mealPlan: [], hobbies: [],
  categories: [], events: [],
  financeMonths: [], wishlist: [],   dateIdeas: [],
  checklistItems: [],
  googleCalendarEvents: [], outlookCalendarEvents: [],
  settings: { name: '', babyDueDate: null, areas: ['family','career','growth','finance'],
    drinkReminder: { enabled: false, interval: 90 },
    bottomNav: ['dashboard','journal','calendar','documents','suivi','family','growth','career','finance'],
    finance: { partners:{ a:{name:''}, b:{name:''} }, accounts:[], discretionarySplit:{ enabled:{a:false,b:false}, buckets:[] }, wishlistLists:[] },
    suiviTabs: [] }
};
```

Every array-valued key in `state` corresponds 1:1 to a Firestore subcollection of the same name under `users/{uid}/`. `journal` and `settings` are the two exceptions (object-shaped, not arrays — see firestore-schema.md).

**Phase 7**: Tasks/habits ont `goalId` (obligatoire) au lieu de `categoryId` direct. La catégorie se déduit via `goal.categoryId` (getters). Les goals stockent `categoryId`. Life area automatique : remonte le parentId jusqu'à la racine. Progression Sprint = % tasks complétées + régularité habits + ajustement manuel.

## Firestore access layer (app.js ~L86-103)

```js
function userRef() { return db.collection('users').doc(currentUser.uid); }
function col(name) { return userRef().collection(name); }
async function saveDoc(collection, id, data)   // col(collection).doc(id).set(data, {merge:true})
async function deleteDoc(collection, id)        // col(collection).doc(id).delete()
async function saveProfile(data)                // userRef().collection('profile').doc('main').set(data,{merge:true})
```

All writes go through these three functions. All of them wrap Firestore calls in try/catch and call `toast(msg, 'error')` on failure — replicate this pattern for any new write helper rather than calling `db`/`col` directly.

`loadAllData()` (~L308) is the single bulk-read on login: fetches every subcollection into the matching `state.*` array and calls the initial render. After loadAllData, `seedInitialCategories()` runs to seed the initial category tree if empty, then `seedDateIdeas()` seeds 50 date ideas, and a migration step ensures any existing "Dates" category node has `moduleType: 'dateIdeas'`.

## View routing (app.js ~L108-170)

```js
const VIEWS = {               // id -> { title, sub } shown in topbar
  dashboard, inbox, sprint, notes, documents,
  calendar, goals, journal, family, category, timeaudit, wins, hobbies, finance
};
let currentView = 'dashboard';
function goTo(viewId) { ... }  // toggles .view.active, .nav-btn.active, .bottom-nav-btn.active, topbar text, clears activeCategoryId (unless 'category'), auto-expands Suivi for tasks/wins/timeaudit, calls renderView()
function renderView(id) { switch(id){ case 'dashboard': renderDashboard(); break; ... } }
```

To add a view: add a `VIEWS` entry, a `case` in `renderView()`, a `<div class="view" id="view-{id}">` block in index.html, and a nav button (`data-view="{id}"`) in both the sidebar nav and the bottom mobile nav.

## Sidebar (index.html ~L304-360) — current order

The sidebar has: **Dashboard** (nav-btn) → **Journal** (nav-btn) → **Calendar** (nav-btn) → **Suivi** (fixed accordion with Tasks / Goals & Habits / Wins / Time Logs) → **Documents** (nav-btn) → **dynamic category roots** rendered by `renderSidebarCategories()` (Family, Growth, Career, Finance).

The Suivi accordion children: Tasks calls `goTo('goals')` with `switchTghTab('tasks')`, Goals & Habits calls `goTo('goals')`, Wins calls `goTo('wins')`, Time Logs calls `goTo('timeaudit')`. The `goTo()` function auto-expands Suivi when navigating to these views.

The Suivi accordion is hardcoded in index.html with `toggleSuiviExpand()` JS.

## Sidebar & category accordion (app.js ~L2924-3080)

```js
let activeCategoryId = null;    // the category currently displayed in main content area
let expandedCategories = new Set(); // category IDs expanded in sidebar accordion
let suiviExpanded = false;       // Suivi accordion expanded state
```

**Sidebar accordion behavior**:
- Root categories (parentId === null) are rendered as clickable nodes in the sidebar.
- Clicking a category label → `goToCategory(id)`: navigates to `view-category`, shows filtered tasks/goals/habits in main area, AND expands the node's children in the sidebar.
- Clicking the chevron → `toggleCategoryExpand(id)`: expands/collapses children without navigating.
- Hover reveals action buttons: add child (+), edit (✎), delete (×).
- Children are indented 16px per depth level.
- All ancestors of the active category are auto-expanded so the path is visible.
- The Suivi accordion is a fixed (non-dynamic) accordion with hardcoded children (Tasks → goals + tasks tab, Goals & Habits → goals, Wins → wins, Time Logs → timeaudit). Clicking a child calls `goTo()`. `goTo()` auto-expands Suivi when navigating to one of its children.

**Key functions**:
- `renderSidebarCategories()` — rebuilds the sidebar accordion HTML
- `buildSidebarNode(cat, depth)` — recursive: renders one node + its expandable children
- `toggleCategoryExpand(id)` — toggles expansion without navigating
- `goToCategory(id)` — navigates + expands + renders content (null → dashboard)
- `renderCategoryContent()` — renders `view-category` for `activeCategoryId`. Dispatches to `buildMealsContent(cat)` for `meals`, `goTo('finance')` for `finance-table`, `renderDateIdeasContent(cat)` for `dateIdeas`. Pour les catégories `generic`, utilise un système d'onglets configurables stockés dans `cat.tabs` : chaque onglet peut être `tasks`, `goals`, `habits` ou `list`. Un bouton "+ Ajouter un onglet" permet d'en ajouter. Un seul onglet par type autorisé par page.
- `toggleSuiviExpand()` — toggles the Suivi accordion children visibility

**Category CRUD** (unchanged from Phase 4):
- `getCategoryById(id)`, `getCategoryChildren(parentId)`, `getCategoryPath(id)`, `getCategoryLabel(id)`, `getCategoryRoot(id)`
- `buildCategoryOptions()` — flat dropdown options with indentation for modals
- `openAddCategoryModal(parentId)`, `openEditCategoryModal(id)`, `deleteCategory(id)`
- `buildCategoryContent(cat)` — legacy (dead code)
- `buildMealsContent(cat)` — recipes + meal plan + grocery list scoped to a category
- `seedInitialCategories()` — one-shot seed of Family/Growth/Career/Finance tree

**Delete strategy**: Reparent children to deleted node's parent. Unlink content (set categoryId to null). Confirmation dialog warns about orphans and linked content before proceeding.

**Module types**: `generic` (onglets configurables : tasks/goals/habits/list), `meals` (recipes + meal planning), `finance-table` (redirects to Finance view), `dateIdeas` (quiz/assistant with filter + random pick). `renderCategoryContent()` checks `moduleType` before showing generic content.**

**Phase 6 — Onglets configurables** : Les pages `generic` et la page Suivi utilisent un système d'onglets stocké dans `cat.tabs` (catégories) ou `state.settings.suiviTabs` (Suivi). Chaque onglet a un `type` (`tasks`, `goals`, `habits`, `list`), un `id` unique, et un `label`. L'utilisateur peut ajouter/supprimer des onglets ; un seul par type par page. Le type `list` est une checklist simple (collection `checklistItems`) sans date/priorité/timer. Migration automatique : les pages avec du contenu existant reçoivent des onglets par défaut.

## Phase 7 — Restructuration Goal = conteneur Tasks/Habits

**Goal** devient un conteneur de tasks et habits :
- Les tasks ont désormais `goalId` (obligatoire) à la place de `categoryId` direct.
- Les habits ont désormais `goalId` (obligatoire) à la place de `categoryId` direct.
- La catégorie d'une task/habit se déduit via `goal.categoryId` (getters `getTaskCategoryId()` / `getHabitCategoryId()`).
- Migration automatique : au lancement, les tasks/habits existantes avec `categoryId` mais sans `goalId` sont regroupées par catégorie et reçoivent un goal "Non classé (Catégorie)" créé automatiquement.

Helpers ajoutés (app.js ~L92-140) :
- `getGoalById(id)` — lookup simple
- `getTaskCategoryId(task)` — déduit via goal ou fallback legacy
- `getHabitCategoryId(habit)` — déduit via goal ou fallback legacy
- `getLifeArea(categoryId)` — remonte jusqu'à la racine pour déterminer Family/Growth/Career/Finance
- `getGoalLifeArea(goal)` — utilise `goal.area` ou `getLifeArea(goal.categoryId)`
- `getCategoryPathString(categoryId)` — "Growth > Video games > Dofus"
- `buildGoalOptions(categoryId?)` — dropdown des goals filtrés par catégorie

La progression Sprint combine désormais (%) :
- **Auto** : % tasks complétées liées au goal + régularité habits (7 derniers jours)
- **Manuel** : ajusté via les boutons +/- (toujours possible)
- Les deux coexistent : l'auto est affiché par défaut, le manuel s'ajoute en complément.
- Clic 📊 sur un objectif Sprint → panneau détail : liste des tasks/habits liés.
- **Barre globale Sprint** : moyenne des `displayPct` de tous les goals sprint du trimestre courant (live, jamais stockée). Si 0 objectifs → affiche "No objectives yet".
- **Réactivité** : `toggleTask`, `toggleHabitToday`, `deleteTask`, `deleteHabit`, `openAddTaskModal`, `openAddHabitModal` rappellent `renderSprint()`.

## Goals tab accordion pattern (Phase 7.1 / v1.2.0)

The Goals tab renders each goal row as a **collapsible accordion**. The same builder (`buildGoalAccordionHtml(g)`) is used on the Suivi Goals tab AND the category-page Goals tab (`renderTabGoals`).

- **State**: `window._expandedGoals` (Set of goal IDs) — not persisted across reloads.
- **Toggle function**: `toggleGoalExpand(id)` — toggles membership and calls `rerenderGoalsList()`.
- **`rerenderGoalsList()`**: view-aware re-render — on the category view it calls `renderCategoryContent()`, on the Sprint view `renderSprint()`, otherwise `renderGoals()`. Used by every accordion inline mutation handler.
- **Header** (always visible): chevron (▶ rotates 90° on expand), title, sprint tag, category tag, progress bar, auto/manual label, link count, ✎ pencil (edit metadata) and × delete buttons.
- **Click semantics**: clicking the header/chevron expands the accordion ONLY. Editing goal metadata is a separate action via the ✎ pencil → `openAddGoalModal(g)` (small 4-field modal). The whole-header-open-modal behavior is gone.
- **Expanded body**: milestones (if any), tasks list (with check/edit/delete, "+ Add task" button), habits list (with check-in/streak/delete, "+ Add habit" button), manual stepper buttons (when mode=manual).
- **Child items** reuse existing patterns: `task-check-sm` + `cat-page-task` for tasks, `task-check-sm` + `cat-page-habit` for habits, `openAddTaskModal(..., {goalId})` and `openAddHabitModal(..., {goalId})` for creation with pre-filled parent.
- **Re-render**: inline `onclick` handlers call `rerenderGoalsList()` after mutations (`toggleTask`, `toggleHabitToday`, `deleteTask`, `deleteHabit`).

## Edit Goal modal — metadata only (v1.2.0)

`openAddGoalModal(item)` is a small dialog with exactly 4 fields: `title`, `categoryId`, `deadline`, `isSprintObjective`. No milestones, no weekly actions (removed per user request), no tasks/habits list (those live exclusively in the accordion). New goals get `milestones: []` and `weeklyActions: []`; editing keeps existing values. `onSubmit` calls `rerenderGoalsList()` + `renderSprint()`.

## Habits tab — flat list (Phase 7.1)

`renderHabits` no longer groups by root category — renders all habits as a flat list.

## Habit progress — deadline-aware (v1.3.0)

`computeHabitProgress(h)` derives a single habit's progress (0..1) at render time — never stored:

- **If `h.deadline` set**: `totalDaysWindow = max(1, daysBetween(createdAt, deadline))` (fixed, doesn't shrink after the deadline passes); `completedCheckIns` = count of check-ins between `createdAt` and `min(today, deadline)`; `progress = min(1, completedCheckIns / totalDaysWindow)`.
- **If no `h.deadline`**: existing rolling 30-day consistency score (`checkIns ≥ now-30d` / 30) — unchanged, backward compatible, no migration.
- `calcStreak` stays a separate displayed number in both cases (never merged into progress).
- This is the value used by the Goal weighted average (`computeGoalProgress`) — a goal with habits feeds `average(computeHabitProgress(h))`, count-weighted against tasks, exactly like task completion. The `habitDetails` entries carry `mode: 'deadline' | 'rolling'` for mode-aware labels (sprint detail view).
- Progress surfaces in `renderHabits` (Suivi), `buildGoalAccordionHtml` + `renderTabHabits` (category), sprint detail.

New helpers: `computeHabitProgress(h)` (near `calcStreak`, ~L2780), `daysBetween(a, b)` (utilities, ~L75, date-key string diff). `openAddHabitModal` gained an optional `deadline` date field (persisted on the habit doc; `null` when unset).

## Habit frequency & clickable heatmap (v1.7.0)

All habit logic lives in `js/habits.js` (post-module-split).

- **`frequency` field** on the habit doc: `'daily'` (default when absent — no migration) | `'weekly'` | `'3x_per_week'` | `'once'` | `'monthly'` (v1.15.0). Set in the Add/Edit Habit modal (`openAddHabitModal` gains a `frequency` select), persisted via `saveDoc('habits', ...)`.
- **`calcStreak(checkIns, frequency)`** — frequency-aware. `'weekly'` = consecutive successful ISO weeks (any check-in per week); `'3x_per_week'` = consecutive weeks with ≥3 check-ins; `'once'` = 1 if any check-in; `'monthly'` (v1.15.0) = consecutive successful calendar months (`monthKey` = `YYYY-MM`, ≥1 check-in per month). All consumers (dashboard.js, categories.js, goals.js, sprint.js, habits.js) now pass `h.frequency || 'daily'`.
- **`computeHabitProgress(h)`** — deadline/rolling math per frequency; returns `{ progress, mode: 'deadline'|'rolling' }` unchanged so Goal/Sprint aggregation is frequency-agnostic. See `progress-model-spec.md` §2.
- **Helpers**: `isoWeekKey(dateOrKey)` (`YYYY-Www`, ISO), `weeksBetweenKeys(a, b)` (inclusive ISO-week count), `monthKey(dateOrKey)` (`YYYY-MM`, v1.15.0), `monthsBetweenKeys(a, b)` (inclusive calendar-month count, v1.15.0) — module-local (exported on `window` for dashboard reuse).
- **Clickable heatmap**: `renderHeatmap(container, checkIns, habit)` renders cells with `heatmap-clickable` (past/today, `onclick="toggleHabitDay(id, key)"`) vs `heatmap-future` (dimmed, no-op). **`toggleHabitDay(id, dateKey)`** toggles any past/today check-in (writes `checkIns`, saves, re-renders habits/dash/category/sprint + `rerenderGoalsList()`); `toggleHabitToday(id)` is now a thin wrapper. CSS: `.heatmap-cell.heatmap-clickable/.heatmap-future` in style.css ~L1475.

## Tasks tab — grouped by goal (Phase 7.1)

`renderTghTasks` changed from grouping by root category to grouping by parent goal (`goalId` → `goal.title`). Section header per goal. Undated tasks remain in their own ungrouped section.

## v1.8.0 — timer shortcuts, calendar nav, non-blocking widgets

### Play button in goal accordion tasks

In `buildGoalAccordionHtml` (`js/goals.js`), each task row now includes a `task-timer-btn` ▶ button (when `!t.done`) that calls `startTaskTimer('${t.id}')` directly — same class/behavior as the Tasks page, so a timer can be started from a Goal's expanded accordion without leaving the page. `startTaskTimer` still toasts an error if the task has no `duration`.

### Calendar navigation shortcuts

**v1.16.0**: The custom toolbar shortcuts (`#cal-today`/`#cal-week-next`/`#cal-month-next`, `calYear`/`calMonth` state) were removed — the calendar is now FullCalendar and its built-in toolbar (`prev,next today` + view buttons) handles all navigation via the FC API (`calendar.today()/prev()/next()/gotoDate()`). See the v1.16.0 section.

### Non-blocking timer & pause widgets

Both previously full-screen overlays are now compact `position: fixed` corner widgets — they stay visible and keep running while navigating views (the timer interval is module-global in `js/pomodoro.js`, unaffected by `goTo()`):

- **`#overlay-timer`** (active task timer) → fixed **bottom-right** card (`.timer-widget`): task name, time display, progress bar, ✓ Mark Complete / Cancel. No full-screen backdrop, so clicks pass through to the app.
- **`#screen-pause`** (60s post-completion breathing pause, opened from `toggleTask` via `openPauseScreen`) → fixed **bottom-left** card (`.pause-widget`): ring countdown (same `#pause-ring-circle` / `#pause-countdown` / 502.65 circumference math), win-log input, "Continue to next task" button (still unlocks after 60s), plus a new ✕ **close button** (`#pause-close-btn`, handler added in `js/pomodoro.js`) that dismisses the widget immediately (clears the interval).
- All element IDs referenced by `js/pomodoro.js` are unchanged (`timer-task-name`, `timer-display`, `timer-bar-fill`, `timer-done-btn`, `timer-cancel-btn`, `pause-title`, `pause-countdown`, `pause-ring-circle`, `pause-win-input`, `pause-skip-btn`).
- CSS in `style.css`: `#overlay-timer`/`#screen-pause` are `display:none` → `.active { display:block }` boxes; the mobile media query raises both above the bottom nav (`bottom: calc(76px + env(safe-area-inset-bottom))`). The `.pause-breath` element and its `breathe` keyframes were removed (replaced by the ring-in-card layout).

## v1.9.0 / v1.16.0 — calendar: FullCalendar v6 (CalendarJS removed), modal date shortcuts

### Calendar rendering (`js/calendar.js` + `index.html` `#view-calendar`)

**v1.16.0 Migration (current)**: The calendar is **FullCalendar v6.1.21** loaded via CDN global builds (no bundler). All prior layers were removed — CalendarJS (`@calendarjs/ce`, `calendarjs.Schedule`/`Timeline`) and the older homemade custom DOM grid (`calYear`/`calMonth`, `refDate`, `getEventsForDate`, `buildDayCell`, `#calendarjs-root`, `#calendarjs-schedule`/`-timeline`) no longer exist. See the full v1.16.0 section below.

### Calendar date picker (`js/calendar.js` + `index.html`)

- `<input type="date" id="cal-date-picker">` in the toolbar calls `calendarInstance.gotoDate()` on change (v1.16.0 — FullCalendar API, no manual re-render).

### Modal date shortcuts (`js/modal.js` + `style.css`)

- `buildField` now appends `.date-shortcuts` under **every `type:'date'` input** (Task dueDate, Event date, Goal deadline, Habit deadline, etc.): four pill buttons **Demain / Semaine prochaine / Mois prochain / Dans 3 mois**.
- Each calls global `setDateShortcut(inputId, key)` (exported + on `window`), which pre-fills the input with the date computed **from today** (inline formatting, no `dk()` dependency) — modal stays open, user can still adjust manually. `onSubmit` reads the field value normally.

## v1.10.0 — unified event modal, modal date shortcuts

### Unified event creation

- **Removed `openDayModal`** (the divergent day-cell modal: title/area/startTime/endTime only, no date/recurring fields, no save of `date`). Day-cell clicks now call **`openAddEventModal(key)`** — the exact same modal as the `+Event` button.
- `openAddEventModal(prefillDate = null)` gained an optional prefill: the `date` field is pre-filled with the clicked day's key (`'YYYY-MM-DD'`); the `+Event` button leaves it empty. Single implementation, no duplicated form, `onSubmit` unchanged (`recurring`/`area`/`source:'app'` etc. now consistently available from both entry points).
- `openDayModal` removed from exports / `window` in `js/calendar.js`.
- **v1.16.0**: the old `refDate`/`calYear`/`calMonth`/`weekStartOf`/`addDays`/`addMonths` single-navigation state was removed along with CalendarJS — FullCalendar owns navigation now (see v1.16.0).

## v1.11.0 — water reminder + PWA + documented notification limits

### Water reminder (`js/water.js`)

- New module `js/water.js` (imported after `nudge.js` in `main.js`). Settings live in `state.settings.drinkReminder = { enabled: boolean, interval: number(min) }` (default `{ enabled: false, interval: 90 }`, persisted via `saveProfile({ drinkReminder })` → merged back into `state.settings` by `loadAllData`). Field name is `drinkReminder` — **not** `waterReminder`.
- `startWaterReminder()` / `stopWaterReminder()` — module-global `waterTimer` (`setInterval` at `interval * 60000`). `startWaterReminder()` is called from `launchApp()` (`js/auth.js`); `stopWaterReminder()` from the logout click handler.
- `waterNotify()` — fires **in-app only**: `new Notification('💧 Boire de l\'eau', …)` when permission granted, otherwise a `toast(…, 'info', 6000)`; tries `Notification.requestPermission()` once if still `'default'`; `navigator.vibrate([200,100,200])`.
- Settings UI: `openSettings()` (exported + `window`-bound) is wired to the new `#settings-btn` in the sidebar footer (`⚙️ Settings`, above Sign out; hover style `#settings-btn:hover` in style.css). Generic modal with a Désactivé/Activé select + number interval input (clamped ≥5 min).

### Notification platform limits (IMPORTANT — documented, do not over-promise)

- **No push server (FCM/web push) exists.** The reminder runs on a page `setInterval`, so it fires **only while the app is open** in a tab/window — never when closed, on any platform.
- **Android Chrome tab**: works while the tab is open (backgrounded tabs are throttled); installed PWA works while running.
- **iOS Safari (non-installed)**: `Notification` API not available — never works in a tab.
- **iOS installed PWA (16.4+)**: works, but only while the PWA is running. Requires the PWA to be added to the home screen (manifest + icons above) and notification permission granted inside the installed app.
- Future closed-app delivery requires a push server + subscription (out of scope; the code comments in `js/water.js` and this section are the contract).

## v1.12.0 — day-priority task, goal deadlines on calendar, edit task from calendar

### Ritual "priorité du jour" → real Task (`js/ritual.js`)

- `saveRitual()` now, on the **morning** ritual, creates a real `tasks` doc when `ritualAnswers.morningFocus` is non-empty — no longer just journal text. Shape: `{ id, title, dueDate: todayKey, done: false, timerRunning: false, isDayPriority: true, priority: 'high', goalId: null, categoryId: null, createdAt }`. `goalId`/`categoryId` are null (standalone task); `getTaskCategoryId` already falls back to null gracefully. **v1.14.0**: this logic moved into the shared `ensureDayPriorityTask(title, dateKey)` helper, also reused by the new afternoon check-in's "tomorrow priority" button.
- **Dedupe**: if a `isDayPriority` task with `dueDate === today` already exists, its `title` is updated instead of creating a duplicate.
- `morningFocus` is still written to the journal doc (backward compat for any reader).
- **Display**:
  - Tasks Today/All list (`js/tasks.js` `renderTasks`): `isDayPriority` non-done tasks sort to the top; each shows the `⭐ Priorité du jour` badge (`.pri-day-badge`) in `.task-meta`.
  - Dashboard check-in section (`js/dashboard.js` `renderDashCheckins`, renamed from `renderDashRitualSummary` in v1.15.0): when today's priority task exists it shows the task title + `⭐ Priorité du jour` badge + a ✓ task-check that completes it (`toggleTask`); falls back to the journal `morningFocus` text otherwise. Empty state unchanged (no ritual done + no priority task).

### Goal target dates (`deadline`) in the calendar fusion (`js/calendar.js`)

- The Edit Goal modal's "Target Date" field is persisted as **`g.deadline`** (not `targetDate`). Goals with a `deadline` appear on the calendar as `type:'goal'` events with a **🎯 icon**.
- **v1.16.0**: `buildAllEvents()` (FullCalendar) merges goals by `deadline` after tasks, rendered with the distinct `.ev-goal` class (gold) — replacing the old `getEventsForDate`/`buildDayCell`/`.day-ev.goal` fusion.

### Edit a task from the calendar

- Task events on the calendar are clickable and open the **existing Edit Task modal** (`openAddTaskModal('', null, task)`), thanks to `eventClick` routing by `extendedProps.type === 'task'` → `refId` (v1.16.0 `js/calendar.js` `onEventClick`).
- `openAddTaskModal`, `toggleTask`, and `deleteTask` (`js/tasks.js`) still call `renderCalendar()` when `currentView === 'calendar'`, so editing/completing/deleting a task from the calendar refreshes it immediately (refreshes the FC event source).

## v1.13.0 — customizable bottom nav + on-the-fly wishlist lists

### Bottom nav (mobile) is now dynamic (`js/router.js` + `index.html`)

- **The hardcoded bottom-nav buttons were removed from `index.html`** (this also killed the stale `data-view="hobbies"` residue from before the Growth rename). The `.bottom-nav-inner` container is now empty; `renderBottomNav()` builds the buttons at runtime.
- **9 selectable entries**, matching the sidebar: `dashboard` (Home), `journal`, `calendar`, `documents`, `suivi` (→ `goTo('goals')`), and the four dynamic category roots `family`/`growth`/`career`/`finance` (resolved by root **name** via `resolveRootByName`, navigated with `goToCategory(rootId)`). Finance root's `finance-table` module redirects to the Finance view as before.
- **`BOTTOM_NAV_ENTRIES`** (label/icon/view-or-catName) + **`BOTTOM_NAV_DEFAULT`** live in `js/router.js`; `getBottomNavPrefs()` reads `state.settings.bottomNav` (ordered array of keys, falls back to `BOTTOM_NAV_DEFAULT`). Buttons use inline `onclick="goTo('...')"` / `goToCategory('...')` and `data-bn-key` (NOT `data-view`).
- **`updateBottomNav()`** (called from `goTo` and `goToCategory`) syncs `.active` + the sliding `#bn-pill` position via `bnActiveKey()` (matches views + the active category root). `renderBottomNav()` is called in `launchApp()` (`js/auth.js`).
- **Settings UI**: the `⚙️ Settings` modal (`js/water.js`) now has a `customBody` **"Barre du bas (mobile)"** editor: a row per entry with a checkbox (include), `↑`/`↓` reorder buttons (`bnToggle`/`bnMove`/`renderBnEditor`/`initBnEditor`, module state `bnOrder`/`bnOn`). Saving writes `state.settings.bottomNav` via `saveProfile({ bottomNav })` and re-renders the nav. At least one entry required.

### Wishlist: create a new list on the fly (`js/finance.js`)

- The Wishlist page header now has **`+ New List`** next to `+ Add Item`. `openAddWishlistList()` opens a one-field modal; on save it appends the name to `f.wishlistLists` (`settings.finance.wishlistLists`) via `saveFinance(f)`, then `renderFinance()`. Duplicate names (case-insensitive) are rejected. The new list immediately appears as an option in the Add/Edit item modals.

## v1.14.0 — restructured morning ritual (4 questions) + new afternoon check-in (3 questions)

### Morning ritual — 4 ordered questions (`js/ritual.js` `MORNING_QS`)

New order, replacing the old 3-question morning:

1. `morningFocus` (text) — "What's your ONE priority today?" — still becomes a real `isDayPriority` task via the shared `ensureDayPriorityTask(title, dateKey)` helper (v1.12.0 behavior preserved).
2. `morningObstacle` (text) — "What could go wrong today, and how will you handle it?" (contingency plan).
3. `energy` — the existing 🔋 energy slider, now its own question (was previously bundled with the mood picker). **v1.15.0**: saved as `journal.{date}.energy` as a 3-level string `'low' | 'medium' | 'high'` (slider 1-3→low, 4-7→medium, 8-10→high, mapped by the shared `energyLevel(v)` helper in `js/helpers.js`), so the ritual writer and the dashboard Weekly Energy widget share one format.
4. `mood` — **new 7-emoji single-select** stored on `journal.{date}.mood` (new field; old `morningMood` field still read as a fallback by `js/dashboard.js` `renderDashCheckins` and `js/journal.js` `renderJournal`). Exact emoji set: 😊 Content · 😰 Stressé · 😢 Triste · 😠 En colère · 😐 Neutre · 😴 Fatigué · 😟 Anxieux.

### Afternoon check-in — new 3-question ritual (`AFTERNOON_QS`, badge `🌤 Afternoon Check-in`)

- **Window**: `checkRitual()` now triggers it 12pm–6pm when `journal.afternoonDone` is not set (morning 5am–12pm and evening 6pm+ unchanged). Completed flag is `journal.afternoonDone`.
- **Q1 `priorityDone`** (`type: 'check'`) — renders today's `isDayPriority` task with a ✓ `task-check` button that calls **`toggleTask(id)` directly** (reuse — no duplicate completion state). If no day-priority task exists → "Aucune priorité définie". `renderRitualCheck()` + `ritualToggleDayPriority(id)` handle it.
- **Q2 `highlight`** (`type: 'text'`) — free-text saved to `journal.{date}.highlight`.
- **Q3 `tomorrow`** (`type: 'tomorrow'`) — free-text saved to `journal.{date}.tomorrow`, plus a `#ritual-tomorrow-btn` ("⭐ Create as tomorrow's priority") that calls `createTomorrowPriority()` → `ensureDayPriorityTask(text, dk(tomorrow))`, creating/reusing an `isDayPriority` task dated tomorrow (dedupe by existing tomorrow day-priority task; empty text is a no-op).

### Question-type plumbing

`showRitualStep` now dispatches on 5 types: `text`, `mood` (mood row), `energy` (slider), `check` (task row), `tomorrow` (textarea + button). Progress bars are generated dynamically (`#ritual-progress` innerHTML rebuilt per step) instead of the old 3 hardcoded bars, so 4-question morning and 3-question afternoon both render correctly. `getRitualQs()` selects the question array by `ritualType`.

## v1.15.0 — compact accordion dashboard + monthly habits + energy levels

### Dashboard restructure (`js/dashboard.js` + `index.html` `#view-dashboard`)

The dashboard is now a stack of **per-section collapsible accordions** (`.dash-accordion`), each with its own collapse state — no shared global toggle. Two independent state Sets, following the existing goals/sprint accordion pattern:

- `window._dashCollapsed` — section keys (`habits`, `checkins`, `energy`, `goals`, `weekly`, `captures`, `achievements`), toggled by `toggleDashSection(id)` (flips `#dash-body-{id}` `.collapsed` + `#dash-chev-{id}` `.expanded`).
- `window._dashHabitGroups` — habit subgroup keys (`daily`, `weekly`, `monthly`), toggled by `toggleDashHabitGroup(group)`.

Sections (all `grid-column: 1 / -1`):
1. **Habits** — header with total count; body holds 3 nested sub-accordions (`.dash-sub-accordion`) **Daily / Weekly / Monthly** (`dash-habits-daily/weekly/monthly`). Each habit row = compact `task-check-sm` today-toggle + name + sub-category tag + `🔥 N{mo,wk,d}` streak badge. Bucketing: `monthly`→Monthly, `weekly`/`3x_per_week`→Weekly, everything else (daily/once)→Daily (`dashHabitGroup(freq)`).
2. **Morning / Afternoon** — `renderDashCheckins` (renamed from `renderDashRitualSummary`): today's mood/focus/priority line + a compact 7-day strip (`.dash-checkin-strip`, 2 tiny dots per day for `morningDone`/`afternoonDone`).
3. **Energy** — `renderDashEnergy` + `setDashEnergy(level)`: 3 emoji buttons (🔋 low / 🔋🔋 medium / 🔋🔋🔋 high) that write `journal.{date}.energy` (low/medium/high) via `saveDoc('journal', ...)`, plus a 7-day energy strip.
4. **Goals by Life Area** — `renderDashGoals`: goals grouped by `getGoalLifeArea(g)`, avg `computeGoalProgress(g).progress` per area, colored bars via `AREA_COLORS`.
5. **Weekly Tasks** — `renderDashWeeklyChart`: the existing created-vs-completed 7-day chart, extracted to its own accordion.
6. **Recent Captures** — unchanged data (`renderDashCaptures`), now an accordion.
7. **Achievements** — `renderDashAchievements` trimmed to stats + tasks/habits by category + wins (weekly chart and goals moved to their own accordions above).

### Removed widgets (rendering + calls, not just CSS)

- **Day progress ring**: `renderTimeRing`/`startDayProgressTicker` deleted; `#time-ring-*` HTML/CSS removed; `startDayProgressTicker()` call removed from `js/auth.js` `launchApp`.
- **Family protected-time widget**: `renderDashFamilyBlocks` deleted; `#dash-family-blocks` HTML + `.family-card` CSS removed; `renderDashFamilyBlocks()` calls removed from `js/family.js` (both the add-block and edit-block handlers). The Family *view*'s own blocks list (`.family-blocks`, `.family-block-item`, `.protected-badge` in `renderFamilyBlocks`) is untouched.

### Habit frequency `monthly` (v1.15.0)

See `progress-model-spec.md` §2 for the full rules. Summary: unit becomes calendar months (`monthKey` = `YYYY-MM`, helpers `monthKey`/`monthsBetweenKeys` added to `js/habits.js`); "successful month" = ≥1 check-in in the calendar month; `calcStreak` counts consecutive successful months; `computeHabitProgress` deadline-mode = `successfulMonths / monthsBetweenKeys(createdAt, deadline)`, rolling-mode = distinct recent months / `monthsBetweenKeys(30 days ago, today)`. `freqLabel`/form options/streak-badge unit extended accordingly.

### Energy levels (`energyLevel`/`energyLabel`)

- New shared helpers in `js/helpers.js`: `energyLevel(v)` normalizes a value to `'low'|'medium'|'high'` (numeric 1-10 → low 1-3 / medium 4-7 / high 8-10; passes through already-level strings), `energyLabel(v)` returns a display string.
- `js/ritual.js` `saveRitual` maps the morning slider value through `energyLevel` before persisting.
- Readers: `js/journal.js` `renderJournal` and `js/dashboard.js` now display energy via `energyLabel`.

## v1.16.0 — FullCalendar v6 (CalendarJS + homemade grid removed)

### CDN (no bundler) — `index.html`

The calendar is now **FullCalendar v6.1.21** global builds (styles are injected by the JS; no CSS file needed). Scripts load in `<body>` before `js/main.js`:

- `@fullcalendar/core`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/list`, `@fullcalendar/interaction` — all `@6.1.21/index.global.min.js` — plus `@fullcalendar/core@6.1.21/locales/fr.global.min.js`.
- **Version pinning note**: FullCalendar's latest npm tag is **v7.0.2**, but v7 dropped the per-plugin `index.global.min.js` CDN builds (core@7 ships ESM-only files), so the individual-plugin script-tag pattern requires **6.x** — 6.1.21 is the newest 6.x. Do not "upgrade" the CDN tags to @7; there is no v7 global-build equivalent. Premium `timeline`/`resource-timeline` views are a separate paid SDK (`fullcalendar-scheduler`) and are **not** used.
- Removed: `@calendarjs/ce` (script + style), `lemonadejs`, and the CalendarJS `<link>`.

### Container + toolbar (`index.html` `#view-calendar`)

- The custom nav buttons/toggles are gone (`#cal-prev/next/today/week-next/month-next`, `#cal-view-*`, `#schedule-type-toggle`, `#cal-title`). Toolbar is now just `#cal-date-picker` (goes to a date via `gotoDate`) + `#add-event-btn` (+ Event), and the connect bar (`#btn-connect-google-cal`, `#btn-connect-outlook-cal`).
- The FullCalendar instance renders into a single **`<div id="calendar">`** (was `#calendarjs-schedule`/`#calendarjs-timeline`).
- **View toggle + nav**: FullCalendar's `headerToolbar` renders `left: 'prev,next today'`, `center: 'title'`, `right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'` — all four views with one toggle, navigation handled entirely by the FC API (`today()/prev()/next()/gotoDate()`). `locale: 'fr'`, `buttonText` maps to Mois/Semaine/Jour/Liste, `dayMaxEvents: 3`, `nowIndicator: true`, `height: 'auto'`.

### Event source mapping (`js/calendar.js`)

- `buildAllEvents()` → `buildFcEvent()` merges every source into FC `EventInput`s distinguished by `classNames` (`ev-task`, `ev-goal`, `ev-event`, `ev-google`, `ev-outlook`) + `extendedProps.type`/`refId`:
  1. **Tasks** with `dueDate` (all-day unless a start time exists).
  2. **Goals** with `deadline` (🎯 prefix).
  3. **Local events** (`state.events`) with `date` + optional `startTime`/`endTime`.
  4. **Google sync** (`state.googleCalendarEvents`) and **Outlook sync** (`state.outlookCalendarEvents`).
- **Default 30-min duration**: when an event has a `startTime` but no `endTime`, `end = start + 30min` is computed **at event-build time only** (`buildFcEvent`/`addMinutes`). It is never persisted — Firestore keeps the stored shape (absent `endTime` stays absent), per the stored-state rule.
- `refreshCalendarEvents()` swaps the FC event source (remove-all + `addEventSource({ id: 'brain', events: buildAllEvents() })`); called by `renderCalendar()` which is re-invoked from `router.js` `goTo('calendar')` and `js/tasks.js` mutations (unchanged call sites).

### Click routing

- `dateClick` → `openAddEventModal(info.dateStr)` (pre-fills date). `+Event` button → `openAddEventModal()` (no prefill). Same unified modal as v1.10.0.
- `eventClick` → `onEventClick` routes by `extendedProps.type`: **task** → Edit Task (`openAddTaskModal('', null, task)`), **goal** → Edit Goal (`openAddGoalModal(goal)`), **event** → edit/delete local event (`openAppEventModal(item)`, reuses the same fields as add + 🗑 Delete), **google/outlook** → read-only detail (`openExternalEventModal(ev)`, no form).

### External sync fetch range

- `fetchGoogleCalendarEvents`/`fetchOutlookCalendarEvents` now use `currentFcRange()` = the FC instance's visible `view.currentStart`/`currentEnd` (fallback: ±1 month window) instead of the removed `calYear`/`calMonth` globals.

## CSS additions (style.css)

Key classes: `.goal-accordion` (card container), `.goal-accordion-header` (clickable row), `.goal-accordion-chevron` (▶ toggle), `.goal-accordion-summary` (title+progress), `.goal-accordion-title-row` (title+tags), `.goal-accordion-body` (expandable content), `.goal-accordion-body.collapsed` (hidden). Sprint root accordions: `.sprint-root-accordion`, `.sprint-root-header`, `.sprint-root-chevron`, `.sprint-root-title`, `.sprint-root-count`, `.sprint-root-body` (`.collapsed` hidden, last inner goal has no bottom margin).

**v1.12.0**: `.pri-day-badge` (⭐ Priorité du jour pill — accent-purple gradient, used in the Tasks list + Dashboard Morning Check-in). **v1.14.0**: `.ritual-time-badge.afternoon` (amber/orange variant), `.ritual-check-row` + `.ritual-check-title` (afternoon Q1 task row), `.btn-ritual-tomorrow` (outlined accent button). **v1.15.0**: dashboard accordion stack — `.dash-accordion`/`-header`/`-chevron`/`-title`/`-count`/`-body` (+`.collapsed`), `.dash-sub-accordion`/`-header`/`-chevron`/`-title`/`-count`/`-body` (habit subgroups), `.dash-habit-row`/`-name`/`-tag`/`-streak`, `.dash-checkin-strip`/`-day`/`-dot` (+`.done`), `.dash-energy-btn` (+`.selected`)/`-strip`/`-day`, `.dash-goal-area`/`-head`/`-bar`/`-fill`. Removed: `.time-ring-card`, `.time-ring-wrap`, `.habit-rings-card/row/item/name`, `.family-card`. **v1.16.0**: FullCalendar v6 theme overrides scoped to `#view-calendar .fc` — `--fc-border-color`/`--fc-page-bg-color`/`--fc-neutral-bg-color`/`--fc-list-event-hover-bg-color`/`--fc-today-bg-color` mapped to design tokens, `.fc-button` reskinned (`.fc-button-active` → `--accent`), day numbers/col-header via `--text(-soft)`, event chip `.fc-event` styled with readable text, per-type event backgrounds: `.fc-event.ev-task`/`.ev-event` (accent purple), `.ev-goal` (gold `--growth`), `.ev-google` (red `--family`), `.ev-outlook` (blue `--finance`) — each a colored left border + translucent tint, not close purples. Removed: `.cal-nav-btn`, `.cal-today-btn`, `.cal-view-toggle`, `.cal-view-btn`, `.cal-title`, all `.cal-day`/`.day-num`/`.day-ev`/`.cal-days` homemade grid classes, and the CalendarJS `.lm-calendar*`/`#calendarjs-root` override block.

## Sprint tracker — live from goals, never stored

The Sprint-level overall progress bar is **always computed live** as the average of `displayPct` (auto+manual) of every goal with `isSprintObjective === true` and `sprintQuarter === current quarter`. It never reads a stored field. When there are 0 sprint objectives, the bar shows "No objectives yet".

### Sprint objectives — grouped by root-category accordion (v1.4.0)

`renderSprint` groups sprint goals by **root category** (Family / Growth / Career / Finance). Each root is itself a collapsible accordion (`.sprint-root-accordion` + `.sprint-root-header` + `.sprint-root-body`, chevron toggles via `toggleSprintRootExpand(rootKey)`, state in `window._collapsedSprintRoots`, **expanded by default**). Uncategorized goals land in a "🗂 Uncategorized" root.

Each objective inside a root is rendered with the **existing goal accordion** `buildGoalAccordionHtml(g)` — no duplicated components: click title/chevron expands linked Tasks/Habits inline, ✎ pencil opens the metadata modal, manual stepper shows for manual goals. The old flat `.sprint-obj` markup and its helpers (`toggleSprintDetail`, `resetSprintGoal`, `removeSprintObjective`) were removed — removing a goal from the sprint is now done via the pencil modal's "Sprint Objective?" field.

Mutation functions that trigger `renderSprint()` for immediate reactivity:
- `toggleTask`, `deleteTask`, `openAddTaskModal` (submit)
- `toggleHabitToday`, `deleteHabit`, `openAddHabitModal` (submit)
- `adjustGoalProgress`, `toggleMilestone`, `deleteGoal`
- `add-sprint-obj-btn` (submit)

**Bug fix (v1.6.0)**: on the Sprint view, goal accordions are rendered into `#sprint-objectives-list` by `renderSprint()`, but `rerenderGoalsList()` only dispatched to `renderCategoryContent()`/`renderGoals()` (the hidden Suivi panel). So `toggleGoalExpand` (and the accordion's inline task/habit mutation handlers) toggled the state Set without re-rendering the visible sprint list — a goal only *appeared* to open when a different action happened to re-render the sprint afterwards ("sometimes opens, sometimes doesn't"). `rerenderGoalsList()` now dispatches to `renderSprint()` on the Sprint view. All accordion state is id-keyed Sets (`expandedCategories`, `window._expandedGoals`, `window._collapsedSprintRoots`) — no shared single-variable state, so roots and nested goals expand independently.

## Auto-activate category tabs on content creation (v1.4.0)

Bug fix: creating a Goal targeting a category whose page has no activated "Goals" tab (tabs are opt-in) made the goal invisible everywhere. `ensureCategoryTabForType(catId, type, defaultLabel)` (near `openAddTabModal`, ~L4190) now auto-adds the missing tab at save time:

- Idempotent: no-op if the category already has a tab of that `type`; skips non-`generic` moduleTypes (meals / finance-table / dateIdeas have no tab system).
- Called from every content-creation path after the item is saved: `openAddGoalModal` + `add-sprint-obj-btn` → `'goals'` ('🎯 Goals'), `openAddTaskModal` → `'tasks'` ('☑️ Tasks') via the task's goal's `categoryId`, `openAddHabitModal` → `'habits'` ('🔥 Habits') likewise.
- If this was the category's first tab, `window._activeCategoryTab` is set to it so the new content shows immediately; otherwise `renderCategoryContent` auto-selects a valid tab.

## Rename category tabs (v1.5.0)

Every category tab (tasks / goals / habits / list — manual or auto-created) can be renamed inline. The tab bar was extracted into `renderCategoryTabBar(cat)` (returns the bar HTML, `id="cat-tab-bar"`); each tab now has a small ✎ button next to its label.

- `startTabRename(catId, tabId)` — sets `window._renamingTabId` and re-renders just the bar, replacing the tab with a single text input pre-filled with the current label (focused + text selected).
- Save on Enter / blur via `finishTabRename(catId, tabId, value)`; cancel on Escape via `cancelTabRename(catId, tabId)` (guarded by the `_tabRenameArmed` flag so the blur triggered by the re-render doesn't fire the save).
- Save only mutates `categories.tabs[].label` (via `saveDoc('categories', id, { tabs })`) — `type` and content underneath are untouched. Empty value = no change.
- Purely a display-label change; works identically for tabs created by `ensureCategoryTabForType` (e.g. the auto-added "🎯 Goals" tab).

## Module → render-function → line-anchor map (app.js)

| Module | Key render function(s) | Approx. lines |
|---|---|---|
| Dashboard | `renderDashboard` (v1.15.0: accordion-based layout), `renderGreeting`, `renderDashStats`, `renderDashHabits` (v1.15.0: Daily/Weekly/Monthly sub-accordions), `renderDashCheckins` (v1.15.0: 7-day Morning/Afternoon strip; was `renderDashRitualSummary`), `renderDashEnergy` (v1.15.0: 3-emoji buttons + 7-day strip), `setDashEnergy` (v1.15.0), `renderDashGoals` (v1.15.0: goals progress by Life Area), `renderDashWeeklyChart` (v1.15.0), `renderDashCaptures`, `renderDashAchievements` (v1.15.0: stats + categories only; weekly chart/goals moved to own accordions), `toggleDashSection`/`toggleDashHabitGroup` (v1.15.0: per-section accordion state in `window._dashCollapsed` / `window._dashHabitGroups`) | 584-890 |
| Onboarding | `checkOnboarding`, `showObStep`, `launchApp` | 325-436 |
| Daily ritual | `checkRitual`, `openRitual`, `showRitualStep`, `renderRitualCheck`, `ritualToggleDayPriority`, `createTomorrowPriority`, `ensureDayPriorityTask` (v1.14.0: shared day-priority task upsert — morning focus + afternoon tomorrow), `saveRitual` (v1.12.0: morning `morningFocus` also creates an `isDayPriority` task; v1.14.0: morning = 4 questions incl. `energy` + `mood`, new 3-question afternoon check-in; v1.15.0: `energy` stored as low/medium/high via `energyLevel`) — `js/ritual.js` | — |
| Quick capture / Inbox | `saveCapture`, `toggleVoice`, `updateInboxBadge`, `renderInbox`, `processCapture`, `dismissCapture` | 736-860 |
| Tasks | `renderTasks` (Today/Upcoming/All — `isDayPriority` first + ⭐ badge), `renderTghTasks`, `openAddTaskModal(prefill, captureId, item, overrides)`, `toggleTask`, `deleteTask`, `startTaskTimer`, `updateTimerDisplay`, `completeTimer`, `clearTimer`, `openPauseScreen`; task mutations re-render calendar on `view-calendar` | 860-1096 |
| 3-Month Sprint (unified with goals) | `renderSprint`, `toggleSprintRootExpand`, `computeSprintGoalProgress`, `getQuarterLabel`, `getQuarterStart/End` | ~1523-1650 |
| Notes | `renderNotesList`, `stripHtml`, `openNote`, `saveCurrentNote`, `createNoteFromCapture` | ~1326-1440 |
| Documents (Storage) | `handleFileUpload`, `renderDocuments`, `openDocument`, `deleteDocument` | ~1440-1550 |
| Calendar (Google) | `handleGcalAuth`, `fetchGoogleCalendarEvents`, `connectGoogleCalendar`, `disconnectGoogleCalendar` | ~1550-1630 |
| Calendar (Outlook/MSAL) | `initMSAL`, `connectOutlookCalendar`, `fetchOutlookCalendarEvents`, `disconnectOutlookCalendar` | ~1630-1740 |
| Calendar (FullCalendar v6 render) | `renderCalendar`, `ensureCalendar`, `refreshCalendarEvents`, `buildAllEvents`, `buildFcEvent` (tasks + goals-by-`deadline` + events, `end = start + 30min` display-only), `onDateClick` → `openAddEventModal(key)`, `onEventClick` → edit task / edit goal / edit event (`openAppEventModal`) / readonly sync (`openExternalEventModal`), `openAddEventModal(prefillDate)`, `openAppEventModal(item)`, `openExternalEventModal(ev)`, `restoreCalendarConnections` — `js/calendar.js` | — |
| Goals & Habits (Suivi — onglets dynamiques) | `renderSuiviTabBar`, `renderSuiviActiveTab`, `renderSuiviList`, `openAddSuiviTabModal`, `removeSuiviTab`, `rerenderGoalsList`, `buildGoalAccordionHtml`, `toggleGoalExpand`, `renderGoals`, `renderTabGoals`, `renderTghTasks`, `openAddGoalModal(item)`, `adjustGoalProgress`, `deleteGoal`, `toggleMilestone`, `renderHabits`, `renderHeatmap`, `calcStreak`, `computeHabitProgress`, `daysBetween`, `toggleHabitToday`, `openAddHabitModal(item, overrides)`, `deleteHabit` | ~1860-2460 |
| Journal | `renderJournal`, `saveJournalField` | ~2100-2140 |
| Family mode | `renderFamily`, `renderBabyCountdown`, `renderFamilyBlocks`, `openEditFamilyBlock`, `deleteFamilyBlock`, `renderBabyMilestones`, `toggleBabyMilestone`, `renderFamilyScore`, `initFamilyTabs` | ~2140-2310 |
| Meals (Family sub-tab) | `renderRecipes`, `openRecipeModal(item)`, `deleteRecipe`, `renderMealPlan`, `openMealPlanModal`, `generateGroceryList` | ~2310-2460 |
| Categories (sidebar + tab system) | `renderSidebarCategories`, `buildSidebarNode`, `toggleCategoryExpand`, `toggleSuiviExpand`, `goToCategory`, `renderCategoryContent`, `renderCategoryTabBar`, `startTabRename`, `finishTabRename`, `cancelTabRename`, `openAddCategoryModal`, `openEditCategoryModal`, `deleteCategory`, `buildMealsContent`, `seedInitialCategories`, `buildCategoryOptions`, `renderCategoryTabContent`, `renderTabTasks`, `renderTabGoals`, `renderTabHabits`, `renderTabList`, `openAddTabModal`, `removeCategoryTab`, `ensureCategoryTabForType` | ~2924-3920 |
| Hobbies | `renderHobbies`, `showHobbiesList`, `openHobbyDetail`, `renderHobbyObjectives`, `openHobbyModal(item)`, `deleteHobby`, `addHobbyObjective`, `adjustHobbyObjective`, `deleteHobbyObjective` | ~2672-2814 |
| Date Ideas | `renderDateIdeasContent`, `seedDateIdeas`, `addDateIdea`, `editDateIdea`, `deleteDateIdea`, `openAddDateIdeaModal`, `scheduleDateIdea` | ~3768-4075 |
| Finance (Phase 5) | `renderFinance`, `renderFinanceMonth`, `renderFinanceSettings`, `renderWishlist`, `openAddWishlistList` (v1.13.0), `calcFinanceMonth`, `switchFinanceTab`, `getFinance`, `saveFinance` | ~3772-4362 |
| Finance import | `scripts/finance-import/import_finance.py` | external script |
| Time Audit | `renderTimeAudit` (groups entries by root category) | ~2530-2580 |
| Wins log | `logWin(categoryId?)`, `renderWins` (groups by root category) | ~2580-2610 |
| Generic modal system | `openModal`, `buildField`, `closeModal` | ~2610-2670 |
| Nudges/end-of-day | `startHourlyNudge`, `hourlyNudge`, `checkEndOfDay` | ~2670-2710 |
| Water reminder + settings (v1.11.0) | `startWaterReminder`, `stopWaterReminder`, `waterNotify`, `openSettings`, `getWaterSettings` — `js/water.js` (separate module, not in app.js) | — |
| Bottom nav (v1.13.0) | `renderBottomNav`, `updateBottomNav`, `getBottomNavPrefs`, `bnActiveKey`, `resolveRootByName`, `BOTTOM_NAV_ENTRIES` — `js/router.js`; editor `initBnEditor`/`renderBnEditor`/`bnToggle`/`bnMove` — `js/water.js` | — |

Use this table to jump straight to a `view_range` instead of loading the full file.

## Utilities (app.js ~L54-75)

`uid()` (random id), `dk(date)` (date key `YYYY-MM-DD`), `esc(str)` (HTML-escape), `formatMin`, `formatSec`, `relativeDay(dateStr)` (Today/Tomorrow/Overdue label).
