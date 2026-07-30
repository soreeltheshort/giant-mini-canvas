update public.wiki_pages set title='Supply', content='# Supply

Supply covers two related things: the **supply grid** (which hexes you can operate in) and **fleet supply points** (the consumable stockpile a fleet carries).

## 1. The Supply Grid

A hex is **in supply** for a faction if either of the following is true:

- **Province rule** — the hex''s classification matches that faction''s own province (Core, or Province_1..6). Your own province is always in supply, everywhere, with no facilities required.
- **Emitter rule** — the hex lies within `supply_range` hexes (cube/hex distance) of a planet you own that hosts a facility with `supply_range > 0`.

Details of the emitter rule:

- If a planet has several supply-emitting facilities, the **largest** `supply_range` on that planet wins — ranges do not stack.
- Every qualifying planet projects its own radius; the grid is the **union** of all of them plus your province hexes.
- Only planets you currently **own** emit supply. Losing the planet removes its radius immediately.
- Ownership matching is alias-tolerant: faction display name, code name, and PROVINCE_N slot all resolve to the same faction.
- The grid is recomputed on player load and during each turn''s economy phase — it is never cached across turns.

Facility fields that drive this (Assets > Facilities):

- **`supply_range`** (integer, default 0) — radius in hexes this facility projects. 0 = emits nothing.
- **`requires_supply`** (boolean, default true) — if true, this facility can only be built on a planet whose hex is in supply. Uncheck it for pioneer/beachhead facilities that are allowed to be built out of supply.

### What the grid gates

- **Fleet supply replenishment** — a fleet may only replenish if its **current hex** is in your supply grid. You no longer need to be sitting on an owned planet.
- **Facility construction** — a `build_facility` order for a facility with `requires_supply = true` is rejected at turn processing if the target planet''s hex is out of supply. The build dialog also disables those rows and shows an "Out of Supply" state.
- Rejections are logged: `facility_build_rejected` (reason `out_of_supply`) and `supply_replenish_rejected` (reason `out_of_supply`), both in the economy phase.
- Facilities with `requires_supply = false` can be built on any planet you own, in or out of supply.

### Map indicator

The player map draws a bronze border along the outer edges of your supply grid — specifically, on every edge where an in-supply hex touches an out-of-supply hex or the map boundary. The enclosed area is your operating envelope.

## 2. Fleet Supply Points

Each fleet carries a stockpile of supply points (`current_supply`).

- **Maximum supply** = sum of `supply_pod` across all ships in the fleet''s game roster x `supply_capacity_coefficient` (a Battle Config combat constant, currently **1**).
- Crippled ships still count toward supply capacity — supply pods keep holding supply even when the ship is crippled.
- If supply-pod ships are destroyed and capacity drops below what''s already stored, the stored amount is **preserved** — the game never writes a lower value than what is already in the hold.

### Replenishing

- Queue a **Replenish Supply** order from the fleet detail panel.
- Granted amount = min(requested, max - current). You can never exceed maximum.
- Cost = ceil(granted x `supply_cost_coefficient`) credits, currently **1** credit per supply point, charged to the ordering player''s treasury through that turn''s maintenance line.
- Resolved in the economy phase; logged as `supply_replenished` with before/after values, the requested amount, and cost.

### What consumes supply

- **Repairs** — 1 supply per 1 HP restored. Repairs are also limited by available repair pods and the fleet''s missing HP.
- **Building strikecraft in the field** — each fighter/gunship costs its `point_cost` in supply, and must also fit the fleet''s fighter bay / gunship link capacity. Anything that doesn''t fit on either constraint is dropped and logged.
- **Building ground invasion units** — 1 supply per GI unit.

All of these are resolved in the economy phase and draw from the same pool, in order, until it runs out. Partial fulfilment is normal and is written into the turn logs with a reason ("no supply", "no capacity", "partial (capacity or supply limited)").

## 3. Practical consequences

- Operating inside your own province needs no infrastructure at all.
- To push into neutral or enemy space, you must build a supply-emitting facility on a planet you own that is *already* in supply, then use its radius to reach the next one — supply expands as a chain.
- A facility with `requires_supply = false` is the way to break that chain and establish a beachhead in distant territory.
- Losing a forward supply planet can instantly strand fleets deep in enemy space: they keep whatever supply is in the hold, but cannot replenish, repair, or build strikecraft until they return to the grid.
' where slug='supply-grid';