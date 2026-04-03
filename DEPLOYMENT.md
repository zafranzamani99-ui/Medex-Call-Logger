# Medex Call Logger — Deployment Guide

## Target
- **Domain**: support.medex1cloud.com
- **Host**: Vercel (auto-deploy from GitHub)
- **Database**: Supabase (already live at otfkiaikrunvtoinmudh.supabase.co)

---

## First-Time Setup

### 1. Run Pending SQL Migrations
Go to **Supabase Dashboard > SQL Editor** and run these in order:

| # | File | What it does |
|---|------|-------------|
| 023 | `sql/023_schedule_status_expand.sql` | Add rescheduled + no_answer status |
| 024 | `sql/024_schedules_audit_trigger.sql` | Audit trigger on schedules |
| 025 | `sql/025_schedule_wa_number.sql` | Add clinic_wa column |

### 2. Commit & Push to GitHub
```bash
git add .
git commit -m "Medex Call Logger — ready for deployment"
git remote add origin https://github.com/YOUR_USERNAME/medex-call-logger.git
git branch -M main
git push -u origin main
```
> .env.local is gitignored — secrets won't be pushed.

### 3. Deploy on Vercel
1. Go to https://vercel.com/new
2. Import the GitHub repo
3. Set these **Environment Variables** before deploying:

| Variable | Type |
|----------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Plain |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Plain |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret |
| `GEMINI_API_KEY` | Secret |

> Copy values from your `.env.local`

4. Click **Deploy**

### 4. Custom Domain
1. Vercel project > **Settings > Domains** > Add `support.medex1cloud.com`
2. Vercel shows DNS record to add (CNAME to `cname.vercel-dns.com`)
3. Add that record at your domain registrar
4. Wait for SSL — usually a few minutes

### 5. Supabase Auth Redirect
1. Supabase Dashboard > **Authentication > URL Configuration**
2. Set **Site URL**: `https://support.medex1cloud.com`
3. Add **Redirect URL**: `https://support.medex1cloud.com/**`

---

## After Setup — How Changes Work

### Code Changes (app, UI, API routes)
```
edit code locally > git add > git commit > git push > Vercel auto-deploys
```
- Push to `main` = live at support.medex1cloud.com
- Push to other branch = preview URL for testing
- Rollback = one click in Vercel dashboard

### Database Changes (new columns, tables, triggers)
- Run SQL manually in **Supabase Dashboard > SQL Editor**
- Vercel does NOT touch the database — only deploys app code

### New Environment Variables
- Add once in **Vercel > Project Settings > Environment Variables**
- Persists across all future deploys

---

## Post-Deploy Checklist
- [ ] Login page loads
- [ ] Can log in with credentials
- [ ] Dashboard shows data
- [ ] Log a call — appears in My Log / History
- [ ] CRM Upload works
- [ ] Calendar page loads with schedules
- [ ] KB page works + AI draft generation
- [ ] Activity page shows audit entries
