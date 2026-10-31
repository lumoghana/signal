# Lumo · Signal

The current Lumo Signal prototype, with the original 2D Lumo avatar.

## Deploy to Vercel

Import this repository into Vercel. The included `vercel.json` selects the Other preset, skips dependency installation, builds with `node scripts/build-release.cjs`, and publishes `dist/`.

No npm packages, environment variables or server are required for this prototype. The build uses Node.js built-in modules. App navigation stays at the root URL, so no catch-all rewrite is required.

For a prebuilt-only deployment, serve the existing `dist/` folder and leave the build command empty instead.

## Verify a change

```sh
node scripts/build-release.cjs
node scripts/build-release.cjs --check
node scripts/check-edition-parity.cjs --regression
```

## Prototype data

This is an interactive prototype using browser-local sample records. Hosting it on Vercel does not connect live payment or bank services. Saved demo records belong to each browser and origin, so records on the ChatGPT Site do not automatically follow to a Vercel domain.

## Source provenance

Exported from Signal version 15, source commit `e6d2bb5c6af65286bc400d85ddeca956c640d815`. Existing source, tests, live assets and text review history are included. Historical review screenshots are omitted from the download. The original Site hosting metadata is retained for test provenance; this repository's deployment target is Vercel. Do not publish this export back to the original ChatGPT Site.

Start with `START-HERE.txt` for upload and deployment instructions. The historical development README is in `docs/SOURCE-README.md`.
