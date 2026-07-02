## Plan: Synod Ship Filter on Admin Ships

### What
Add a filter control on `/admin/ships` that lets the user show only ships where `synod = true`.

### How
1. **State**: Add `filterSynod` state (`"all" | "synod" | "non-synod"`).
2. **Filtering**: Extend the `filtered` memo to intersect the class filter with the synod filter.
3. **UI**: Add a second `<select>` next to the existing class filter with options:
   - All Ships
   - Synod Only
   - Non-Synod Only
   Each option shows a live count in parentheses.
4. **Styling**: Match the existing filter select styling.

### Files Changed
- `src/pages/AdminShips.tsx` — add state, update filter logic, add UI control.

### Out of Scope
- No database changes needed (`synod` boolean already exists on `ship_types`).
- No other admin pages affected.