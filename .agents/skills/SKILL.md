---
name: second-brain-app
description: Codebase knowledge for the "Second Brain" personal dashboard (vanilla JS + Firebase single-page app — index.html, app.js, style.css, firestore.rules, storage.rules). Use when adding, editing, or debugging features in this project — new modules, Firestore-backed data, dashboard widgets, modals, calendar/habit/task/journal/goals logic, or when asked to "vibe code" a spec into this app. Do NOT read app.js/index.html/style.css in full before checking this skill's references — they contain the same information pre-indexed at a fraction of the tokens.
metadata:
  version: 1.24.0
  author: project-owner
  category: web-app-maintenance
---

# Second Brain — Personal Dashboard

Single-page vanilla JS app. No framework, no bundler, no build step. One `index.html`, one `app.js` (~3,000 lines), one `style.css` (~1,600 lines), backed by Firebase (Auth + Firestore + Storage).

## Before touching code

1. Read `references/architecture.md` first — it maps the entire app (state shape, every module's render function + line anchor, the Firestore helper layer, the view-routing system). This alone is usually enough to write a correct patch without opening the full files.
2. Only open `app.js` / `index.html` / `style.css` with a targeted line range (`grep -n` or `view` with `view_range`) once you know exactly which function/section you need from the map in step 1. Never load the whole file "just in case" — it burns ~15-20k tokens for content this skill already summarizes in ~1.5k.
3. For CRUD/modal/UI conventions, read `references/ui-patterns.md`.
4. For the Firestore data model and security rules, read `references/firestore-schema.md`.

## Golden rules of this codebase

- **State lives in one global `state` object** (see architecture.md). Every module is `state.<arrayName>`, synced to Firestore under `users/{uid}/<collectionName>`.
- **Every mutation follows: mutate local `state` → call `saveDoc(collection, id, data)` or `deleteDoc(collection, id)` → call the module's `render*()` function.** There is no reactive framework; re-render is always explicit and manual.
- **All views are `<div class="view" id="view-{id}">` in index.html**, toggled by `goTo(viewId)`, dispatched to a `render{Name}()` function via the `switch` in `renderView()`. Adding a view = adding an entry in the `VIEWS` object + a case in `renderView()` + an HTML section + a nav button (see architecture.md for exact locations).
- **Forms/CRUD dialogs use the generic `openModal({title, fields, submit, onSubmit})` builder** — don't hand-roll new modal HTML/CSS unless the layout genuinely can't fit the generic field types (`text`, `textarea`, `select`).
- **Escape all user text with `esc()`** before interpolating into `innerHTML` (XSS hygiene already established in the codebase — keep following it).
- **Colors, spacing, radii are CSS custom properties on `:root`** in style.css (`--accent`, `--surface`, `--radius`, the four life-area colors `--family/--career/--growth/--finance`, priority colors `--pri-high/medium/low`). Reuse these tokens; don't hardcode new hex values.
- **Firebase config, collection names, and security rules already restrict all data to `users/{uid}/...`.** Never add a Firestore path outside that prefix.

## Typical task recipes

**"Add a new module/tab (e.g. Contacts)"**
1. `architecture.md` → copy the pattern from an existing simple module (e.g. Wins, since it's the smallest: list + add).
2. Add `contacts: []` to the `state` object.
3. Add an entry to `VIEWS` and a `case` in `renderView()`.
4. Add `<div class="view" id="view-contacts">` in index.html + a nav button (sidebar + bottom nav, both use `data-view="contacts"`).
5. Write `renderContacts()` following the list-render pattern in `ui-patterns.md`.
6. Use `openModal(...)` for the add/edit form; persist with `saveDoc('contacts', id, data)`.

**"Change styling of X"** → grep the relevant class in style.css only; don't reload the whole stylesheet. CSS variable names are in `references/ui-patterns.md`.

**"Add a Firestore field to an existing module"** → check `firestore-schema.md` for the current shape of that collection, then extend `saveDoc` payload + the render function that reads it. No schema migration system exists — new fields must default gracefully when absent (`data.field || defaultValue`).

## Token-efficiency note for the assisting LLM

This skill's whole purpose is to let you skip re-reading the raw source on every request. If a task can be fully specified from `architecture.md` + `ui-patterns.md` + `firestore-schema.md`, write the patch (as a `str_replace`/diff against the *named* function) without viewing the full files first. Only fall back to viewing raw source when the references disagree with what you find, or the task touches code not indexed here.

## Keeping this skill in sync (self-maintenance)

The references are a snapshot, not a live index — they drift as the code changes. Treat drift as ongoing maintenance, not a one-off request:

- **After any edit that adds/removes a function, module, Firestore collection, or CSS token**, update the relevant reference file in the same turn: add/adjust the row in `architecture.md`'s function-map table, add the collection to `firestore-schema.md`, etc. Small, incremental edits — don't regenerate a whole reference file for a one-line change.
- **If asked to do a broader "sync the skill" pass**, diff your understanding of the current `app.js`/`index.html`/`style.css` against what's written in `references/*.md`: line-number anchors that moved by more than ~15-20 lines, functions renamed/removed/added, new modules not yet in the function-map table, new CSS custom properties, new Firestore collections. Update only what actually drifted; leave accurate sections untouched to save tokens.
- **Never let a reference file describe code that no longer exists.** A wrong map is worse than no map — it causes confidently-wrong edits.
- Bump `metadata.version` in this file's frontmatter (e.g. `1.0.0` → `1.1.0`) whenever you update a reference, so it's obvious at a glance the skill was refreshed and roughly how many times.
