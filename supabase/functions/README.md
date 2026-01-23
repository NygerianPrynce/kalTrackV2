# Supabase Edge Functions

This directory contains the Edge Functions for KalTrack.

## Functions

- **log-meal**: Parses meal descriptions using OpenAI and stores them in the database
- **get-logs**: Retrieves meal logs with aggregations (today's totals, daily totals, averages)
- **health**: Simple health check endpoint

## Deployment

### Prerequisites

1. Install Supabase CLI: `npm install -g supabase`
2. Login: `supabase login`
3. Link your project: `supabase link --project-ref <your-project-ref>`

### Set Secrets

```bash
supabase secrets set OPENAI_API_KEY=sk-your-key-here
supabase secrets set PROJECT_URL=https://<project-ref>.supabase.co
supabase secrets set SERVICE_ROLE_KEY=your-service-role-key
```

### Deploy

```bash
supabase functions deploy log-meal --no-verify-jwt
supabase functions deploy get-logs --no-verify-jwt
supabase functions deploy health --no-verify-jwt
supabase functions deploy delete-meal --no-verify-jwt
supabase functions deploy update-meal --no-verify-jwt
```

### Test

```bash
# Health check
curl https://<project-ref>.supabase.co/functions/v1/health

# Log a meal (example)
curl -X POST https://<project-ref>.supabase.co/functions/v1/log-meal \
  -H "Content-Type: application/json" \
  -d '{"text": "Grilled chicken breast, 200g, with brown rice"}'

# Get logs
curl https://<project-ref>.supabase.co/functions/v1/get-logs?range=7d
```

## Environment Variables

All functions require these secrets to be set:
- `OPENAI_API_KEY`: Your OpenAI API key
- `PROJECT_URL`: Your Supabase project URL
- `SERVICE_ROLE_KEY`: Your Supabase service role key (from Project Settings → API)

## Logs

View function logs:

```bash
supabase functions logs log-meal
supabase functions logs get-logs
```
