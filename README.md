# 🚀 Techunico Node Framework (Phase 1)

A lightweight, scalable, and opinionated Node.js backend framework built with Fastify, Prisma, and TypeScript.

Designed for:

* Clean architecture
* Developer experience
* Real-world production readiness

---

# ✨ Features

## 🧱 Core Architecture

* Modular structure (auto-loaded modules)
* Plugin system
* Clean separation of concerns

## ⚙️ Core Systems

* Config system (validated with Zod)
* Structured logging (Pino)
* Request context (`request.ctx`)
* Service container (DI-lite)

## 🔐 Auth & Security

* JWT authentication
* RBAC (roles + permissions)
* Guards (auth + permission)

## 🧪 Validation

* Zod-based validation
* Middleware-driven validation

## 📦 Developer Experience

* CLI module generator
* Auto module registration
* Clean controller/service pattern

## 🌐 API

* Versioned API (`/api/v1`)
* Consistent response format

## ❤️ Production Ready

* Health endpoints (`/health`, `/ready`)
* Metrics (`/metrics`, Prometheus)
* Error handling system

---

# 🚀 Getting Started

## 1. Install dependencies

```bash
npm install
```

---

## 2. Setup environment

```env
PORT=3000
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret

API_PREFIX=/api
API_VERSION=v1
```

---

## 3. Run the app

```bash
npm run dev
```

---

# 🧱 Project Structure

```
src/
├── modules/        # Feature modules
├── plugins/        # Fastify plugins
├── core/           # Core systems (guards, metrics, etc.)
├── config/         # Config system
├── utils/          # Utilities
├── scripts/        # CLI tools
├── types/          # Type definitions
```

---

# 🧩 Creating a Module

```bash
npm run make:module user
```

Creates:

```
src/modules/user/
├── user.controller.ts
├── user.service.ts
├── user.repository.ts
├── user.routes.ts
├── user.schema.ts
├── index.ts
```

---

# 🔐 Authentication

## Register

```
POST /api/v1/auth/register
```

## Login

```
POST /api/v1/auth/login
```

---

# 🛡️ Guards

```ts
preHandler: [
  authGuard,
  permissionGuard(['user.read']),
]
```

---

# 📦 Request Context

```ts
request.ctx.user
request.ctx.requestId
```

---

# 🔧 Services

```ts
request.services.auth
request.services.prisma
```

---

# 🧪 Validation

```ts
preHandler: [
  validateBody(createUserSchema),
]
```

---

# 📊 Observability

## Health

```
GET /health
GET /ready
```

## Metrics

```
GET /metrics
```

---

# 🧠 Philosophy

This framework is built on:

* Simplicity over magic
* Explicit over implicit
* Composition over inheritance

---

# 🔮 Phase 2 (Planned)

* Redis (cache + queue)
* WebSockets (real-time)
* Event system
* Background jobs
* Social authentication

---

# 🤝 Contributing

Internal framework — evolving with real-world usage.

---

# 📄 License

MIT
