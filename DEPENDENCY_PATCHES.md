# Dependency patches

Bun 1.4.3 scopes the override to Satori 0.63.2's direct fflate dependency. It upgrades the exact 0.7.3 pin to 0.7.5, which fixes malformed ZIP64 archive handling in [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98). Other parents and version lineages are unaffected. Remove this override when Satori adopts a patched version.

Satori is a development dependency used by the OG image generator. The inspected Satori and font parser paths use inflateSync, rather than the advisory's unzipSync. Validation covered the real OG script with local TTF fonts and an isolated output directory, plus Satori rendering a compressed WOFF font to SVG and PNG. The full unit and Convex test suites, types, lint, formatting, build, and frozen installs passed.
