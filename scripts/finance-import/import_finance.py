"""
Finance import script — lit le .xlsx source (tous les onglets) et
écrit UNIQUEMENT les entrées brutes dans Firestore.

Usage:
  pip install openpyxl firebase-admin
  python import_finance.py --excel "../Dépenses Sari-2025.xlsx" ^
      --service-account key.json --uid <firebase-uid>

  # Dry-run (aucune écriture)
  python import_finance.py --excel "../Dépenses Sari-2025.xlsx" --dump-json

PRINCIPES :
  - Lit TOUS les onglets du classeur (un par mois) + "Achats" (wishlist).
  - N'importe QUE les données brutes : revenus, économies, dépenses
    avec leur nom/montant/compte. AUCUNE valeur calculée (prorata,
    totaux, restes, réconciliation) — l'app les recalcule dynamiquement
    via calcFinanceMonth().
  - Chaque item de dépense reçoit un UUID (champ 'id') nécessaire aux
    fonctions edit/delete de l'app.
  - Écrit dans users/{uid}/financeMonths/{docId} (pas la racine).
"""

import argparse
import json
import os
import re
import sys
import uuid
from datetime import datetime

try:
    import openpyxl
except ImportError:
    print("openpyxl is required. Run: pip install openpyxl", file=sys.stderr)
    sys.exit(1)

firebase_available = False
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    firebase_available = True
except ImportError:
    pass


# ─── Constantes ───────────────────────────────────────────────

MONTH_MAP = {
    'janvier': 1, 'janv': 1,
    'fevrier': 2, 'fev': 2, 'février': 2, 'fév': 2,
    'mars': 3,
    'avril': 4,
    'mai': 5,
    'juin': 6,
    'juillet': 7, 'juil': 7,
    'aout': 8, 'août': 8,
    'septembre': 9, 'sept': 9,
    'octobre': 10, 'oct': 10,
    'novembre': 11, 'nov': 11,
    'decembre': 12, 'dec': 12, 'décembre': 12, 'déc': 12,
}

ACCOUNT_JOINT = 'Compte joint'


# ─── Helpers ──────────────────────────────────────────────────

def make_uuid() -> str:
    return str(uuid.uuid4())


def extract_amount(v) -> float:
    """Convertit n'importe quelle cellule (nombre, string avec format français) en float."""
    if v is None:
        return 0.0
    # openpyxl Cell object → extraire .value
    if hasattr(v, 'value'):
        v = v.value
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if not s or s in ('-', ''):
        return 0.0
    s = s.replace('\u20ac', '').replace('\u00a0', ' ')
    s = s.replace(' ', '').replace(',', '.').replace('\u20ac', '')
    s = re.sub(r'[^\d.\-]', '', s)
    try:
        return float(s)
    except ValueError:
        return 0.0


# ─── Parsing du nom d'onglet → (mois, année) ─────────────────

def parse_sheet_name(name: str):
    """
    Analyse un nom d'onglet comme 'Août25', 'Déc2025', 'Janv26', 'Mai'.
    Retourne (month_num, year) ou None si non reconnaissable.
    """
    raw = name.strip()
    lower = raw.lower()

    # Supprime les séparateurs courants
    lower = re.sub(r'[\s\-_]+', '', lower)

    # Extrait la partie année (2 ou 4 chiffres en fin de chaîne)
    year_match = re.search(r'(19\d{2}|20\d{2}|\d{2})$', lower)
    year = None
    if year_match:
        y_str = year_match.group(1)
        if len(y_str) == 2:
            year = 2000 + int(y_str) if int(y_str) < 50 else 1900 + int(y_str)
        else:
            year = int(y_str)

    # Extrait le nom du mois (tout ce qui précède l'année)
    month_part = lower
    if year_match:
        month_part = lower[:year_match.start()]

    # Cherche le mois dans le dictionnaire
    for alias, mnum in MONTH_MAP.items():
        if alias in month_part:
            return mnum, year

    return None


# ─── Parsing d'un onglet mensuel .xlsx ────────────────────────

def parse_monthly_sheet(ws, sheet_name: str):
    """
    Parse UN onglet mensuel.
    Retourne un dict financeMonth (entrées brutes seulement)
    ou None si l'onglet ne ressemble pas à un mois.
    """
    revenus_a = 0.0
    revenus_b = 0.0
    savings_a = 0.0
    savings_b = 0.0
    shared_fixed = []
    shared_variable = []
    individual_a = []
    individual_b = []

    max_row = ws.max_row

    # Passe 1 : scan pour les lignes clés
    for r in range(1, max_row + 1):
        a_val = ws.cell(r, 1).value
        if a_val is None:
            continue
        text = str(a_val).strip()
        text_lower = text.lower()

        # ── Revenus et économies ──
        if 'revenus sa' in text_lower:
            revenus_a = extract_amount(ws.cell(r, 2))
        elif 'revenus ta' in text_lower:
            revenus_b = extract_amount(ws.cell(r, 2))
        elif 'economies mois' in text_lower or 'économies mois' in text_lower:
            val = extract_amount(ws.cell(r, 2).value)
            if 'sa' in text_lower or 'saif' in text_lower:
                savings_a = val
            elif 'ta' in text_lower or 'tari' in text_lower:
                savings_b = val
            else:
                if revenus_a > 0 and revenus_b == 0:
                    savings_a = val
                elif revenus_b > 0 and revenus_a == 0:
                    savings_b = val
                else:
                    savings_a = val

        # ── Dépenses fixes foyer ──
        elif 'depenses fixes foyer' in text_lower or 'dépenses fixes foyer' in text_lower:
            rr = r + 1
            while rr <= max_row:
                cell_a = ws.cell(rr, 1)
                if cell_a.value is None:
                    rr += 1
                    continue
                cell_text = str(cell_a.value).strip()
                cell_lower = cell_text.lower()
                # Stop markers
                if any(kw in cell_lower for kw in
                       ['depenses variables', 'dépenses variables',
                        'depenses fixes sa', 'depenses fixes ta',
                        'dépenses fixes sa', 'dépenses fixes ta',
                        'revenus']):
                    break
                # Ignorer totaux et lignes de transfert (valeurs calculées)
                if any(kw in cell_lower for kw in ['total', 'a envoyer', 'à envoyer']):
                    rr += 1
                    continue
                amt = extract_amount(ws.cell(rr, 2))
                if amt > 0:
                    shared_fixed.append({
                        'id': make_uuid(),
                        'name': cell_text,
                        'amount': round(amt, 2),
                        'account': ACCOUNT_JOINT,
                        'type': 'fixed'
                    })
                rr += 1

        # ── Dépenses variables foyer ──
        elif 'depenses variables foyer' in text_lower or 'dépenses variables foyer' in text_lower:
            rr = r + 1
            while rr <= max_row:
                cell_a = ws.cell(rr, 1)
                if cell_a.value is None:
                    rr += 1
                    continue
                cell_lower = str(cell_a.value).strip().lower()
                if any(kw in cell_lower for kw in
                       ['depenses fixes', 'dépenses fixes']):
                    break
                if any(kw in cell_lower for kw in ['total', 'a envoyer', 'à envoyer']):
                    rr += 1
                    continue
                amt = extract_amount(ws.cell(rr, 2))
                if amt > 0:
                    shared_variable.append({
                        'id': make_uuid(),
                        'name': str(ws.cell(rr, 1).value).strip(),
                        'amount': round(amt, 2),
                        'account': ACCOUNT_JOINT,
                        'type': 'variable'
                    })
                rr += 1

    # Passe 2 : dépenses individuelles Tari/Saïf (colonnes D-E / G-H)
    # Repérer la ligne "Dépenses fixes Tari" / "Dépenses fixes Saïf" dans la colonne D
    in_indiv_section = False
    for r in range(1, max_row + 1):
        d_val = ws.cell(r, 4).value  # colonne D
        if d_val is not None:
            d_lower = str(d_val).strip().lower()
            if 'depenses fixes ta' in d_lower or 'dépenses fixes ta' in d_lower \
               or 'depenses fixes tari' in d_lower or 'dépenses fixes tari' in d_lower:
                in_indiv_section = True
                continue

        if not in_indiv_section:
            continue

        # Vérifier si on est sorti de la section
        g_val = ws.cell(r, 7).value  # colonne G
        d_val = ws.cell(r, 4).value
        any_label = False
        for cv in [ws.cell(r, c).value for c in range(1, 10)]:
            if cv is not None:
                cl = str(cv).strip().lower()
                if any(kw in cl for kw in
                       ['depenses fixes foyer', 'dépenses fixes foyer',
                        'depenses variables', 'dépenses variables',
                        'revenus']):
                    any_label = True
                    break
        if any_label:
            break

        # Ligne vide = fin de section
        all_empty = all(ws.cell(r, c).value is None for c in range(1, 10))
        if all_empty:
            break

        # Dépenses Tari : colonne D = nom, E = montant
        tari_name_cell = ws.cell(r, 4).value
        if tari_name_cell is not None:
            tari_name = str(tari_name_cell).strip()
            if tari_name and tari_name.lower() not in ('total',):
                tari_amt = extract_amount(ws.cell(r, 5))
                if tari_amt > 0:
                    individual_b.append({
                        'id': make_uuid(),
                        'name': tari_name,
                        'amount': round(tari_amt, 2)
                    })

        # Dépenses Saïf : colonne G = nom, H = montant
        saif_name_cell = ws.cell(r, 7).value
        if saif_name_cell is not None:
            saif_name = str(saif_name_cell).strip()
            if saif_name and saif_name.lower() not in ('total',):
                saif_amt = extract_amount(ws.cell(r, 8))
                if saif_amt > 0:
                    individual_a.append({
                        'id': make_uuid(),
                        'name': saif_name,
                        'amount': round(saif_amt, 2)
                    })

    # Si on n'a trouvé aucun revenu, ce n'est pas un onglet mensuel
    if revenus_a == 0 and revenus_b == 0:
        return None

    return {
        'id': None,  # sera rempli après par le parse_sheet_name
        'revenus': {
            'a': {'income': round(revenus_a, 2), 'previousSavings': round(savings_a, 2)},
            'b': {'income': round(revenus_b, 2), 'previousSavings': round(savings_b, 2)}
        },
        'sharedExpenses': shared_fixed + shared_variable,
        'individualExpenses': {
            'a': individual_a,
            'b': individual_b
        },
        'createdAt': int(datetime.now().timestamp() * 1000),
        '_sheetName': sheet_name,
    }


# ─── Parsing onglet Achats (wishlist) ─────────────────────────

def parse_wishlist_sheet(ws):
    """Extrait les items wishlist de l'onglet Achats (colonnes A-C pour Saif, F-I pour Plaisirs à 3)."""
    items = []

    for list_prefix, col_name, col_price, col_saved in [
        ('Saif', 1, 2, 3),
        ('Plaisirs à 3', 6, 7, 8),
    ]:
        for row in range(3, ws.max_row + 1):
            name_cell = ws.cell(row, col_name).value
            if name_cell is None:
                continue
            name = str(name_cell).strip()
            if not name or name.lower() == 'total':
                continue
            price = extract_amount(ws.cell(row, col_price))
            saved = extract_amount(ws.cell(row, col_saved))
            if price > 0 or saved > 0:
                items.append({
                    'id': str(uuid.uuid4()),
                    'list': list_prefix,
                    'name': name,
                    'price': round(price, 2),
                    'saved': round(saved, 2),
                    'link': '',
                    'createdAt': int(datetime.now().timestamp() * 1000)
                })

    return items


# ─── Construction du doc Firestore ────────────────────────────

def build_doc_id(month_num, year):
    return f"{year}-{month_num:02d}"


# ─── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Import finance data from .xlsx to Firestore')
    parser.add_argument('--excel', required=True, help='Path to Dépenses_Sari-2025.xlsx')
    parser.add_argument('--service-account', help='Path to Firebase service account JSON')
    parser.add_argument('--uid', help='Firebase UID (required with --service-account)')
    parser.add_argument('--dump-json', action='store_true', help='Dry-run: dump JSON to stdout')
    args = parser.parse_args()

    if not os.path.exists(args.excel):
        print(f"Error: File not found: {args.excel}", file=sys.stderr)
        sys.exit(1)

    wb = openpyxl.load_workbook(args.excel, data_only=True)
    print(f"Sheets found ({len(wb.sheetnames)}): {wb.sheetnames}", file=sys.stderr)
    print(file=sys.stderr)

    finance_months = []
    wishlist_items = []
    skipped = []       # (name, reason)
    ambiguous = []     # (name, reason)

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        sname_lower = sheet_name.strip().lower()

        # ── Onglet Achats ──
        if sname_lower.startswith('achat'):
            items = parse_wishlist_sheet(ws)
            wishlist_items.extend(items)
            print(f"  [Achats]  {len(items)} items wishlist extraits", file=sys.stderr)
            continue

        # ── Onglet mensuel ──
        month_data = parse_monthly_sheet(ws, sheet_name)
        if month_data is None:
            skipped.append((sheet_name, "Aucun revenu trouvé → pas un onglet mensuel"))
            print(f"  [IGNORÉ]  '{sheet_name}' — aucun revenu détecté", file=sys.stderr)
            continue

        # Analyse du nom d'onglet pour extraire mois + année
        parsed = parse_sheet_name(sheet_name)
        if parsed is None:
            skipped.append((sheet_name, "Nom d'onglet non reconnaissable (mois ou année absents)"))
            print(f"  [AMBIGU]  '{sheet_name}' — impossible d'extraire mois/année, ignoré", file=sys.stderr)
            continue

        month_num, year = parsed
        if year is None:
            ambiguous.append((sheet_name, f"Mois={month_num} mais année manquante — impossible d'identifier le doc"))
            print(f"  [AMBIGU]  '{sheet_name}' — mois={month_num}, année absente, ignoré", file=sys.stderr)
            continue

        doc_id = build_doc_id(month_num, year)
        month_data['id'] = doc_id
        del month_data['_sheetName']
        finance_months.append(month_data)

        n_shared = len(month_data['sharedExpenses'])
        n_a = len(month_data['individualExpenses']['a'])
        n_b = len(month_data['individualExpenses']['b'])
        print(f"  [OK]  '{sheet_name}' → {doc_id}  "
              f"revA={month_data['revenus']['a']['income']}, "
              f"revB={month_data['revenus']['b']['income']}, "
              f"savA={month_data['revenus']['a']['previousSavings']}, "
              f"savB={month_data['revenus']['b']['previousSavings']}, "
              f"shared={n_shared}, indivA={n_a}, indivB={n_b}",
              file=sys.stderr)

    # ── Bilan ──
    print(file=sys.stderr)
    print(f"{'='*50}", file=sys.stderr)
    print(f"Total onglets détectés : {len(wb.sheetnames)}", file=sys.stderr)
    print(f"  ✓ Importés : {len(finance_months)} mois", file=sys.stderr)
    print(f"  ✓ Wishlist : {len(wishlist_items)} items", file=sys.stderr)
    if skipped:
        print(f"  ✗ Ignorés  : {len(skipped)}", file=sys.stderr)
        for name, reason in skipped:
            print(f"     - '{name}' : {reason}", file=sys.stderr)
    if ambiguous:
        print(f"  ? Ambigus  : {len(ambiguous)}", file=sys.stderr)
        for name, reason in ambiguous:
            print(f"     - '{name}' : {reason}", file=sys.stderr)
    print(f"{'='*50}", file=sys.stderr)

    # ── Dry-run : dump JSON ──
    if args.dump_json or not args.service_account:
        output = {
            'financeMonths': finance_months,
            'wishlist': wishlist_items,
            '_meta': {
                'totalSheets': len(wb.sheetnames),
                'imported': len(finance_months),
                'skipped': [(n, r) for n, r in skipped],
                'ambiguous': [(n, r) for n, r in ambiguous],
                'generatedAt': datetime.now().isoformat(),
                'note': 'RAW INPUTS ONLY. No calculated values. App calcFinanceMonth() derives prorata/totals/restes.',
            }
        }
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return

    # ── Écriture Firestore ──
    if not args.uid:
        print("Error: --uid is required when writing to Firestore", file=sys.stderr)
        sys.exit(1)
    if not firebase_available:
        print("Error: firebase-admin not installed. Run: pip install firebase-admin", file=sys.stderr)
        sys.exit(1)

    cred = credentials.Certificate(args.service_account)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    for m in finance_months:
        doc_ref = db.collection('users').document(args.uid).collection('financeMonths').document(m['id'])
        doc_ref.set(m)
        print(f"  ✓ Wrote users/{args.uid}/financeMonths/{m['id']}", file=sys.stderr)

    for item in wishlist_items:
        doc_ref = db.collection('users').document(args.uid).collection('wishlist').document(item['id'])
        doc_ref.set(item)
    print(f"  ✓ Wrote {len(wishlist_items)} wishlist items", file=sys.stderr)

    print("\n✓ Import terminé.", file=sys.stderr)


if __name__ == '__main__':
    main()
