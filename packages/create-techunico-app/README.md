# 🚀 Techunico Node Framework

Internal backend framework built by Techunico for scalable, production-ready applications.

---

# 🧠 Overview

This repository contains:

* 🧱 Framework core (`src/`)
* 📦 Project template (`template/`)
* ⚙️ CLI tool (`packages/create-techunico-app`)

---

# 🏗️ Architecture

```text
root/
├── src/                         # Framework core
├── template/                    # Generated app template
├── packages/
│   └── create-techunico-app/    # CLI tool (published to npm)
```

---

# 🚀 Getting Started (Development)

## 1. Install dependencies

```bash
npm install
```

---

## 2. Run framework locally

```bash
npm run dev
```

---

# 🧱 Working on the Framework

All core logic lives in:

```text
src/
```

Includes:

* Modules system
* Plugins
* Auth + RBAC
* Validation
* Metrics + health
* Service container

---

# 📦 Updating Template

Whenever you update the framework:

```bash
npm run build:template
```

This will:

* Generate clean template
* Sync into CLI package

---

# ⚙️ Working on CLI

```bash
cd packages/create-techunico-app
```

Test locally:

```bash
npm link
create-techunico-app test-app
```

---

# 🚀 Publishing CLI

```bash
cd packages/create-techunico-app

npm version patch   # or minor / major
npm publish --access public
```

---

# 🧪 Testing

```bash
npm run test
```

---

# 📂 Template Structure

Generated apps will have:

```text
src/
prisma/
package.json
tsconfig.json
.env.example
```

---

# 🔥 Philosophy

* Simple over complex
* Explicit over magic
* Production-ready by default

---

# 👥 Team Workflow

1. Develop features in `src/`
2. Run:

```bash
npm run build:template
```

3. Test CLI
4. Publish

---

# 🔮 Future (Phase 2)

* Redis (cache + queue)
* WebSockets
* Events system
* Background jobs

---

# 📄 License

MIT
