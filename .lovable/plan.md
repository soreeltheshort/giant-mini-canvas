# Why the upload fails

`src/pages/AdminShips.tsx` → `parseCSV` (lines 292–350) hard-codes a **two-row header**:

- Row 1 = category row (e.g. blank cells + `Virtual Attack Speed` / `Virtual Defense Speed`)
- Row 2 = the real column names
- Row 3+ = data

Your `ship_catalog_1_-_ship_catalog_1.csv` only has **one** header row (`ship_id,name,class,…`) followed by data. The parser therefore:

1. Treats your real header row as the "category" row.
2. Treats the first ship row (`BB03,Aurelian,…`) as the "header" row, so derived headers become `bb03`, `aurelian`, `bb`, `128`, …
3. None of those match `CSV_FIELD_MAP`, so every row ends up with no `name` and is dropped by the final `.filter(r => r.name)`.
4. UI shows the toast **"No valid ship rows found in CSV."**

The virtual-speed columns in your file (`virtual_atk_speed_attack`, `virtual_def_speed_flank`, …) already match the DB column names, so the category-row prefixing logic isn't actually needed for this file.

# Plan

Make `parseCSV` accept either format.

### Code changes (single file)

`src/pages/AdminShips.tsx` → `parseCSV`:

1. Read all non-empty lines.
2. Detect header style by looking at row 1:
   - If row 1 normalised contains both `ship_id` and `name` → **single-header mode**. Use row 1 as headers, data starts at row 2. No category prefixing.
   - Otherwise → keep current **two-header mode** (row 1 = categories, row 2 = headers, data from row 3).
3. Everything downstream (`CSV_FIELD_MAP` lookup, FLOAT/NUM coercion, class/hull derivation, dedupe, upsert) stays unchanged.

### Optional polish (same edit)

- When parsing returns 0 rows, include a hint in the toast: *"CSV header must include ship_id and name"* — easier to diagnose future bad files.

### Out of scope

- No DB migration.
- No changes to the export button (it can keep emitting the two-row format).
- No changes to upsert / dedupe logic.

### Verification

After the edit:
1. Re-upload `ship_catalog_1_-_ship_catalog_1.csv` on `/admin/ships`. The confirm dialog should show **72 ships** (73 lines − 1 header).
2. Re-upload an export produced by the in-app "Download CSV" button to confirm two-header mode still works.
