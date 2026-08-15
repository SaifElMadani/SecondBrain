// ─── STATE ───────────────────────────────────────────────────
// Shared app state. Kept on `window` (single source of truth) so that
// inline onclick handlers and any remaining classic-script code resolve
// the same bindings as ES modules.
window.currentUser = null;
window.userProfile = {};

const state = {
  tasks: [],
  notes: [],
  journal: {},   // keyed by date string
  habits: [],
  goals: [],
  captures: [],
  documents: [],
  sprints: [],
  timeEntries: [],
  familyBlocks: [],
  wins: [],
  babyMilestones: [],
  recipes: [],
  mealPlan: [],
  hobbies: [],
  categories: [],
  financeMonths: [],
  wishlist: [],
  dateIdeas: [],
  checklistItems: [],
  rewards: [],
  rewardGrants: [],
  googleCalendarEvents: [],
  outlookCalendarEvents: [],
  settings: {
    name: '',
    babyDueDate: null,
    areas: ['family', 'career', 'growth', 'finance'],
    drinkReminder: { enabled: false, interval: 90 },
    bottomNav: ['dashboard', 'journal', 'calendar', 'documents', 'suivi', 'family', 'growth', 'career', 'finance'],
    finance: {
      partners: { a: { name: '' }, b: { name: '' } },
      accounts: [],
      discretionarySplit: {
        enabled: { a: false, b: false },
        buckets: []
      },
      wishlistLists: []
    }
  }
};

export { state };
Object.assign(window, { state });

window.activeCategoryId = null;
window.currentCategoryId = null;
