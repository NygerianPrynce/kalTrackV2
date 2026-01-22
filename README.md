# KalTrack - Siri Meal Logger + PWA Dashboard

A single-user meal logging app that combines Siri voice input with a Progressive Web App dashboard. Log meals via iOS Shortcuts, and view your nutrition data in a beautiful mobile-first PWA.

## Features

- **Voice Logging**: "Hey Siri, log meal" → speak what you ate → automatic nutrition parsing via OpenAI
- **PWA Dashboard**: View today's totals, trends, and history on your iPhone (add to Home Screen)
- **No Authentication**: Simple, fast, public endpoints (single-user only)
- **Goals Tracking**: Set daily nutrition goals and track progress
- **Charts & Trends**: Visualize your nutrition over time with Recharts
- **Manual Entry**: Quick Add form for logging meals without Siri

## Tech Stack

- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **AI**: OpenAI API (GPT-4o-mini) for nutrition parsing
- **Frontend**: React + Vite + TypeScript + PWA
- **Charts**: Recharts
- **Hosting**: Render (Static Site) for PWA

## Prerequisites

- Node.js 18+ and npm
- Supabase account (free tier works)
- OpenAI API key
- iOS device with Shortcuts app (for voice logging)

## Setup Instructions

### 1. Supabase Project Setup

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL: `https://<project-ref>.supabase.co`
3. Go to Project Settings → API → copy your `service_role` key (keep this secret!)

### 2. Apply Database Migration

1. In Supabase Dashboard, go to SQL Editor
2. Copy the contents of `supabase/migrations/0001_meal_logs.sql`
3. Paste and run it in the SQL Editor
4. Verify the `meal_logs` table was created

### 3. Deploy Edge Functions

Install Supabase CLI (if not already installed):

```bash
npm install -g supabase
```

Login to Supabase:

```bash
supabase login
```

Link your project:

```bash
supabase link --project-ref <your-project-ref>
```

Set environment variables (secrets):

```bash
supabase secrets set OPENAI_API_KEY=sk-your-openai-key-here
supabase secrets set PROJECT_URL=https://<project-ref>.supabase.co
supabase secrets set SERVICE_ROLE_KEY=your-service-role-key-here
```

Deploy the functions:

```bash
supabase functions deploy log-meal
supabase functions deploy get-logs
supabase functions deploy health
```

Verify deployment:

```bash
curl https://<project-ref>.supabase.co/functions/v1/health
```

Should return: `{"ok":true,"timestamp":"..."}`

### 4. Configure Web App

1. Navigate to the web directory:

```bash
cd web
```

2. Install dependencies:

```bash
npm install
```

3. Create `.env` file:

```bash
cp .env.example .env
```

4. Edit `.env` and set your Supabase URL:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
```

5. Generate PWA Icons (required for iOS install):

You need to create three icon files in `web/public/`:
- `icon-192.png` (192x192px)
- `icon-512.png` (512x512px)
- `apple-touch-icon.png` (180x180px)

You can use any image editor or online tool to create these. They should be square PNG images with your app logo/icon.

6. Test locally:

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

### 5. Deploy to Render (Static Site)

1. Push your code to a Git repository (GitHub, GitLab, etc.)

2. Go to [render.com](https://render.com) and sign up/login

3. Click "New +" → "Static Site"

4. Connect your repository

5. Configure the static site:
   - **Name**: `kaltrack-pwa` (or any name)
   - **Root Directory**: `web`
   - **Build Command**: `npm ci && npm run build`
   - **Publish Directory**: `dist`

6. Add environment variable:
   - **Key**: `VITE_SUPABASE_URL`
   - **Value**: `https://<project-ref>.supabase.co`

7. Click "Create Static Site"

8. **IMPORTANT - Configure SPA Routing**:
   - After deployment, go to Settings → Redirects/Rewrites
   - Add a rewrite rule:
     - **Source**: `/*`
     - **Destination**: `/index.html`
     - **Action**: `Rewrite`
   - Save changes

9. Your PWA will be available at `https://<your-app-name>.onrender.com`

### 6. Install PWA on iPhone

1. Open your deployed PWA URL in Safari on iPhone
2. Tap the Share button (square with arrow)
3. Tap "Add to Home Screen"
4. Name it "KalTrack" (or any name)
5. Tap "Add"
6. The app icon will appear on your home screen

### 7. Create iOS Shortcut for Voice Logging

1. Open the **Shortcuts** app on your iPhone

2. Tap the **+** button to create a new shortcut

3. Name it: **"Log meal"**

4. Add these actions in order:

   **Action 1: Dictate Text**
   - Search for "Dictate Text"
   - Add it
   - Variable name: `mealText`

   **Action 2: Get Current Date**
   - Search for "Get Current Date"
   - Add it
   - Variable name: `now`

   **Action 3: Get Contents of URL**
   - Search for "Get Contents of URL"
   - Add it
   - Configure:
     - **URL**: `https://<project-ref>.supabase.co/functions/v1/log-meal`
     - **Method**: `POST`
     - **Headers**: 
       - Key: `Content-Type`
       - Value: `application/json`
     - **Request Body**: `JSON`
     - **JSON Body**:
       ```json
       {
         "text": mealText,
         "timestamp": now
       }
       ```

   **Action 4: Get Dictionary Value**
   - Search for "Get Dictionary Value"
   - Add it
   - **Get**: `speech` (from the previous action's result)

   **Action 5: Speak Text**
   - Search for "Speak Text"
   - Add it
   - Use the value from the previous action

5. Save the shortcut

6. **Enable Siri Integration**:
   - Go to Shortcuts app → tap your "Log meal" shortcut
   - Tap the settings icon (⚙️)
   - Tap "Add to Siri"
   - Record your phrase: "Log meal"
   - Save

7. Test it: Say "Hey Siri, log meal" and describe what you ate!

## Usage

### Voice Logging

1. Say "Hey Siri, log meal"
2. When prompted, describe what you ate (e.g., "Grilled chicken breast, 200 grams, with brown rice and steamed broccoli")
3. Siri will confirm with the logged nutrition info

### Dashboard

- View today's calories and macro totals
- See progress bars vs your goals
- Expand recent meals to see item breakdowns
- Pull down to refresh data

### Trends

- View line charts for calories, protein, and fiber over time
- Switch between 7, 14, 30, and 90 day ranges
- See goal lines overlaid on charts
- View last 7-day averages

### History

- Browse all logged meals
- Search by meal description
- Expand meals to see detailed breakdown
- Use "Quick Add" to manually log meals

### Settings

- Edit your daily nutrition goals (stored locally on device)
- Export all data as JSON
- Goals are saved to localStorage and sync across tabs

## Goals Management

Goals are stored in browser localStorage with key `NUTRITION_GOALS_V1`. Default values:
- Calories: 2500 kcal
- Protein: 180g
- Carbs: 250g
- Fat: 80g
- Fiber: 30g

You can edit these in the Settings page. Changes are saved locally and immediately reflected in the Dashboard.

## API Endpoints

### `POST /functions/v1/log-meal`

Logs a meal via OpenAI parsing.

**Request:**
```json
{
  "text": "Grilled chicken breast, 200g, with brown rice",
  "timestamp": "2024-01-15T12:30:00Z",  // optional
  "meal_type": "lunch"  // optional
}
```

**Response:**
```json
{
  "ok": true,
  "id": "uuid",
  "meal_time": "2024-01-15T12:30:00Z",
  "totals": {
    "calories": 450,
    "protein_g": 45.0,
    "carbs_g": 35.0,
    "fat_g": 12.0,
    "fiber_g": 3.0
  },
  "confidence": 0.85,
  "assumptions": ["Assumed 200g chicken breast"],
  "speech": "Logged 450 calories, 45 grams protein, 3 grams fiber."
}
```

### `GET /functions/v1/get-logs`

Retrieves meal logs with aggregations.

**Query Parameters:**
- `range`: `7d` | `14d` | `30d` | `90d` (default: `14d`)
- `from`: `YYYY-MM-DD` (optional, use with `to`)
- `to`: `YYYY-MM-DD` (optional, use with `from`)
- `tz`: IANA timezone (default: `America/Chicago`)

**Response:**
```json
{
  "logs": [...],
  "today_totals": {...},
  "daily_totals": [...],
  "last_7_avg": {
    "calories": 2200,
    "fiber_g": 28.5,
    "protein_g": 165.0
  }
}
```

### `GET /functions/v1/health`

Health check endpoint. Returns `{"ok": true, "timestamp": "..."}`

## Project Structure

```
kalTrack/
├── supabase/
│   ├── functions/
│   │   ├── log-meal/
│   │   │   └── index.ts
│   │   ├── get-logs/
│   │   │   └── index.ts
│   │   └── health/
│   │       └── index.ts
│   └── migrations/
│       └── 0001_meal_logs.sql
├── web/
│   ├── public/
│   │   ├── icon-192.png      # Generate these!
│   │   ├── icon-512.png      # Generate these!
│   │   └── apple-touch-icon.png  # Generate these!
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── api.ts
│   │   ├── types.ts
│   │   └── utils/
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## Troubleshooting

### Edge Functions not working

- Verify secrets are set: `supabase secrets list`
- Check function logs: `supabase functions logs log-meal`
- Test with curl: `curl https://<project-ref>.supabase.co/functions/v1/health`

### PWA not installing on iOS

- Ensure icons are present in `web/public/`
- Check that `manifest.json` is generated (check `dist/` after build)
- Try clearing Safari cache and retry

### OpenAI parsing errors

- Check OpenAI API key is valid
- Verify you have API credits
- Check Edge Function logs for detailed errors

### Goals not saving

- Check browser localStorage is enabled
- Try clearing localStorage and re-adding goals
- Goals are stored locally, not in Supabase

## Security Notes

- **No authentication**: Endpoints are public. This is intentional for single-user use.
- **API keys**: OpenAI and Supabase service role keys are stored server-side only (Edge Function secrets).
- **RLS**: Row Level Security is enabled on the table but not used since client doesn't query DB directly.

## License

Personal use only. Single-user application.

## Support

For issues or questions, check:
- Supabase Edge Functions docs: https://supabase.com/docs/guides/functions
- OpenAI API docs: https://platform.openai.com/docs
- Render Static Site docs: https://render.com/docs/static-sites

---

**Enjoy tracking your meals! 🍽️**
