# The Archive: Beyonder Pathways of LotMCraft

An in-world compendium of the 16 Beyonder pathways in [LotMCraft](https://github.com/jakob-wlf/LotMCraft). It is plain HTML, CSS and JS with no build step. Open `index.html` in a browser, or serve the folder with any static server.

## Files

| File | Purpose |
| --- | --- |
| `pathways.js` | All content (`window.PATHWAYS`, `window.ARCHIVE_META`). **Generated. Do not edit by hand.** |
| `app.js` | Shared layout (nav, footer, theme lever) and the renderers for the archive, pathway and acting pages. |
| `style.css` | Shared styles. Midnight and parchment themes; each pathway's accent comes from its `accentColor`. |
| `index.html`, `acting.html` | The archive and the general On Acting page. |
| `<pathway>.html`, `<pathway>-acting.html` | Thin shells for each pathway's **Abilities** page and **Acting Methods** page, picked by `<html data-pathway="…" data-view="acting">`. |
| `assets/emblems`, `assets/abilities` | Art copied from the mod by the extractor. Emblems are downscaled to 256 px. |
| `tools/extract-pathways.ps1` | Reads a LotMCraft checkout and regenerates `pathways.js` and `assets/`. |

## Refreshing the data after the mod changes

```powershell
git clone -b hunger-games https://github.com/jakob-wlf/LotMCraft.git ..\LotMCraft
git -C ..\LotMCraft config core.longpaths true   # Windows: some paths exceed 260 chars
powershell -ExecutionPolicy Bypass -File tools\extract-pathways.ps1 -Repo ..\LotMCraft
```

The extractor only reads the checkout. It takes:

- **Abilities** from `AbilityHandler` / `PassiveAbilityHandler` registrations. For each ability it reads the class's `getRequirements()` (the pathway and the Sequence it unlocks at), the cooldown passed to `super(...)`, `getSpiritualityCost()` and the dynamic per-Sequence lists. Names and descriptions come from `en_us.json`.
- **Field notes** (the expandable section on each ability card), also read from the ability's class with comments stripped:
  - **Kind:** toggle, if the class extends `ToggleAbility`; selectable modes, from `getAbilityNames()` with names and any `.description` from the lang file.
  - **Base damage:** `baseDamage`, which the mod scales by Sequence.
  - **Status effects:** every `new MobEffectInstance(...)`, with level and duration when they are literal numbers.
  - **Restrictions:** `canBeCopied`, `cannotBeStolen`, `canBeReplicated`, `canBeShared` and `canBeUsedInArtifact`.
  - **Physical Enhancements:** the per-Sequence lists in `getEnhancementsForSequence`, converted with the per-level values in `EnhancementType`.

  Who receives an effect is inferred from the statement that applies it. `addPotionEffectToNearbyEntities` means nearby creatures; `entity.addEffect` means the caster; any other `x.addEffect` means targets. This is a heuristic, so each note links to the source file it was read from.
- **Sequence names and pathway relations** from `BeyonderData.pathwayInfos`. Divine groups come from `AdvancementUtil.PATHWAY_DOMAINS`, falling back to the related-pathway list.
- **Acting deeds** from `ActingTaskRegistry`, with digestion per deed calculated under default game rules.
- **Warnings**, built from the rules in `AdvancementUtil`, `SanityEventHandler`, `ActingCapHelper`, plus any ability whose description mentions sanity.

### Abilities the mod leaves undescribed

60 abilities have no description in the mod's lang file. For these, `tools/ability-notes.json` holds plain-language explanations written by reading each ability's source code. On the site they carry the label "Archivist's reading of the code". The mod's own description always takes priority: if the mod adds one later, the note is ignored and the extractor reports it as unused.

`tools/ability-notes.lock.json` records a hash of each ability's source file at the time its note was checked. When a source file changes, the extractor warns that the note needs re-checking. After updating a note, run the extractor with `-StampNotes` to record the new hashes.

Anything else the mod does not define is shown as **[Archive incomplete]**. That covers missing descriptions, Sequences with no deeds (all of Twilight Giant and Black Emperor, and every Sequence 0), and the Black Emperor's pathway-specific abilities. Lore blurbs and acting-method notes are assembled only from these extracted facts.

Accent colours and pathway order are site design choices. They live in `$SITE` at the top of the extractor.

## Licence note

LotMCraft declares `mod_license=All Rights Reserved`. The emblem and ability icon art in `assets/` belongs to the mod's authors. Get their permission before publishing this site publicly.
