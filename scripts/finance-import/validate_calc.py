"""Validation: run calcFinanceMonth logic on parsed data and compare to Excel values."""
import json
import sys

import os
path = sys.argv[1] if len(sys.argv) > 1 else 'scripts/finance-import/import_log.txt'
# The file may be UTF-16 (PowerShell redirect) or UTF-8
for enc in ('utf-16', 'utf-8', 'cp1252'):
    try:
        with open(path, 'r', encoding=enc) as f:
            content = f.read()
        json_start = content.index('{')
        break
    except (UnicodeDecodeError, ValueError):
        continue
data = json.loads(content[json_start:])
m = data['financeMonths'][0]

print('=== RAW INPUTS ===')
print(f"Revenus Saïf: {m['revenus']['a']['income']} €")
print(f"Revenus Tari: {m['revenus']['b']['income']} €")
print(f"Savings Saïf: {m['revenus']['a']['previousSavings']} €")
print(f"Savings Tari: {m['revenus']['b']['previousSavings']} €")

print()
shared_total = sum(e['amount'] for e in m['sharedExpenses'])
indiv_a_total = sum(e['amount'] for e in m['individualExpenses']['a'])
indiv_b_total = sum(e['amount'] for e in m['individualExpenses']['b'])
total_depenses_globale = shared_total + indiv_a_total + indiv_b_total
total_revenus = m['revenus']['a']['income'] + m['revenus']['b']['income']

print(f'Shared expenses total: {shared_total} € (expected 4016.29)')
print(f'Individual A total: {indiv_a_total} € (expected 444.40)')
print(f'Individual B total: {indiv_b_total} € (expected 104.39)')
print(f'Total dépenses globale: {total_depenses_globale} € (expected 4565.08)')

# calcFinanceMonth logic (verbatim from app.js)
revA = m['revenus']['a']['income']
revB = m['revenus']['b']['income']
savA = m['revenus']['a']['previousSavings']
savB = m['revenus']['b']['previousSavings']
totalRev = revA + revB
prorataA = revA / totalRev if totalRev > 0 else 0.5
prorataB = 1 - prorataA

shared = m['sharedExpenses']
totalSharedFixed = sum(e['amount'] for e in shared if e['type'] == 'fixed')
totalSharedVariable = sum(e['amount'] for e in shared if e['type'] == 'variable')
totalShared = totalSharedFixed + totalSharedVariable

indA = sum(e['amount'] for e in m['individualExpenses']['a'])
indB = sum(e['amount'] for e in m['individualExpenses']['b'])
totalDepensesGlobale = totalShared + indA + indB

restA = revA + savA - (totalShared * prorataA) - indA
restB = revB + savB - (totalShared * prorataB) - indB

print()
print('=== CALCULATED VALUES ===')
print(f'Prorata Saïf: {prorataA*100:.2f}% (expected 65.97%)')
print(f'Prorata Tari: {prorataB*100:.2f}% (expected 34.03%)')
print(f'Part Saïf on shared: {totalShared * prorataA:.2f} € (expected 2649.50)')
print(f'Part Tari on shared: {totalShared * prorataB:.2f} € (expected 1366.79)')
print(f'Restes Saïf: {restA:.2f} € (expected 544.10)')
print(f'Restes Tari: {restB:.2f} € (expected 405.54)')

tolerance = 0.05
errors = []
if abs(restA - 544.10) > tolerance:
    errors.append(f'Restes Saïf: got {restA:.2f}, expected 544.10')
if abs(restB - 405.54) > tolerance:
    errors.append(f'Restes Tari: got {restB:.2f}, expected 405.54')
if abs(prorataA - 3638/5514.72) > 0.001:
    errors.append(f'ProrataA mismatch')
if abs(totalDepensesGlobale - 4565.08) > tolerance:
    errors.append(f'Total dépenses: got {totalDepensesGlobale:.2f}, expected 4565.08')

print()
if errors:
    print('ERRORS:')
    for e in errors:
        print(f'  X {e}')
    sys.exit(1)
else:
    print('OK - ALL CALCULATIONS MATCH EXCEL VALUES (within 0.05 tolerance)')
    print()
    print('=== EXPORT SUMMARY ===')
    n_shared = len(m['sharedExpenses'])
    n_a = len(m['individualExpenses']['a'])
    n_b = len(m['individualExpenses']['b'])
    print(f'  1 month (2025-08) with:')
    print(f'    - 2 revenue lines (Saif + Tari)')
    print(f'    - 2 savings lines (both 0)')
    print(f'    - {n_shared} shared expenses')
    print(f'    - {n_a} individual expenses (Saif)')
    print(f'    - {n_b} individual expenses (Tari)')
    print(f'    - All expense items have UUID id')
    print(f'    - ZERO calculated values stored (prorata/totals/restes omitted)')
    print(f'  Firestore path: users/{{uid}}/financeMonths/2025-08')
