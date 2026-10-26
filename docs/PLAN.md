# Pixis – Plan

## 1. Vision

Pixis lässt Spieler*innen Kreaturen erschaffen, die **lebendig aussehen und sich lebendig verhalten**.
Jede Kreatur ist ein Genom → daraus entsteht ein Bauplan → daraus ein Skelett mit SDF-Körperteilen →
daraus Animation, Fähigkeiten und Verhalten. Nichts ist ein vorgefertigtes Mesh.

**Leitsätze**
1. *Form folgt Funktion:* Ein Teil, das eine Kreatur hat, macht auch etwas (Flügel → fliegen, Flossen → schwimmen).
2. *Alles prozedural, alles deterministisch:* gleicher Seed = gleiche Kreatur, überall.
3. *Weich und organisch:* Smooth-Unions statt harter Kanten – das ist der Look von Pixis.
4. *Immer sichtbar:* Jeder Fortschritt ist im Browser anschaubar (auch am Handy).

## 2. Tech-Stack (umgesetzt: TypeScript + WebGPU)

| Bereich | Vorschlag | Warum |
|---|---|---|
| Sprache | **TypeScript** | schnelle Iteration, ein Codebase für Engine + UI |
| GPU | **WebGPU + WGSL** | Compute-Shader, modern, läuft im Browser (Desktop & Handy) |
| Build | **Vite** | Hot-Reload für Shader und Code |
| Tests | **Vitest** (Logik) + **Playwright** (Screenshot-/Golden-Image-Tests) | Rendering automatisch prüfbar |
| CI | GitHub Actions | Lint, Typecheck, Tests, Preview-Build pro PR |

Alternative: **Rust + wgpu** (mehr Performance, nativ + WASM), aber langsamere Iteration.
Empfehlung: mit TS/WebGPU starten; die Engine-Kerne (Genom, Bauplan, SDF-Szene) bleiben datengetrieben,
sodass ein späterer Umzug einzelner Teile nach Rust/WASM möglich ist.

## 3. Architektur

```
Genom (Seed + Gene)
   │  genetics/        Mutation, Kreuzung, Validierung
   ▼
Bauplan (BodyPlan)     Rumpf-Segmente, Gliedmaßen, Kopf, Anhänge – als Graph
   │  bodyplan/
   ▼
Skelett + Teile        Knochen-Hierarchie; jedes Teil = SDF-Primitive an einem Knochen
   │  creature/
   ├──► Animation      anim/      prozeduraler Gang, IK, Wirbelsäulen-Welle, Sekundärbewegung
   ├──► Fähigkeiten    abilities/ abgeleitet aus Teilen (Beine → Laufen, Flügel → Fliegen …)
   ▼
SDF-Szene              sdf/       flache GPU-Liste von Primitiven + Blend-Operationen
   │
   ▼
Renderer               render/    Raymarching (WGSL), Culling, Beleuchtung, Materialien
```

**Kernidee Rendering:** Pro Frame wird jede Kreatur zu einer flachen Liste von Primitiven
(Kapsel, Ellipsoid, Round-Cone, Torus …) mit Transform, Größe, Blend-Radius und Material
in einen Storage-Buffer geschrieben. Der Shader raymarcht diese Liste mit `smin`.
Für Performance: Bounding-Volumes pro Kreatur/Teil + Tile-Culling im Compute-Pass,
damit jeder Pixel nur die Primitive auswertet, die ihn betreffen.

**Datenformate:** Genome und Baupläne sind JSON-serialisierbar → teilbar, versionierbar, testbar.

## 4. Meilensteine

### Stand (Oktober 2026)

| | Status | Was es gibt | Offen |
|---|---|---|---|
| M0 | ✅ | Vite/TS/WebGPU, Seeded RNG, Mathe, CI (Lint, Typecheck, Vitest, Golden Images), Pages-Deploy | – |
| M1 | ✅ | Raymarcher, Ellipsoid + Round-Cone, `smin`, Soft-Shadows, AO, Rim, Fake-SSS, Orbit-Kamera, 4 Debug-Ansichten, Testkreatur | mehr Primitive (Torus, Box) |
| M2 | ✅ | Genom v1 (32 Gene), Mutation, Kreuzung, Validierung, Namen, Bauplan, Galerie | Genom-Schema-Migration ab v2 |
| M3 | ✅ | Follow-the-Leader-Wirbelsäule, diagonaler Gang, 2-Knochen-IK, Schwimmwelle, Flügelschlag, Feder-Antennen, Atmen, Blinzeln, Kiefer | echte Knochen-Hierarchie für Kopf/Hals, Gangarten nach Beinzahl |
| M4 | 🟡 | Compute-Tile-Culling (Bitmaske pro 16×16-Tile), Bounding-Sphere-Skip, dynamische Auflösung, CPU-Budget-Test | GPU-Benchmark in CI (nur Software-GPU dort), Horizont-Kosten des Terrains senken |
| M5 | 🟡 | Muster (Streifen, Flecken, Schuppen, Bauch), Augen mit Iris/Pupille, Hörner, Stacheln, Leuchtorgane, Wasser | Haut-Displacement, Zähne, Augenlider |
| M6 | ✅ | Fähigkeiten aus dem Körper (Laufen/Schlängeln, Springen, Schwimmen, Gleiten/Fliegen, Beißen, Panzer, Leuchten, Sicht), Steuerung (Tastatur + Touch), NPC-KI (wandern, fliehen, jagen), Schaden/Ohnmacht/Respawn | Balancing, Fressen/Energie, Sound |


Jeder Meilenstein endet mit etwas, das man **sieht**, und einer Demo-Seite.

### M0 – Fundament
- Vite + TS + WebGPU-Canvas, Fallback-Meldung ohne WebGPU
- CI: Lint, Typecheck, Vitest, Playwright-Screenshot
- Seeded RNG, Mathe-Lib (vec/quat/mat)
- ✅ *Fertig wenn:* leere Szene mit Himmel-Gradient läuft im Browser, CI ist grün

### M1 – SDF-Renderer
- Fullscreen-Raymarcher, Primitive-Bibliothek, `smin`/`smax`, Kamera (Orbit)
- Licht: Lambert + Soft-Shadows + Ambient Occlusion + Rim-Light
- Debug-Ansichten: Schrittanzahl-Heatmap, Normalen, Primitive-IDs
- ✅ *Fertig wenn:* handgebaute „Testkreatur“ (~20 Primitive) sieht organisch aus, 60 fps

### M2 – Genom & Bauplan
- Genom-Schema v1 (Körperlänge, Segmente, Beinpaare, Kopfform, Proportionen, Farben)
- Generator Genom → BodyPlan → Primitive
- Seed-Galerie: 16 zufällige Kreaturen nebeneinander
- ✅ *Fertig wenn:* jeder Seed eine plausible, unterschiedliche Kreatur ergibt; Golden-Image-Tests für feste Seeds

### M3 – Skelett & Animation
- Knochen-Hierarchie, Teile hängen an Knochen
- Prozeduraler Gang (Gangarten nach Beinanzahl), 2-Knochen-IK für Füße, Wirbelsäulen-Welle
- Sekundärbewegung: Schwanz/Antennen mit Feder-Physik, Atmen, Blinzeln
- ✅ *Fertig wenn:* Kreaturen laufen glaubwürdig über flachen Boden

### M4 – Performance
- Tile-/Cluster-Culling im Compute-Shader, BVH über Teile
- Ziel: **10 Kreaturen × 64 Primitive bei 60 fps** auf Mittelklasse-GPU, 30 fps am Handy
- Perf-HUD + automatisierter Perf-Test
- ✅ *Fertig wenn:* Budget in CI-Benchmark gemessen und eingehalten

### M5 – Materialien & Details
- Prozedurale Muster im lokalen Teil-Raum (Streifen, Flecken, Schuppen via Noise/Voronoi)
- Augen (Iris, Glanz, Lider), Zähne/Hörner, Haut-Displacement, Fake-Subsurface, Glühen
- ✅ *Fertig wenn:* Kreaturen auf Screenshots „wie Figuren“ wirken, nicht wie Blobs

### M6 – Fähigkeiten („Funktionen“)
- Fähigkeits-System: Teile liefern Fähigkeiten + Werte
  - Beine → Laufen/Springen, Flossen → Schwimmen, Flügel → Gleiten/Fliegen
  - Kiefer → Beißen, Stacheln → Abwehr, Leuchtorgane → Licht, Augen → Sichtweite
- Spieler-Steuerung einer Kreatur, Fähigkeiten auslösbar mit eigenen Animationen
- ✅ *Fertig wenn:* zwei unterschiedlich gebaute Kreaturen spielen sich spürbar verschieden

### M7 – Kreatur-Editor & Evolution
- Editor: Teile hinzufügen/ziehen/skalieren, Live-Vorschau, Undo
- Mutation & Kreuzung, „Brutstation“ mit Varianten zur Auswahl
- Teilen per Seed/JSON-Link
- ✅ *Fertig wenn:* eine neue Kreatur in < 2 Minuten erstellt und geteilt werden kann

### M8 – Welt & Spiel-Loop
- SDF-Terrain, Wasser, Pflanzen; mehrere Kreaturen mit einfacher KI (fressen, fliehen, jagen)
- Spielziel (z. B. Ökosystem überleben lassen / Kreatur entwickeln) – Game-Design-Doc folgt
- ✅ *Fertig wenn:* 10 Minuten Spielzeit Spaß machen

## 5. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Raymarching zu langsam bei vielen Primitiven | früh Culling (M4), Primitive-Budget pro Kreatur, Auflösungs-Skalierung |
| WebGPU nicht überall verfügbar | klare Fallback-Meldung; Ziel-Browser: Chrome/Edge/Safari 26+ |
| Kreaturen sehen zufällig/hässlich aus | Bauplan-Regeln (Symmetrie, Proportionen), kuratierte Seed-Galerie, Golden Images |
| Animation wirkt steif | IK + Sekundärbewegung früh (M3), Referenzvideos sammeln |
| Scope-Explosion | strikte Meilensteine, jede Idee zuerst als Issue im Backlog |

## 6. Offene Entscheidungen
- [x] Stack: TS + WebGPU (Rust/WASM später für heiße Pfade möglich)
- [ ] Zielplattform: nur Browser oder auch Desktop-App?
- [ ] Spielkern: Sandbox, Ökosystem-Sim oder Abenteuer mit eigener Kreatur?
- [ ] Art-Direction: verspielt/knuffig oder fremdartig/Tiefsee?
