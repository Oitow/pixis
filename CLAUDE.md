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
