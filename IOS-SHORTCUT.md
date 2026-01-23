# iOS Shortcut Setup - Voice Meal Logging

Create a shortcut so you can say "Hey Siri, log meal" and describe what you ate.

## Step-by-Step Instructions

### 1. Open Shortcuts App
- On your iPhone, open the **Shortcuts** app (comes pre-installed)

### 2. Create New Shortcut
- Tap the **"+"** button in the top right
- Tap **"Add Action"**

### 3. Add Actions (In Order - 4 total)

#### Action 1: Dictate Text
- Search for **"Dictate Text"**
- Tap to add it
- This will record what you say about your meal

#### Action 2: Get Contents of URL
- Tap **"+"** to add another action
- Search for **"Get Contents of URL"**
- Tap to add it
- Configure it:
  - **URL**: `https://bcaldyngszxsegluvvbe.supabase.co/functions/v1/log-meal`
  - **Method**: Change to **POST**
  - **Headers**: 
    - Tap **"Add Field"**
    - Key: `Content-Type`
    - Value: `application/json`
  - **Request Body**: Select **JSON**
  - **JSON Body**: Tap to edit, then use this structure:
    ```json
    {
      "text": [Dictated Text]
    }
    ```
  - To add variable: Tap the **magic wand icon** next to `text` and select **"Dictated Text"**
  - **Note**: Timestamp is automatically set to current CST time on the server

#### Action 3: Get Dictionary Value
- Tap **"+"** to add another action
- Search for **"Get Dictionary Value"**
- Tap to add it
- **Get**: Type `speech` (this gets the response message from the API)
- **From**: Select the result from "Get Contents of URL"

#### Action 4: Speak Text
- Tap **"+"** to add another action
- Search for **"Speak Text"**
- Tap to add it
- Use the value from "Get Dictionary Value" (should auto-connect)

### 4. Name Your Shortcut
- Tap **"Next"** in the top right
- Name it: **"Log meal"**
- Tap **"Done"**

### 5. Enable Siri Integration
- In Shortcuts app, find your **"Log meal"** shortcut
- Tap on it to open
- Tap the **settings icon (⚙️)** at the bottom
- Tap **"Add to Siri"**
- Tap the red record button
- Say: **"Log meal"** (or whatever phrase you want)
- Tap **"Done"**

### 6. Test It!
- Say: **"Hey Siri, log meal"**
- When prompted, describe what you ate (e.g., "Grilled chicken breast, 200 grams, with brown rice and broccoli")
- Siri will confirm with the logged nutrition info!

## Troubleshooting

### Shortcut doesn't work
- Make sure the URL is correct: `https://bcaldyngszxsegluvvbe.supabase.co/functions/v1/log-meal`
- Check that Edge Functions are deployed
- Test the URL in a browser first: `curl https://bcaldyngszxsegluvvbe.supabase.co/functions/v1/health`

### Siri doesn't recognize the phrase
- Go back to Shortcuts → Your shortcut → Settings → "Add to Siri"
- Re-record the phrase more clearly
- Try a different phrase like "Log my meal" or "Add meal"

### Error when running shortcut
- Check that your iPhone has internet connection
- Verify the Edge Function is working (test with curl)
- Make sure the JSON body is correctly formatted with variables

## Quick Reference

**Your API Endpoint:**
```
https://bcaldyngszxsegluvvbe.supabase.co/functions/v1/log-meal
```

**Test Endpoint (to test timestamp parsing):**
```
https://bcaldyngszxsegluvvbe.supabase.co/functions/v1/health
```
Send POST with: `{"timestamp": "2024-01-15T12:30:00.000Z"}`

**JSON Body Template:**
```json
{
  "text": [Dictated Text]
}
```

**Response Field to Extract:**
- `speech` (this is what Siri will say back)

**Note:** Timestamp is automatically set to current CST time on the server - no need to send it!

---

That's it! You can now log meals hands-free with Siri! 🎉
