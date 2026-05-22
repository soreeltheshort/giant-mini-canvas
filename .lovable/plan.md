Remove the LLM-related fields from `/admin/ai-config`. The DB columns stay; only the UI surface goes away.

**Edits**
- `src/pages/AdminAIConfig.tsx`
  - Drop the `MODELS` constant.
  - Drop `model_key` and `system_prompt` from the `Persona` interface used by the form.
  - Remove the Model `<select>` and the System prompt `<Textarea>` from `PersonaCard`.
  - Stop passing `model_key` / `system_prompt` in the `addPersona` insert and the `duplicate` insert.
  - Update the intro paragraph to drop the "no LLM calls" hedge — just describe trait + goal-weight tuning.
- `src/lib/ai/seedDefaultPersonas.ts`
  - Stop writing `model_key` and `system_prompt` on seeded personas.
- `wiki_pages` rows `ai` and `ai-architecture`
  - Trim references that imply the LLM may be used later by the AI subsystem. Keep a short note that an unrelated LLM wrapper exists elsewhere in the project but is not part of the AI roadmap.

**Untouched**
- `ai_personas.model_key` and `ai_personas.system_prompt` columns remain.
- `runAITurn`, planners, inspector — no changes.