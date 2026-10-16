# 🎨 PixCity · Identité visuelle v1

> **Règle d'or :** toutes les images du jeu sont générées avec **le même prompt maître**
> (ci-dessous, bloc « MASTER PROMPT »). Seul le bloc `SUBJECT:` change d'une image à
> l'autre. On ne modifie jamais le style, la palette, la lumière ni le cadrage.

Ce document est la **source de vérité** de la direction artistique. Le moteur pixel-art du
jeu (`src/gfx/`) suit exactement la même palette, donc les illustrations générées et le
rendu en direct se répondent.

---

## Palette officielle

| Rôle | Hex | Utilisation |
|---|---|---|
| Nuit profonde | `#0a0e1c` | fonds, contours, premier plan |
| Bleu nuit | `#1b2550` | ciel haut, silhouettes lointaines |
| Navy panneau | `#232c4f` | masses de bâtiments, ombres froides |
| Orange crépuscule | `#ff9a5c` | horizon, soleil couchant |
| Or lumière | `#ffd166` | pièces, enseignes allumées |
| Crème chaude | `#fff3c4` | points forts, fenêtres vives |
| Fenêtre allumée | `#ffe9a0` | lumières intérieures |
| Cyan néon | `#6be3ff` | néons froids, effets, téléscripteurs |
| Magenta néon | `#ff4dd2` | enseignes, spectacles, fête |
| Violet | `#b06bff` | gemmes, quantique |
| Vert herbe | `#3f7a3c` / `#2f5d33` | sols, parcs |
| Gris pierre | `#8a8f96` | routes, béton |

**Règle de couleur :** lumières **chaudes** (or/crème) dans un monde **froid**
(indigo/navy), avec le néon cyan/magenta comme accent. Jamais de blanc pur dominant.

---

## MASTER PROMPT (à garder tel quel)

```text
PIXCITY — 16-bit pixel art, side-view 2D city scene, cohesive retro arcade look.

STYLE: authentic hand-placed pixel art; chunky visible square pixels; crisp hard edges;
no anti-aliasing, no blur, no smooth vector shapes; limited palette of about 24 colours;
dithered gradient skies; bold readable silhouettes; 1-pixel highlights.

PALETTE (strict): deep night indigo #0a0e1c and #1b2550; navy #232c4f; sunset orange
#ff9a5c; gold #ffd166 with cream #fff3c4; warm window glow #ffe9a0; cyan neon #6be3ff;
magenta neon #ff4dd2; purple #b06bff; grass green #3f7a3c and #2f5d33; stone grey #8a8f96.

LIGHT: warm sunset horizon fading into deep blue night; warm-lit windows against cool
shadows; tiny 2-3 pixel glow halos around lamps and neon signs (never big soft glow);
a few stars in the upper sky.

PIXCITY LOOK (identity, never change): PixCity is a MODERN retro-futuristic town —
glass-and-concrete office towers with gridded windows and flat roofs, low-rise shops with
striped awnings and glowing neon tube signs, apartment blocks, a ferris wheel, a small
rocket standing on a launch pad, asphalt streets with zebra crossings, street lamps and
parked cars.

MOOD: cosy, optimistic, retro-futuristic city at dusk; charming, slightly toy-like,
colourful but not garish.

COMPOSITION: horizontal widescreen band; sky in the upper third with small layered
clouds; city in the middle (distant skyline behind, closer buildings in front);
dark ground strip at the bottom; clear parallax feeling between layers.

NEVER: medieval castles, crenellated towers, stone cottages, hanging lanterns, banners,
crests, timber framing, cobblestone streets, dungeons or any fantasy-medieval element.
NEVER: text, letters, numbers, logos, watermarks, UI, frames or borders; 3D render,
photorealistic, octane, painterly or airbrushed look; anime faces; excessive detail
noise; more than 24 colours.
```

**Version machine** : [`assets/art/PROMPT.txt`](../assets/art/PROMPT.txt) (à copier-coller
dans n'importe quel outil d'image).

---

## Assets et sujets

Chaque asset = **MASTER PROMPT** + le bloc `SUBJECT` ci-dessous.

| Fichier | `SUBJECT:` (ligne qui change) | Usage dans le jeu |
|---|---|---|
| `assets/art/hero.png` | *(ancre)* The establishing shot of PixCity at dusk: cosy pixel-art city skyline seen from the street — a tall glass tower with lit windows, a small rocket on a launch pad, a ferris wheel, a cinema with a glowing marquee, little shops with striped awnings, trees, street lamps and a road in the foreground, one huge golden moon low in the sky, cyan and magenta neon signs. Wide establishing shot with plenty of calm empty sky in the upper half. | Écran-titre (fond) + image de partage (OG) |
| `assets/art/icon.png` | Square app icon, perfectly centred and symmetrical: one tall pixel-art tower with glowing gold windows standing on a small grassy mound, a big shiny gold coin in front of it, deep indigo night background with tiny stars and a thin cyan rim light. Centred, no cropping, generous empty margin around the building. | Icône PWA / favicon |
| `assets/art/shop.png` | A cosy treasures-and-gems theme: an open wooden chest overflowing with sparkling purple and cyan gems, standing on a street corner in front of a small neon shop with a striped awning, warm lamps around, tiny gold sparkles. Centred subject with a calm sky behind it. | Bandeau du panneau Boutique |
| `assets/art/prestige.png` | A city being reborn among the stars: a cluster of pixel-art buildings lifting off a dark grassy hill on a beam of warm gold light, while swirling constellations, tiny stars and a few purple nebula clouds fill the sky, a ringed planet in the distance, cyan and magenta energy rings around the buildings. | Illustration du prestige |
| `assets/art/district.png` | A brand-new district under construction at golden hour: two small construction cranes lifting golden beams onto a fresh pixel-art building, scaffolding, stacked crates, a crane hook glowing, neighbours' rooftops and a street lamp around, dust of gold sparkles. Calm sky with two small clouds. | Révélation d'un nouveau bâtiment |

### Journal du style (à lire avant toute régénération)

| Version | Constat |
|---|---|
| v1 | Le style, la palette et la lumière étaient **exacts du premier coup** sur l'ancre `hero.png`. Mais les `SUBJECT` ne portaient pas l'ADN de PixCity : « tower » a donné un **château médiéval**, la boutique est devenue une **échoppe fantasy**, le prestige une **île volante médiévale**. |
| v1.1 | Ajout de la règle de monde **PIXCITY LOOK** dans le prompt maître (gratte-ciel, néons, rues asphaltées) + interdiction explicite du médiéval, et génération **avec `hero.png` en image de référence**. C'est la version courante. |

> Leçon : la dérive ne vient jamais du style (il est figé) mais du **sujet**. Si une image
> part ailleurs, on enrichit `SUBJECT` — et on réinjecte l'ancre en référence.

### Règles de génération

1. **Un seul prompt de style** (le MASTER PROMPT) pour toutes les images — jamais de
   variante de style, même pour un petit élément.
2. **On ne change que `SUBJECT`.** Si un asset ne convient pas, on réécrit sa ligne
   `SUBJECT`, on ne touche pas au style.
3. Les images de référence servent **uniquement** de garde-fou de palette et de style :
   on ne recopie jamais la composition d'une autre image.
4. Pas de texte dans l'image (le texte du jeu est en HTML au-dessus).
5. Cadrage horizontal, sujet centré, ciel calme en haut : l'UI doit pouvoir se poser
   dessus sans masquer le sujet.

---

## Vérification automatique

Les assets sont contrôlés par le test de cohérence visuelle :

```bash
node tools/test.mjs      # section « Cohérence visuelle des assets »
node tools/artcheck.mjs  # rapport détaillé (palette dominante par image)
```

Le contrôle décode chaque PNG, échantillonne ses couleurs, et vérifie qu'une large part
des pixels tombe **dans la famille de la palette officielle** (distance colorimétrique
tolérée pour les nuances de dithering). Un asset qui partirait dans un autre style est
signalé immédiatement.

---

## Rappel : le jeu est lui aussi en pixel-art

Le rendu en jeu n'utilise aucune de ces images : les bâtiments, la ville, les décors et les
particules sont **dessinés en code** (`src/gfx/`) avec la même palette. Les illustrations
servent d'écrin narratif : écran-titre, boutique, prestige, révélations, icône.
