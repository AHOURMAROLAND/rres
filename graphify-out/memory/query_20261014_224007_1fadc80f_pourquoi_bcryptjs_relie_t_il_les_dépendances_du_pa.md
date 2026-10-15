---
type: "query"
date: "2026-10-14T22:40:07.624956+00:00"
question: "Pourquoi bcryptjs relie-t-il les dépendances du package, l’API et les fonctions Netlify ?"
contributor: "graphify"
source_nodes: ["bcryptjs", "package.json", "server.ts", "db.js", "login.js", "handleLogin"]
---

# Q: Pourquoi bcryptjs relie-t-il les dépendances du package, l’API et les fonctions Netlify ?

## Answer

Expanded from original query via vocab: [bcryptjs, package, dependencies, api, auth, login, password, hash, server]. Graph explain identifies bcryptjs (package.json L21) with three direct links: package.json imports it, server.ts imports it, and netlify/functions/db.js imports it. The graph paths place netlify/functions/login.js between db.js and handler(), then connect handler() semantically (INFERRED) to handleLogin() in server.ts. This indicates a shared dependency across the unified API and Netlify-function implementation paths; it does not establish that bcryptjs is a runtime dispatcher. Graphify reported ambiguous matches for the path endpoints, so the exact path is suggestive, while the direct imports are explicit.

## Source Nodes

- bcryptjs
- package.json
- server.ts
- db.js
- login.js
- handleLogin