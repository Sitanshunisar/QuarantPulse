# QuarantPulse

Prototype app for a 74-bed virus quarantine and treatment centre. It replaces the paper temperature journal with one shared list that shows who has been measured, who has been seen by a doctor, and who can go home.

It is a static site (plain HTML, CSS and JavaScript). There is no build step and no dependencies, so it deploys to Vercel as-is.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell |
| `styles.css` | All styling (white and red, light theme) |
| `app.js` | App logic, demo data and all screens |
| `vercel.json` | Vercel config (clean URLs) |
| `tests/smoke.js` | Smoke test of every role and the main flows (`node tests/smoke.js`) |

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .