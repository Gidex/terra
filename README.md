# Terra — Heightmap Studio

A local browser prototype for generating Unreal oriented landscapes. It uses deterministic seeds, procedural terrain and biome colors, and exports without sending map data to a server.

## Run it

Run the built in static server from this folder:

```powershell
node server.js
```

Then open `http://127.0.0.1:4173`.

## Current features

- Eleven terrain archetypes: island, canyon system, mountain basin, volcanic caldera, coastal shelf, high plateau, archipelago, river valley, mesa badlands, dune sea, and glacial fjord.
- Seeded generation with peak elevation, roughness, erosion, sea level, island landmass, canyon width, and highland ridge controls.
- Heightmap, shaded relief, biome, climate, moisture, terrain color, and side profile previews. Climate and moisture views show their own labeled color scales; hover the map to inspect local climate, relative elevation, assigned biome, and the reason it was selected.
- Terrain and relief previews use the selected biome palette; relief adds stronger hillshade and optional contour lines while the biome view remains flat.
- Biomes are assigned from editable temperature, moisture, and elevation profiles. A world climate shift changes the biome distribution; the UI can display temperature in Celsius or Fahrenheit. The inspector percentages report each biome's share of the generated map.
- Automatic rivers follow a filled downhill drainage network; roads use terrain-aware routing, connect placed settlements, and avoid lakes, mountain features, and rivers when a clear route exists. Without settlements, roads form loops; a lone settlement anchors its loop. Lakes, peaks, cities, and villages are spaced to avoid overlap where possible. Settlement zones can flatten the height field.
- Unreal-oriented export: 16 bit grayscale heightmap, RGB biome palette, combined grayscale weight masks per present biome and feature type, world settings, and an Unreal import preset/guide. The preset includes a raster manifest, biome color palette, Landscape component layout, suggested XY/Z scale, and import notes. Select the ZIP option to package the selected files together.
- Export resolutions are 505, 1009, 2017, and 4033 vertices, with suggested Unreal Landscape layouts using 63-quad sections and 2×2 subsections per component.
- Balanced biome mode distributes land evenly across enabled land biomes while keeping ocean separate. Biome colors remain user-editable and are used by the export.
- Drawn features can be selected and moved on the map, deleted individually or as the last item, and restored with undo/redo.

The terrain base field is generated in a Web Worker at Standard (384²), High (512²), or Ultra (768²) working resolution, then resampled to the selected export dimensions. The linear export maps normalized terrain elevation directly to 16 bit values; use sea-emphasized when you want additional grayscale separation around the coastline.

The sea-level control now sets a grayscale threshold in the heightmap view and sea-emphasized export: seabed pixels occupy the darkest range, and land values are remapped above a visible coastline break. Use linear height values for accurate Unreal elevation scaling. The seed field supports freeform deterministic seeds, randomization, and copy.

Climate and moisture previews display the same procedural fields used in biome assignment. Temperature varies with a north-south gradient, elevation, and seeded noise; moisture uses seeded regional variation. These are stylized controls for world generation, not forecasts or a full weather simulation.

## Publish with GitHub Pages

This is a static site; it does not require a build step or server-side runtime. To publish it from a repository:

1. Push the project to GitHub.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select the branch containing this version and the repository root (`/`), then save.
4. Open the Pages URL shown in the settings after deployment completes.

The relative CSS, script, and favicon paths support both user sites and project sites served under a repository subpath. `.nojekyll` keeps Pages from running Jekyll over these static files. The canonical URL, sitemap, and robots sitemap reference are configured for `https://gidex.github.io/terra/`.

GitHub Pages supports private source repositories on certain paid plans, but that does not make a personal-account Pages website private. Confirm the repository's Pages eligibility and site visibility in GitHub Settings → Pages before publishing. A published site may be publicly accessible even while its source repository remains private.
