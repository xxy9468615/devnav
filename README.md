# DevNav — Developer Resource Navigation

Auto-updating developer resource directory. Aggregates bookmarks, awesome lists, and community picks.

## Quick Start

### 1. Setup Supabase Table
Run `setup-supabase.sql` in your Supabase SQL Editor.

### 2. Configure Environment
Edit `.env` with your Supabase credentials:
```bash
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
```

### 3. Deploy to Server
```bash
# Upload the entire devnav folder to your server (e.g., /opt/devnav)
# Then SSH in and run:

cd /opt/devnav
npm install
npm run build
npm start
```

### 4. Run with PM2 (recommended)
```bash
npm install -g pm2
pm2 start ecosystem.config.json
pm2 save
```

### 5. Setup Hourly Data Fetch
```bash
crontab -e
# Add this line:
17 * * * * cd /opt/devnav && node scripts/fetch-all.mjs >> /var/log/devnav-fetch.log 2>&1
```

### 6. First Data Fetch
```bash
npm run fetch
```

## Tech Stack
- Astro 6 SSR + Tailwind 3
- Supabase PostgreSQL
- React Islands (search/filter)
- PM2 process manager

## Scripts
- `npm run build` — Build for production
- `npm start` — Start the server (port 4321)
- `npm run fetch` — Run data fetch pipeline manually
- `pm2 logs devnav` — View server logs
