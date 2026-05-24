# i18n Backfill Audit — Wave 2026-05-24

**Date:** 2026-05-24
**Branch:** `i18n/wave-2026-05-24-backfill-all-locales`
**Base:** `v4.7.2` (commit `8623a274`)
**Scope:** Translations for every i18n key added during the previous two days (since 2026-05-22 morning).

---

## Summary

A single sweep covering all 797 new i18n keys merged into `frontend/src/app/locales/en.ts` since 2026-05-22. The wave brings every priority locale to 100% coverage of those keys.

| Locale | Missing before | Missing after | Net new keys translated |
|--------|---------------:|--------------:|------------------------:|
| **DE** (German)  | 108 | 0 | **108** |
| **RU** (Russian) | 108 | 0 | **108** |
| **FR** (French)  | 275 | 0 | **275** |
| **ES** (Spanish) | 275 | 0 | **275** |
| **IT** (Italian) | 275 | 0 | **275** |
| **AR** (Arabic)  | 275 | 0 | **275** |
| **Total**        | **1,316** | **0** | **1,316** |

Baseline coverage of these 797 keys:
- DE/RU: 86% (Waves 11–12 had already covered 689 keys via inline edits)
- FR/ES/IT/AR: 65% (522 keys covered, mostly module nav + UserManagement from Wave 11)

After this wave: 100% coverage across all six priority locales for everything added in the previous two days.

---

## How keys were identified

```
git diff <prev-2-day-base>..v4.7.2 -- frontend/src/app/locales/en.ts \
  | grep -E '^\+\s+"[^"]+":' \
  | sed -E 's/^\+\s+"([^"]+)":.*/\1/'
```

Yielded 797 new keys. The first commit inside the 2-day window touching the EN locale file is `0f82fe3e` (2026-05-23 08:40 +0200, `feat(property-dev): deep PropDev pass`); the diff base is its parent `6ff6e767`.

Coverage per locale was then computed by checking literal `"<key>":` presence in each locale `.ts` file (case-sensitive, exact match).

---

## Key groups (by frequency)

| Prefix | Keys | Notes |
|--------|-----:|-------|
| `propdev.*`         | 125 | Plot form, inventory map, dashboards hub, buyers pipeline overview |
| `whatsnew.*`        |  37 | v4.5.0 release-notes carousel + chips + 6 highlight cards (b1/b2/b3) |
| `accommodation.calendar.*` | 24 | New rooms × dates visual calendar |
| `chat.*`            |  23 | No-AI-key banner, contextual page chips, RBAC manager-required error |
| `tour.*`            |  22 | 8-step product tour copy |
| `header.subscribe.*`|  14 | Subscribe-to-news widget |
| `nav.*`             |  15 | New nav targets (Architecture Map, Snapshots, EIR Matrix, etc.) + Pinned/Recent ergonomics |
| `sidebar.*`         |   9 | Editor for hiding nav items |
| `country_combobox.*`|   6 | New country picker (with custom-region + keyboard hints) |
| `contacts.*`        |   5 | PropDev/broker/vendor/subcontractor tags |
| `bim.*`             |   4 | Outdated-converter overlay UX |
| `geo.overlays.*`    |   3 | Empty-state CTA + show/hide a11y labels |

---

## Translation principles applied

Per project policy (CLAUDE.md, German construction vocab, RU industry terms, etc.):

- **DE**: construction/real-estate German — *Bauträger* (developer), *Leistungsverzeichnis (LV)* (BOQ), *Aufmaß* (takeoff), *Mängel* (snags), *Treuhand* (escrow), *Übergabe* (handover), *Gewährleistung* (warranty), *Nachträge* (variations/change orders), *Kollisionsprüfung* (clash detection).
- **RU**: industry RU — *спецификация работ/BOQ*, *застройщик*, *Эскроу*, *передача*, *гарантия*, *Нагрузка проектов/опалубка*, *Снимки*. Loanwords preserved for product names (BIM Hub, Geo Hub, PropDev) per established locale-file convention.
- **FR**: *DQE* (Devis Quantitatif Estimatif) for BOQ, *promoteur immobilier* (real-estate developer), *réservation/compromis* (reservation/sales contract), *livraison* (handover), *journal de chantier* (daily diary), *réserves* (snag list), *avenants* (change orders), *clash* (loanword kept — standard in FR BIM).
- **ES** (es-ES): *promotor inmobiliario*, *compraventa* (sales contract), *entrega* (handover), *repasos* (snags), *órdenes de cambio* (change orders), *diario de obra* (daily diary). Civil-engineering terms preferred over LatAm variants (*plaza de aparcamiento* not *estacionamiento*).
- **IT**: *Edilizia / promotore immobiliare*, *computo metrico estimativo (CME)*, *compromesso* (sales contract), *consegna* (handover), *riserve* (snag list), *varianti* (change orders), *giornale di cantiere* (daily diary), *capitolato* style preserved in form labels.
- **AR**: Modern Standard Arabic. RTL-aware (no LTR-only punctuation forced). Construction-industry vocab: *المطور العقاري* (real-estate developer), *جدول الكميات (BOQ)*, *عقد البيع* (sales contract), *التسليم* (handover), *الضمان* (warranty), *العيوب* (snags), *يوميات الموقع* (daily diary), *كشف التعارضات* (clash detection). Direction arrows kept LTR (`→`) when they form part of a Latin-origin technical glyph; mailto fallback uses `←` to follow Arabic reading flow.

Product-name brand strings (`PropDev`, `BIM Hub`, `Geo Hub`, `Cesium`, etc.) intentionally not translated — they are product identifiers across all locales.

`{{placeholder}}` interpolation tokens preserved exactly as in EN — no localised reorder where the placeholder grammar was ambiguous.

---

## Quality gates

- `npm run lint:unicode` — no zero-width Unicode characters detected outside the allowed `src/app/locales/ar.ts` (which legitimately contains Arabic). PASS.
- `npm run typecheck` — `tsc --noEmit` clean (no new type errors introduced; locale files type as `{ translation: Record<string, string> }`).
- Manual file-end check — every locale file still ends with the canonical resource close block:
  ```ts
    // --- /i18n wave 2026-05-24 backfill ---
    }
  } as { translation: Record<string, string> };

  export default resource;
  ```

---

## Keys intentionally NOT translated (top 5 + reasons)

All 1,316 keys were translated in this wave. There are however a few values where the canonical form is intentionally kept English-loan or product-brand across locales:

1. **`whatsnew.v450.propdev.chip` = `"PropDev"`** — product short-name. Same in all 6 locales.
2. **`whatsnew.v450.geo.chip` = `"Geo Hub"`** — product name. Same across all locales.
3. **`tour.step.4.title` = `"BIM Hub"`** and **`tour.step.6.title` = `"Geo Hub"`** — product names; transliteration would harm searchability.
4. **`chat.panel.ctx_geo.clashes` → "clash"/"clashes" in FR/IT** kept as loanword in FR/IT (standard in industry BIM glossary; native equivalents like FR *conflit géométrique* are wordy and less recognised in tooling UIs).
5. **`header.subscribe.email_placeholder`** — placeholder kept as `you@example.com` (or localized equivalent like `vous@exemple.com`). The IT/AR forms keep `you@example.com` to avoid implying a real third-party email pattern.

---

## Notes for the next backfill wave

- Wider locales (`pt`, `pl`, `ja`, `ko`, `zh`, `nl`, `cs`, `bg`, `hr`, `fi`, `da`, `no`, `sv`, `ro`, `th`, `vi`, `tr`, `id`, `hi`, `mn`) are not covered by this wave. The previous full audit (docs/I18N_AUDIT_2026-05-24.md) shows their baseline gaps; the 797 new keys would push them deeper. Recommend a follow-up sweep that re-uses the translation table from `i18n_backfill.py` (DE/RU as the Cyrillic/Germanic anchor, FR as the Romance anchor) and machine-extends to the remaining 21 locales with light human review on construction vocab.
- The split-script generator (`scripts/split-i18n-fallbacks.mjs`) comment in each locale file warns "Do not edit by hand". This wave edits the locale files directly because the legacy fallback file is monolithic and the project has moved away from it; future backfills should follow the same pattern of appending a marked block before `}\n} as { translation:`.

---

## Branch

`i18n/wave-2026-05-24-backfill-all-locales` — based on `v4.7.2` (`8623a274`).

Single commit prefix `i18n:`. No `--no-verify`. No force-push.
