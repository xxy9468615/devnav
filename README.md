# DevNav — 1200+ Free Developer Tools & Resources Directory

> 🚀 Auto-updated hourly from [free-for-dev](https://github.com/ripienaar/free-for-dev), [awesome-selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted), and Hacker News.

## 📂 Resource Categories

| Category | Examples |
|----------|----------|
| 🚀 **DevOps & Cloud** | AWS, GCP, Azure free tiers, CI/CD, containers, DNS, hosting |
| 🤖 **AI & Machine Learning** | LLM APIs, code generation, ML platforms, generative AI tools |
| 🎨 **Frontend** | UI frameworks, CSS tools, CMS, Flutter, React, Vue |
| ⚙️ **Backend** | Server frameworks, APIs, email, messaging, authentication |
| 🗄️ **Database** | PostgreSQL, MongoDB, Redis, Supabase, Firebase |
| 🔒 **Security** | Auth platforms, PKI, encryption, vulnerability scanning |
| ✨ **Design** | Fonts, icons, color tools, UI/UX prototyping |
| 📚 **Learning** | Courses, tutorials, documentation, certifications |
| ⚡ **Productivity** | IDE, code quality, testing, project management, collaboration |
| 🆓 **Free Services** | Misc free tiers, APIs, and SaaS for developers |

## ✨ Features

- **1200+ curated resources** across 11 categories
- **Auto-updated hourly** — never miss a new free tier
- **Dark mode** — easy on the eyes
- **Instant search** — client-side, no loading delays
- **Category filtering** — find what you need fast
- **Source badges** — know where each resource comes from

## 🛠️ Tech Stack

- [Astro](https://astro.build) SSR + [Tailwind CSS](https://tailwindcss.com)
- [Supabase](https://supabase.com) PostgreSQL
- [Vercel](https://vercel.com) deployment
- GitHub Actions for automated data sync

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/xxy9468615/devnav.git && cd devnav

# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your Supabase credentials

# Setup database
# Run setup-supabase.sql in Supabase SQL Editor

# Fetch data
npm run fetch

# Dev server
npm run dev
```

## 📦 Deploy to Vercel (Free)

1. Fork this repo
2. Connect to [Vercel](https://vercel.com)
3. Add environment variables:
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
4. Deploy — done!

## 🔄 Auto Data Sync

GitHub Actions runs every hour to sync resources:

- [free-for-dev](https://github.com/ripienaar/free-for-dev) — 1200+ free SaaS/PaaS/IaaS services
- [awesome-selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted) — self-hosted software
- [Hacker News](https://news.ycombinator.com) — top 30 frontpage picks

Add GitHub Secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) to enable.

## 📄 License

MIT

---

**Keywords:** free developer tools, developer resources, free SaaS, free API, cloud free tier, devops tools, AI tools, open source, awesome list, free hosting, free database, developer directory, programming resources, free tier list, web development tools
