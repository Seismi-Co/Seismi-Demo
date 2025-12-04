# bun-react-template

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

To build for production:

```bash
bun run build
```

To run for production:

```bash
bun start
```

## Deployment

This app is deployed to GitHub Pages at:
**https://seismi-co.github.io/Seismi-Demo/**

To deploy updates:

```bash
bun run deploy
git add docs/
git commit -m "Deploy: update site"
git push origin master
```

The `bun run deploy` command builds the app to the `docs/` folder. Then commit and push the changes to deploy to GitHub Pages (configured to serve from `/docs` on the master branch).

### Requirements

- Web Bluetooth API requires HTTPS (provided by GitHub Pages)
- Supported browsers: Chrome, Edge, Opera on desktop

---

This project was created using `bun init` in bun v1.3.1. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
