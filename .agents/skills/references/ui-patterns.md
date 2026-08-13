# UI & CRUD Patterns

## Generic modal builder (app.js ~L3442-3496)

Always prefer this over hand-rolled modal markup:

```js
openModal({
  title: 'Add Task',
  sub: 'optional subtitle',
  fields: [
    { name: 'title', label: 'Title', type: 'text', required: true, placeholder: '...' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
    { name: 'priority', label: 'Priority', type: 'select', options: [['high','High'],['medium','Medium'],['low','Low']] }
  ],
  submit: 'Save',
  onSubmit(vals) {
    // vals.title, vals.notes, vals.priority — build your object, saveDoc(), mutate state, re-render
  }
});
```

Supported field `type`s: `text` (default), `textarea`, `select`, or any native `<input type>` (`date`, `number`, etc. pass straight through). `buildField()` handles rendering; don't duplicate its markup elsewhere.

- `customBody`: optional HTML string rendered before the form fields.
- `onSubmit` is synchronous and runs to completion; `closeModal()` is called immediately after it returns. Do NOT return `false` to keep the modal open — that pattern was removed.

`closeModal()` is called automatically after `onSubmit`. Escape key and overlay-click-outside already close the modal globally — no need to wire that per-instance.

## Goal: two distinct interactions (accordion vs pencil)

Goal rows use a shared builder `buildGoalAccordionHtml(g)` on both the Suivi Goals tab and the category-page Goals tab. Two separate interactions, never mixed:

1. **Expand accordion** — clicking the row header or its chevron calls `toggleGoalExpand(id)` (`window._expandedGoals` Set). The expanded body holds the goal's Tasks and Habits inline (add/edit/check/delete) plus milestones and manual stepper. Inline mutations re-render through `rerenderGoalsList()` (view-aware: `renderCategoryContent()` on category pages, else `renderGoals()`).
2. **Edit metadata** — the ✎ pencil button on the row opens `openAddGoalModal(goal)`: a small modal with exactly 4 fields (`title`, `categoryId`, `deadline`, `isSprintObjective`). No milestones, no weekly actions, no tasks/habits list.

The Edit Goal modal does NOT contain a children panel — tasks/habits live exclusively in the accordion.

## Standard CRUD cycle for a list-backed module

```js
async function addThing(payload) {
  const item = { id: uid(), ...payload, createdAt: Date.now() };
  state.things.push(item);
  await saveDoc('things', item.id, item);
  renderThings();
}
async function deleteThing(id) {
  state.things = state.things.filter(t => t.id !== id);
  await deleteDoc('things', id);
  renderThings();
}
```

Local state is mutated optimistically before/without waiting on the network; `saveDoc`/`deleteDoc` already handle their own error toast internally, so callers don't need extra try/catch for the common case.

## Toast notifications (app.js ~L76-83)

```js
toast('Saved!', 'success');   // types: 'success' | 'error' | 'info' (default)
```

## Rendering convention

Render functions build an HTML string and assign it via `.innerHTML` on a container, e.g.:

```js
function renderThings() {
  document.getElementById('things-list').innerHTML = state.things.map(t => `
    <div class="card">
      <span>${esc(t.title)}</span>
      <button onclick="deleteThing('${t.id}')">✕</button>
    </div>`).join('') || '<div class="empty-state">Nothing yet.</div>';
}
```

Notes:
- `esc()` wraps every piece of user-entered text.
- Inline `onclick="fn('${id}')"` handlers (not `addEventListener`) are the established pattern for list-item actions in this codebase — follow it for consistency rather than introducing delegated listeners, unless refactoring the whole module.
- An empty-state string (`<div class="empty-state">...</div>`) is shown via `||` fallback when the array is empty — every module does this.

## CSS custom properties (style.css `:root`, ~L9-60)

| Token | Purpose |
|---|---|
| `--bg`, `--bg2`, `--surface`, `--surface2`, `--surface3` | Background layers (dark theme) |
| `--border`, `--border2` | Border colors |
| `--accent`, `--accent-light`, `--accent-dim`, `--accent-glow` | Primary purple accent |
| `--family`, `--career`, `--growth`, `--finance` | The 4 Life Area colors — reuse for anything tagged to an area |
| `--success`, `--warning`, `--danger`, `--info` | Status colors |
| `--text`, `--text-soft`, `--text-muted` | Text hierarchy |
| `--pri-high`, `--pri-medium`, `--pri-low` | Task priority colors |
| `--radius`, `--radius-sm`, `--radius-xs` | Border radii |
| `--sidebar` (260px), `--bottom-nav` (64px) | Layout dimensions |
| `--font` ('Inter') | Typeface |
| `--ease-out`, `--ease-spring` | Transition easing curves |

Never hardcode a new hex color for something that already has a semantic token above.

## Navigation shell

- Sidebar buttons: `.nav-btn[data-view="{id}"]`
- Bottom mobile nav buttons: `.bottom-nav-btn[data-view="{id}"]`
- Both must be added together when introducing a new view, or the module will be reachable on desktop but not mobile (or vice versa).
- Mobile sidebar toggling is a separate concern (`#app.sidebar-open` class) — don't touch unless the task is specifically about the mobile nav shell.
