"""
Growth objectives import — lit growth-objectives.json et écrit les
goals/tasks/habits dans Firestore.

Usage:
  pip install firebase-admin
  python import_growth.py --service-account key.json [--uid <firebase-uid>]

  # Dry-run (aucune écriture, résout les catégories + affiche le plan)
  python import_growth.py --dump-json

PRINCIPES :
  - NE crée AUCUNE catégorie : chaque `category` du JSON est résolu par
    nom vers un nœud existant sous la racine "Growth". Si un nom ne
    correspond à aucun nœud (ou est ambigu), le script s'ARRÊTE et
    liste les noms sans rien écrire.
  - Un Goal par catégorie (titre = nom de la catégorie).
  - Chaque item type='task'  -> Task (goalId, dueDate = target_date).
  - Chaque item type='habit' -> Habit (goalId, frequency, deadline =
    target_date, createdAt = start_date).
  - Active automatiquement les onglets goals/tasks/habits manquants sur
    chaque catégorie concernée (même logique que ensureCategoryTabForType).
  - Idempotent : les goals/tasks/habits déjà présents (même titre +
    même parent) sont signalés et sautés.
"""

import argparse
import json
import os
import sys
import uuid
from datetime import datetime, timezone

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    firebase_admin = None

DEFAULT_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'growth-objectives.json')

TAB_LABELS = {
    'tasks': '☑️ Tasks',
    'goals': '🎯 Goals',
    'habits': '🔥 Habits',
    'list': '📋 Liste',
}


def make_id():
    return str(uuid.uuid4())


def iso_to_ms(date_str):
    """'YYYY-MM-DD' -> ms timestamp (UTC midnight)."""
    d = datetime.strptime(date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
    return int(d.timestamp() * 1000)


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def fetch_user_uid(db, explicit_uid):
    if explicit_uid:
        return explicit_uid
    # Auto-détection : unique utilisateur possédant une racine "Growth"
    users = db.collection('users').get()
    candidates = []
    for u in users:
        roots = db.collection('users').document(u.id).collection('categories') \
                  .where('parentId', '==', None).get()
        names = [r.get('name') for r in roots if r.get('name')]
        if 'Growth' in names:
            candidates.append(u.id)
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        print('Error: plusieurs utilisateurs ont une arborescence Growth. '
              'Précisez --uid.', file=sys.stderr)
        sys.exit(1)
    print('Error: aucun utilisateur avec une racine "Growth" trouvé. '
          'Précisez --uid.', file=sys.stderr)
    sys.exit(1)


def load_categories(db, uid):
    docs = db.collection('users').document(uid).collection('categories').get()
    cats = []
    for d in docs:
        data = d.to_dict() or {}
        data['id'] = d.id
        cats.append(data)
    return cats


def find_growth_root(cats):
    for c in cats:
        if c.get('name') == 'Growth' and c.get('parentId') is None:
            return c
    return None


def root_of(cat_id, cat_by_id):
    seen = set()
    cur = cat_id
    while cur and cur not in seen:
        seen.add(cur)
        c = cat_by_id.get(cur)
        if not c:
            return None
        if c.get('parentId') is None:
            return c
        cur = c.get('parentId')
    return None


def resolve_categories(cats, json_cats):
    """Retourne (resolved: {name: cat}, problems: [(name, reason)])."""
    cat_by_id = {c['id']: c for c in cats}
    growth_root = find_growth_root(cats)
    if growth_root is None:
        return {}, [('(aucune racine Growth trouvée)', 'no-growth-root')]

    by_name = {}
    for c in cats:
        by_name.setdefault(c.get('name'), []).append(c)

    resolved = {}
    problems = []
    for name in json_cats:
        matches = [c for c in by_name.get(name, [])
                   if (root_of(c['id'], cat_by_id) or {}).get('id') == growth_root['id']]
        if len(matches) == 1:
            resolved[name] = matches[0]
        elif len(matches) == 0:
            # matches existants ailleurs que sous Growth ?
            elsewhere = by_name.get(name, [])
            if elsewhere:
                problems.append((name, 'nœud(s) existant(s) mais hors de Growth : '
                                        + ', '.join(e.get('name', '?') for e in elsewhere)))
            else:
                problems.append((name, 'aucun nœud avec ce nom'))
        else:
            problems.append((name, f'{len(matches)} nœuds avec ce nom sous Growth'))
    return resolved, problems


def plan_import(db, uid, items, resolved):
    """Construit le plan (goals/tasks/habits) sans rien écrire."""
    cats = load_categories(db, uid)
    cat_by_id = {c['id']: c for c in cats}

    # Regroupe les items par catégorie (ordre du JSON)
    groups = {}
    for it in items:
        groups.setdefault(it['category'], []).append(it)

    plan = []
    warnings = []
    for name, cat in resolved.items():
        group = groups[name]
        target_date = group[0]['target_date']
        if any(it['target_date'] != target_date for it in group):
            warnings.append(f"{name}: target_date différent entre items — utilisation de {target_date}")
        plan.append({
            'category_name': name,
            'category': cat,
            'target_date': target_date,
            'tasks': [it for it in group if it['type'] == 'task'],
            'habits': [it for it in group if it['type'] == 'habit'],
        })
    return plan, warnings, cat_by_id


def build_goal_doc(cat, target_date):
    return {
        'id': make_id(),
        'title': cat['name'],
        'area': 'growth',
        'deadline': target_date,
        'milestones': [],
        'progress': 0,
        'categoryId': cat['id'],
        'isSprintObjective': False,
        'sprintQuarter': None,
        'weeklyActions': [],
        'createdAt': int(datetime.now().timestamp() * 1000),
    }


def build_task_doc(goal_id, item):
    return {
        'id': make_id(),
        'title': item['title'],
        'dueDate': item['target_date'],
        'duration': 0,
        'priority': 'medium',
        'goalId': goal_id,
        'done': False,
        'timerRunning': False,
        'createdAt': iso_to_ms(item['start_date']),
    }


def build_habit_doc(goal_id, item):
    return {
        'id': make_id(),
        'name': item['title'],
        'goalId': goal_id,
        'frequency': item.get('frequency') or 'daily',
        'checkIns': [],
        'createdAt': iso_to_ms(item['start_date']),
        'deadline': item['target_date'],
    }


def ensure_tabs(db, uid, cat, needed):
    """Même logique que ensureCategoryTabForType : skip si moduleType non-generic.
    needed = liste des types d'onglets à garantir (ex. ['goals', 'habits'])."""
    mt = cat.get('moduleType')
    if mt not in (None, '', 'generic'):
        return []
    doc_ref = db.collection('users').document(uid).collection('categories').document(cat['id'])
    current = doc_ref.get()
    tabs = list((current.to_dict() or {}).get('tabs') or [])
    added = []
    for tab_type in needed:
        if not any(t.get('type') == tab_type for t in tabs):
            tab = {'id': make_id(), 'type': tab_type, 'label': TAB_LABELS[tab_type]}
            tabs.append(tab)
            added.append(tab_type)
    if added:
        doc_ref.update({'tabs': tabs})
    return added


def main():
    parser = argparse.ArgumentParser(description='Import growth objectives to Firestore')
    parser.add_argument('--json', default=DEFAULT_JSON, help='Path to growth-objectives.json')
    parser.add_argument('--service-account', help='Path to Firebase service account JSON')
    parser.add_argument('--uid', help='Firebase UID (auto-detected if omitted)')
    parser.add_argument('--dump-json', action='store_true',
                        help='Dry-run: résolution + plan, aucune écriture')
    args = parser.parse_args()

    if not os.path.exists(args.json):
        print(f'Error: File not found: {args.json}', file=sys.stderr)
        sys.exit(1)

    items = load_json(args.json)
    json_names = list(dict.fromkeys(it['category'] for it in items))
    print(f'JSON: {len(items)} items, {len(json_names)} catégories', file=sys.stderr)

    if firebase_admin is None:
        print('Error: firebase-admin not installed. Run: pip install firebase-admin',
              file=sys.stderr)
        sys.exit(1)

    cred = credentials.Certificate(args.service_account)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    uid = fetch_user_uid(db, args.uid)
    print(f'Target user: {uid}', file=sys.stderr)

    cats = load_categories(db, uid)
    print(f'Catégories en base : {len(cats)}', file=sys.stderr)

    resolved, problems = resolve_categories(cats, json_names)

    if problems:
        print(file=sys.stderr)
        print('=' * 60, file=sys.stderr)
        print('RÉSOLUTION ÉCHOUÉE — AUCUNE ÉCRITURE.', file=sys.stderr)
        print('Les catégories suivantes ne correspondent à aucun nœud', file=sys.stderr)
        print('existant sous Growth :', file=sys.stderr)
        for name, reason in problems:
            print(f'  ✗ "{name}" — {reason}', file=sys.stderr)
        print('=' * 60, file=sys.stderr)
        sys.exit(1)

    print(file=sys.stderr)
    print('Résolution OK :', file=sys.stderr)
    for name, cat in resolved.items():
        print(f'  ✓ "{name}" -> id={cat["id"]} (moduleType={cat.get("moduleType") or "generic"})',
              file=sys.stderr)

    plan, warnings, _ = plan_import(db, uid, items, resolved)
    for w in warnings:
        print(f'  ⚠ {w}', file=sys.stderr)

    # Comptage et idempotence (skip si un goal même titre + même catégorie existe déjà)
    existing_goals = db.collection('users').document(uid).collection('goals').get()
    goal_keys = {(g.get('title'), g.get('categoryId')) for g in existing_goals}

    print(file=sys.stderr)
    print('Plan d\'import :', file=sys.stderr)
    total_g = total_t = total_h = 0
    for p in plan:
        dup_goal = (p['category_name'], p['category']['id']) in goal_keys
        n_t = len(p['tasks'])
        n_h = len(p['habits'])
        print(f'  • {p["category_name"]}: goal={0 if dup_goal else 1}, '
              f'tasks={n_t}, habits={n_h}{" [GOAL DÉJÀ PRÉSENT — skip]" if dup_goal else ""}',
              file=sys.stderr)
        if not dup_goal:
            total_g += 1
        total_t += n_t
        total_h += n_h
    print(file=sys.stderr)
    print(f'TOTAL: {total_g} goals, {total_t} tasks, {total_h} habits', file=sys.stderr)

    if args.dump_json:
        print(json.dumps({
            'uid': uid,
            'resolved': {n: c['id'] for n, c in resolved.items()},
            'plan': [{
                'category': p['category_name'],
                'categoryId': p['category']['id'],
                'target_date': p['target_date'],
                'tasks': [t['title'] for t in p['tasks']],
                'habits': [h['title'] for h in p['habits']],
            } for p in plan],
            'note': 'DRY-RUN — rien écrit.',
        }, ensure_ascii=False, indent=2))
        return

    print(file=sys.stderr)
    print('Écriture Firestore…', file=sys.stderr)
    report = []
    for p in plan:
        cat = p['category']
        dup_goal = (p['category_name'], cat['id']) in goal_keys
        if dup_goal:
            report.append({'category': p['category_name'], 'goal': 0, 'tasks': 0, 'habits': 0,
                           'note': 'goal existant, aucun import'})
            continue
        goal = build_goal_doc(cat, p['target_date'])
        db.collection('users').document(uid).collection('goals').document(goal['id']).set(goal)
        n_t = n_h = 0
        for t in p['tasks']:
            td = build_task_doc(goal['id'], t)
            db.collection('users').document(uid).collection('tasks').document(td['id']).set(td)
            n_t += 1
        for h in p['habits']:
            hd = build_habit_doc(goal['id'], h)
            db.collection('users').document(uid).collection('habits').document(hd['id']).set(hd)
            n_h += 1
        added_tabs = ensure_tabs(db, uid, cat, ['goals'] + (['tasks'] if n_t else []) + (['habits'] if n_h else []))
        report.append({'category': p['category_name'], 'goal': 1, 'tasks': n_t, 'habits': n_h,
                       'tabs_added': added_tabs})
        print(f'  ✓ {p["category_name"]}: 1 goal, {n_t} task(s), {n_h} habit(s), '
              f'onglets ajoutés: {", ".join(added_tabs) if added_tabs else "-"}', file=sys.stderr)

    print(file=sys.stderr)
    print('=' * 60, file=sys.stderr)
    print('IMPORT TERMINÉ', file=sys.stderr)
    for r in report:
        print(f'  {r["category"]}: {r["goal"]} goal, {r["tasks"]} tasks, {r["habits"]} habits'
              + (f'  [tabs: {", ".join(r["tabs_added"])}]' if r.get('tabs_added') else '')
              + (f'  [{r["note"]}]' if r.get('note') else ''), file=sys.stderr)
    print('=' * 60, file=sys.stderr)


if __name__ == '__main__':
    main()
