function renderRecipes() {
  const el = document.getElementById('recipes-list');
  if (!state.recipes.length) {
    el.innerHTML = `<div class="empty-state" style="padding:20px 0"><p>No recipes yet.</p><small>Add your first recipe to start planning meals.</small></div>`;
    return;
  }
  el.innerHTML = state.recipes.map(r => {
    const ingCount = (r.ingredients || []).length;
    return `<div class="recipe-card" onclick="openRecipeModal(state.recipes.find(x=>x.id==='${r.id}'))" style="cursor:pointer">
      <div class="recipe-name">${esc(r.name)}</div>
      <div class="recipe-meta">${ingCount} ingredient${ingCount !== 1 ? 's' : ''}</div>
      <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); deleteRecipe('${r.id}')" style="margin-left:auto">✕</button>
    </div>`;
  }).join('');
}

function openRecipeModal(item = null) {
  const editing = !!item;
  openModal({
    title: editing ? 'Edit Recipe' : 'New Recipe',
    sub: 'One ingredient per line: name, amount, unit',
    fields: [
      { name: 'name', label: 'Recipe Name', required: true, placeholder: 'e.g. Pasta Bolognese', value: editing ? item.name : '' },
      { name: 'ingredients', label: 'Ingredients (one per line)', type: 'textarea', placeholder: 'ground beef, 500, g\nonion, 1, piece\nolive oil, 2, tbsp', value: editing ? item.ingredients.map(i => `${i.name}, ${i.amount}, ${i.unit}`).join('\n') : '' }
    ],
    submit: editing ? 'Save Changes' : 'Add Recipe',
    onSubmit: async v => {
      const ingredients = v.ingredients.split('\n').filter(l => l.trim()).map(line => {
        const parts = line.split(',').map(s => s.trim());
        return { name: parts[0] || '', amount: parseFloat(parts[1]) || 0, unit: parts[2] || 'pcs' };
      });
      if (editing) {
        Object.assign(item, { name: v.name, ingredients });
        await saveDoc('recipes', item.id, item);
      } else {
        const id = uid();
        const data = { id, name: v.name, ingredients, createdAt: Date.now() };
        state.recipes.unshift(data);
        await saveDoc('recipes', id, data);
      }
      renderRecipes();
    }
  });
}

async function deleteRecipe(id) {
  if (!confirm('Delete this recipe?')) return;
  state.recipes = state.recipes.filter(r => r.id !== id);
  await deleteDoc('recipes', id);
  renderRecipes();
}

document.getElementById('add-recipe-btn').addEventListener('click', () => openRecipeModal());

// ─── MEAL PLAN ──────────────────────────────────────────────
window.MEAL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
window.MEAL_DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
window.MEAL_SLOTS = ['midi', 'soir'];
window.MEAL_SLOT_LABELS = { midi: 'Lunch', soir: 'Dinner' };

function renderMealPlan() {
  const el = document.getElementById('meal-plan-list');
  el.innerHTML = MEAL_DAYS.map(day => {
    const dayMeals = MEAL_SLOTS.map(slot => {
      const meal = state.mealPlan.find(m => m.day === day && m.repas === slot);
      const recipe = meal ? state.recipes.find(r => r.id === meal.recipeId) : null;
      return `<div class="meal-slot">
        <span class="meal-slot-label">${MEAL_SLOT_LABELS[slot]}</span>
        ${recipe ? `<span class="meal-slot-recipe" onclick="openMealPlanModal('${day}','${slot}')" style="cursor:pointer">${esc(recipe.name)}</span>` : `<button class="btn btn-ghost btn-sm" onclick="openMealPlanModal('${day}','${slot}')">+</button>`}
      </div>`;
    }).join('');
    return `<div class="meal-day"><div class="meal-day-label">${MEAL_DAY_LABELS[day]}</div>${dayMeals}</div>`;
  }).join('');
}

function openMealPlanModal(day, repas) {
  const existing = state.mealPlan.find(m => m.day === day && m.repas === repas);
  const options = state.recipes.map(r => [r.id, r.name]);
  if (!options.length) {
    toast('Add a recipe first before planning meals', 'info');
    return;
  }
  openModal({
    title: `${MEAL_DAY_LABELS[day]} — ${MEAL_SLOT_LABELS[repas]}`,
    fields: [
      { name: 'recipeId', label: 'Recipe', type: 'select', options, value: existing ? existing.recipeId : options[0][0] }
    ],
    submit: 'Save',
    onSubmit: async v => {
      if (existing) {
        existing.recipeId = v.recipeId;
        await saveDoc('mealPlan', existing.id, existing);
      } else {
        const id = uid();
        const data = { id, day, recipeId: v.recipeId, repas, createdAt: Date.now() };
        state.mealPlan.push(data);
        await saveDoc('mealPlan', id, data);
      }
      renderMealPlan();
    }
  });
}

// ─── GROCERY LIST ───────────────────────────────────────────
function generateGroceryList() {
  const container = document.getElementById('grocery-list-container');
  const el = document.getElementById('grocery-list');
  const aggregated = {};

  state.mealPlan.forEach(mp => {
    const recipe = state.recipes.find(r => r.id === mp.recipeId);
    if (!recipe) return;
    (recipe.ingredients || []).forEach(ing => {
      const key = `${ing.name.toLowerCase()}|${ing.unit.toLowerCase()}`;
      if (!aggregated[key]) aggregated[key] = { name: ing.name, amount: 0, unit: ing.unit };
      aggregated[key].amount += ing.amount;
    });
  });

  const items = Object.values(aggregated).sort((a, b) => a.name.localeCompare(b.name));
  if (!items.length) {
    el.innerHTML = `<div class="empty-state" style="padding:20px 0"><p>No planned meals this week.</p></div>`;
    container.style.display = '';
    return;
  }
  el.innerHTML = `<div class="grocery-items">${items.map(i =>
    `<div class="grocery-item"><span class="grocery-check" onclick="this.classList.toggle('done')"></span><span>${esc(i.name)}</span><span class="grocery-qty">${i.amount} ${i.unit}</span></div>`
  ).join('')}</div>`;
  container.style.display = '';
  toast('Grocery list generated!', 'success');
}

document.getElementById('gen-grocery-btn').addEventListener('click', generateGroceryList);

// ═══════════════════════════════════════════════════════════════
// LIFE AREAS
// ═══════════════════════════════════════════════════════════════
window.AREA_COLORS = { family: '#FF6B6B', career: '#4ECDC4', growth: '#FFE66D', finance: '#4D96FF' };


export { renderRecipes, openRecipeModal, deleteRecipe, renderMealPlan, openMealPlanModal, generateGroceryList };

Object.assign(window, { renderRecipes, openRecipeModal, deleteRecipe, renderMealPlan, openMealPlanModal, generateGroceryList });
