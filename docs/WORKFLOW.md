# Pixis – Workflow

## Grundprinzip
**Kleine Schritte, immer sichtbar, immer getestet.** Jede Änderung endet mit einem Screenshot
oder einer Demo, die man sich im Browser (auch am Handy) anschauen kann.

## Ablauf pro Aufgabe
1. **Issue** anlegen (Vorlage unten), Label = Meilenstein (`M1`, `M2` …) + Bereich (`render`, `anim`, …).
2. **Branch** `feat/<kurz>` oder `fix/<kurz>` von `main`.
3. **Umsetzen** in kleinen Commits. Neue Kreatur-Features bekommen eine Demo-Seite unter `demos/`.
4. **Prüfen** lokal: `npm run lint && npm run typecheck && npm test && npm run test:visual`.
5. **PR** öffnen mit Screenshot/GIF + kurzem „Was / Warum / Wie testen“.
6. **CI grün + Review** → Squash-Merge nach `main`.
7. Preview-Build wird automatisch veröffentlicht.

## Issue-Vorlage
```
Ziel:        Was soll man danach sehen/tun können?
Meilenstein: M?
Akzeptanz:   - [ ] …  - [ ] Screenshot/Golden-Image  - [ ] Perf-Budget eingehalten
Notizen:     Referenzen, Skizzen, Shadertoy-Links
```

## Definition of Done
- [ ] Lint, Typecheck, Unit-Tests grün
- [ ] Visueller Test: Golden Images für feste Seeds aktualisiert *und* bewusst geprüft
- [ ] Kein Perf-Rückschritt (> 10 %) im Benchmark
- [ ] Demo oder Screenshot im PR
- [ ] Doku/`PLAN.md` angepasst, falls sich Architektur ändert

## Arbeiten mit Claude
- Pro Session **eine** Aufgabe aus einem Issue. Den Issue-Link in den ersten Prompt.
- Claude liest zuerst `CLAUDE.md` und `docs/PLAN.md`.
- Claude startet die App mit Playwright, macht Screenshots und hängt sie an den PR.
- Große Features (z. B. neues Fähigkeitssystem): erst Plan als Kommentar im Issue, dann Code.
- Parallel-Arbeit: getrennte Sessions für getrennte Bereiche (z. B. `render` und `genetics`),
  damit sich PRs nicht überschneiden.

## Rhythmus
- **Wöchentlich:** Meilenstein-Check – was ist fertig, was blockiert, Galerie-Screenshot der Woche.
- **Pro Meilenstein:** Demo-Tag – Kreaturen anschauen, Feedback sammeln, nächsten Meilenstein schärfen.
- **Ideen-Backlog:** jede neue Idee sofort als Issue mit Label `idea`, nicht in den laufenden PR.

## Ordnerstruktur (Ziel)
```
src/
  core/        Mathe, RNG, Utilities
  genetics/    Genom, Mutation, Kreuzung
  bodyplan/    Genom → Bauplan
  creature/    Skelett, Teile, Instanzen
  anim/        Gang, IK, Sekundärbewegung
  abilities/   Fähigkeitssystem
  sdf/         Primitive, Szene, GPU-Layout
  render/      WebGPU, WGSL-Shader, Culling
  game/        Spiel-Loop, Input, Welt
  ui/          Editor, HUD
demos/         eine Seite pro Feature
tests/         unit/ und visual/ (Golden Images)
```

## Konventionen
- Determinismus: Zufall **nur** über den Seeded-RNG aus `core/`, nie `Math.random()`.
- GPU-Layouts (Structs) an einer Stelle definieren und TS/WGSL synchron halten.
- Commit-Messages: `bereich: was` (z. B. `anim: add 2-bone IK for legs`).
