# CLAUDE.md – Pixis

Pixis ist ein Spiel mit prozeduralen SDF-Kreaturen in einer eigenen Engine.
Vor jeder Aufgabe lesen: `docs/PLAN.md` (Architektur, Meilensteine) und `docs/WORKFLOW.md` (Ablauf, DoD).

## Regeln
- Arbeite meilensteinweise; nichts aus späteren Meilensteinen vorziehen, ohne zu fragen.
- Zufall nur über den Seeded-RNG – Kreaturen müssen pro Seed deterministisch sein.
- Jede sichtbare Änderung: App starten, Screenshot machen, im PR zeigen.
- Golden Images nie blind aktualisieren – Abweichung erst ansehen und begründen.
- Shader-Struct-Layouts in TS und WGSL synchron halten.
- Kommunikation mit dem Owner auf Deutsch; Code, Kommentare, Commits auf Englisch.

## Befehle
- `npm run dev` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run test:visual`
- Headless-Screenshots: Canvas-Präsentation geht im Container nicht, daher rendert `?frozen=N` offscreen
  und kopiert das Bild in ein 2D-Canvas. Chromium-Flags siehe `tests/visual/run.mjs`. `&hud=1` zeigt das HUD mit.
- Terrain-Höhe existiert doppelt (`src/core/terrain.ts` und `scene.wgsl`) – immer beide ändern.
