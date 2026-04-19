# notes-bot

Cloudflare Worker that powers the Telegram bot **and** the in-app chat widget for the
React notes app. Both channels share the same hybrid parser, action dispatcher, and
(eventually) LLM agent loop.

## Architecture

```
Telegram --> /telegram/webhook ----+
                                   |--> handler --> (regex fast-path | LLM parse | agent loop)
React widget --> /chat ------------+                               |
                                                                   v
                                             existing Apps Script -> Google Sheet
```

- `src/index.ts` - Hono router (Telegram webhook + `/chat` endpoint, CORS, secret-token validation).
- `src/parser.ts` - Vietnamese regex fast-path + zod-validated LLM JSON fallback.
- `src/dispatcher.ts` - Mirrors `src/services/sheets.ts` from the React app (no Apps Script changes).
- `src/llm.ts` - Provider-agnostic chat-completions client (Groq / OpenAI / Gemini / Ollama).
- `src/agent.ts` - Phase 2b tool-calling loop, max `AGENT_MAX_TURNS` turns.
- `src/memory.ts` - Per-user history backed by Workers KV (or in-memory in dev).
- `src/telegram.ts` - sendMessage + allow-list helpers.

## Phase 1 setup

### 1. Install + configure

```bash
cd server
npm install
cp .dev.vars.example .dev.vars   # local dev only, never commit
```

Fill `.dev.vars`:
- `SHEET_WEBAPP_URL` - same value as `VITE_SHEET_WEBAPP_URL` in the React app.
- `LLM_API_KEY` - free key from https://console.groq.com (or Gemini AI Studio).
- `CHAT_SHARED_SECRET` - any random string; the React widget will send it back.
- `TELEGRAM_*` - filled in step 3.

### 2. Local dev

```bash
npm run dev      # starts wrangler dev on http://localhost:8787
```

Test the parser without Telegram:

```bash
curl -X POST http://localhost:8787/chat \
  -H 'Content-Type: application/json' \
  -H 'X-Chat-Secret: local-shared' \
  -d '{"userId":"me","message":"chi 50k an trua"}'
```

### 3. Telegram bot

1. Talk to [@BotFather](https://t.me/botfather) on Telegram, send `/newbot`, copy the token.
2. Get your numeric Telegram user id from [@userinfobot](https://t.me/userinfobot).
3. Set secrets and deploy the Worker:
   ```bash
   wrangler login
   wrangler secret put TELEGRAM_BOT_TOKEN
   wrangler secret put TELEGRAM_WEBHOOK_SECRET     # any random string
   wrangler secret put TELEGRAM_ALLOWED_USER_IDS   # 12345,67890
   wrangler secret put SHEET_WEBAPP_URL
   wrangler secret put LLM_API_KEY
   wrangler secret put CHAT_SHARED_SECRET
   npm run deploy                                   # prints the workers.dev URL
   ```
4. Register slash commands and the webhook:
   ```bash
   TELEGRAM_BOT_TOKEN=xxx \
   TELEGRAM_WEBHOOK_SECRET=xxx \
   WORKER_URL=https://notes-bot.<account>.workers.dev \
   node scripts/setup-telegram.mjs
   ```
5. Open Telegram, send `chi 50k an trua` - the entry should appear in the sheet.

### 3b. Sharing the bot in a group

Default deployment is private (only ids in `TELEGRAM_ALLOWED_USER_IDS` work).
To open the bot to everyone in a Telegram group:

1. In Telegram, open the bot chat → "Add to Group" → pick your group.
2. (Recommended) Talk to [@BotFather](https://t.me/botfather): `/setprivacy` →
   pick the bot → choose **Disable** so the bot can read all messages instead
   of only commands. If you keep privacy ON, members must address the bot
   with a slash command (`/spend 50k cafe`) or `@your_bot_username` mention.
3. Send any message in the group, then run `npx wrangler tail` and look for
   a line like:
   ```
   telegram: rejected message from user_id=123 chat_id=-1001234567890 chat_type=supergroup
   ```
   Copy the `chat_id` (negative number).
4. Add it to the secret:
   ```bash
   wrangler secret put TELEGRAM_ALLOWED_CHAT_IDS   # value: -1001234567890
   ```
   To allow multiple groups, pass them comma-separated: `-1001234,-1005678`.
5. The bot now responds to *every* member of those groups. Each member's
   `/undo` only affects their own most recent batch (memory is keyed by
   `from.id`, not by group).

Notes for group mode:
- The bot only reacts to messages that look addressed at it: a slash command
  (`/spend ...`, `/undo`, `/help`, ...) or any message containing an `@mention`.
  Other group chatter is ignored to avoid noise. DMs are unchanged.
- `@your_bot_username` is stripped from the message before parsing, so
  `@notes_bot 50k cafe` works the same as `chi 50k cafe`.
- A bot accidentally added to an unallowed group stays silent (we never reply
  in groups we don't recognize).

### 4. React widget

In the React app, set `VITE_CHAT_API_URL` and `VITE_CHAT_API_SECRET` (see top-level
`.env`) and rebuild. The floating chat button appears bottom-right.

## Phase 2a - Self-hosted LLAMA via Ollama

Once you have a Mac mini M4 / mini-PC running on your home network:

1. Install Ollama and pull a model:
   ```bash
   brew install ollama
   ollama pull llama3.2:3b-instruct-q4_K_M     # fastest, ~2 GB
   ollama pull qwen2.5:7b-instruct-q4_K_M      # better Vietnamese, ~4.5 GB
   ollama serve                                 # listens on :11434
   ```
2. Expose it without port-forwarding using Cloudflare Tunnel (free):
   ```bash
   brew install cloudflared
   cloudflared tunnel login
   cloudflared tunnel create notes-llm
   cloudflared tunnel route dns notes-llm llm.<your-domain>
   cloudflared tunnel run --url http://localhost:11434 notes-llm
   ```
3. Point the Worker at it (zero code changes):
   ```bash
   wrangler secret put LLM_API_KEY        # any non-empty value, ignored by Ollama
   # update vars in wrangler.toml or via dashboard:
   #   LLM_PROVIDER = "ollama"
   #   LLM_BASE_URL = "https://llm.<your-domain>/v1"
   #   LLM_MODEL    = "qwen2.5:7b-instruct-q4_K_M"
   wrangler deploy
   ```

## Phase 2b - Agent loop with memory

1. Create the KV namespace and uncomment the `[[kv_namespaces]]` block in `wrangler.toml`:
   ```bash
   wrangler kv namespace create CHAT_MEMORY
   ```
2. Enable the agent loop:
   ```bash
   wrangler secret put USE_AGENT       # value: 1
   wrangler deploy
   ```

The bot now uses tool-calling (`log_entry`, `fetch_total`, `fetch_logs_by_date_range`,
`delete_entry`) and remembers the last 8 messages per user (`src/memory.ts`).

## Security notes

- `/chat` requires `X-Chat-Secret`; rotate `CHAT_SHARED_SECRET` if leaked.
- Telegram webhook validates the `X-Telegram-Bot-Api-Secret-Token` header that we set
  via `setWebhook` - prevents spoofed updates.
- `TELEGRAM_ALLOWED_USER_IDS` (and `TELEGRAM_ALLOWED_CHAT_IDS` if set) are enforced
  before any Sheet write. Rejections are logged so you can grab unknown ids from
  `wrangler tail` to add to the allowlist.
