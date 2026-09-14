# Starbot — Minimal Telegram File Store

Build a minimal Telegram digital-file store.

The application has ONLY:
- Telegram bot
- Render Node.js server
- Supabase PostgreSQL
- Telegram Stars
- Telegram-hosted files

Do NOT build:
- React
- web admin panel
- Supabase Auth
- Supabase Edge Functions
- Supabase Storage
- categories
- customer accounts
- coupons
- referrals
- analytics dashboards
- unnecessary API layers
- monorepo

==================================================
1. CORE USER EXPERIENCE
==================================================

User opens the bot.

/start

Show all active products:

📦 Available Files

[Premium Pack — ⭐100]
[eFootball Script — ⭐50]

When a product is selected:

📦 Premium Pack

Description...

⭐ Price: 100 Stars

[⭐ Buy]
[⬅️ Back]

User pays using Telegram Stars.

After Telegram sends successful_payment:
- record payment
- record purchase
- send the Telegram file
- send confirmation message

Also implement:

/shop
/purchases
/help
/terms
/paysupport

/purchases shows files previously purchased by the current Telegram user.

==================================================
2. ADMIN EXPERIENCE
==================================================

There is exactly one admin.

Use:

ADMIN_TELEGRAM_ID

Never use username for authorization.

Admin command:

/admin

Show:

⚙️ Admin

[➕ Add File]
[📦 Manage Files]
[📊 Sales]

ADMIN ADD FLOW:

1. Admin presses Add File.
2. Bot asks for a document.
3. Admin sends document.
4. Extract Telegram file_id, file_name, mime_type and file_size.
5. Ask for price in Stars.
6. Ask for product name.
7. Ask for description or /skip.
8. Insert product.
9. Show confirmation.

Example:

✅ File created

📦 Premium Pack
⭐ 100 Stars

ADMIN MANAGE FLOW:

Show active and inactive products.

Selecting one gives:

📦 Premium Pack
⭐100
Status: Active

[✏️ Edit Name]
[📝 Edit Description]
[💰 Change Price]
[📎 Replace File]
[👥 Buyers]
[🔴 Disable]

For disabled products, provide:

[🟢 Enable]

DELETE:
Do NOT physically delete products that may have historical purchases.
Use soft deletion/deactivation by setting:

active = false

REPLACE FILE:
Ask for a new Telegram document.
Update:
- telegram_file_id
- file_name
- mime_type
- file_size
- updated_at

CHANGE PRICE:
Ask for a positive integer Stars value.
Validate it before updating.

BUYERS:
For a selected product, show:
- username if available
- first_name
- Telegram user ID if needed
- amount paid
- purchase date

SALES:
Show:
- total purchases
- total Stars
- today's purchases
- today's Stars

Keep this simple.
No analytics system.

==================================================
3. DATABASE
==================================================

Use exactly three tables.

products:

- id UUID PRIMARY KEY DEFAULT gen_random_uuid()
- name TEXT NOT NULL
- description TEXT
- price_stars INTEGER NOT NULL CHECK (price_stars > 0)
- telegram_file_id TEXT NOT NULL
- file_name TEXT
- mime_type TEXT
- file_size BIGINT
- active BOOLEAN NOT NULL DEFAULT true
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()
- updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

payments:

- id UUID PRIMARY KEY DEFAULT gen_random_uuid()
- product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT
- telegram_user_id BIGINT NOT NULL
- telegram_charge_id TEXT NOT NULL UNIQUE
- amount_stars INTEGER NOT NULL
- created_at TIMESTAMPTZ NOT NULL DEFAULT now()

purchases:

- id UUID PRIMARY KEY DEFAULT gen_random_uuid()
- product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT
- payment_id UUID NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT
- telegram_user_id BIGINT NOT NULL
- username TEXT
- first_name TEXT
- purchased_at TIMESTAMPTZ NOT NULL DEFAULT now()

Indexes:
- products(active)
- purchases(product_id)
- purchases(telegram_user_id)
- payments(product_id)
- payments(telegram_user_id)

Do NOT create a users table in V1.

Do NOT enable RLS because there is no browser/client access to the database.
The server uses the Supabase service-role key.

==================================================
4. FILE STORAGE
==================================================

Files are stored by Telegram.

When the admin sends a file:
- do not download it to Render
- do not upload it to Supabase Storage

Store only the Telegram file_id and metadata.

When a user purchases a product:
sendDocument(userTelegramId, product.telegram_file_id)

==================================================
5. TECHNOLOGY
==================================================

Use:

- TypeScript
- Node.js
- grammY
- @supabase/supabase-js
- zod for environment validation if useful
- npm

Keep the application simple.

No Express unless necessary.

A lightweight HTTP server is required for the Telegram webhook.
You may use Node's built-in http module or a minimal HTTP framework.

==================================================
6. WEBHOOK
==================================================

USE WEBHOOKS FROM THE START.

Do NOT implement long polling.

Render will expose:

POST /telegram/webhook
GET /health

Webhook request flow:

Telegram
  ↓
POST /telegram/webhook
  ↓
validate X-Telegram-Bot-Api-Secret-Token
  ↓
grammY update handling
  ↓
handler
  ↓
Supabase / Telegram APIs

Environment variable:

TELEGRAM_WEBHOOK_SECRET

The webhook endpoint must reject requests when the Telegram secret header does not match.

Do not expose the bot token in URLs.

Provide a setup script or documented command to call Telegram setWebhook.

The application should expose:

GET /health

Response:

{
  "status": "ok"
}

Use this for Render health checks.

==================================================
7. RENDER
==================================================

Deploy as a Render Web Service.

Build:

npm ci
npm run build

Start:

npm start

Scripts:

"dev": "tsx src/server.ts"
"build": "tsc"
"start": "node dist/server.js"

The server must:
- start HTTP server
- initialize grammY bot
- register handlers
- receive Telegram webhook requests
- respond quickly
- avoid crashing on individual bad Telegram updates

Required environment variables:

BOT_TOKEN
ADMIN_TELEGRAM_ID
TELEGRAM_WEBHOOK_SECRET
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

Never commit .env.

==================================================
8. TELEGRAM BOT
==================================================

Use grammY.

Keep modules separated by responsibility.

Suggested structure:

src/
  server.ts
  bot.ts
  config.ts

  db/
    client.ts
    queries.ts

  handlers/
    start.ts
    products.ts
    payments.ts
    purchases.ts
    admin.ts

  services/
    product-service.ts
    payment-service.ts
    purchase-service.ts

  keyboards/
    user.ts
    admin.ts

  utils/
    auth.ts
    validation.ts

supabase/
  migrations/
    001_initial.sql

==================================================
9. PAYMENT FLOW
==================================================

Telegram Stars payment only.

Currency:
XTR

Use Telegram's Stars digital-goods payment flow.

When the user clicks Buy:

1. Load product from Supabase.
2. Verify active.
3. Use the server-side product price.
4. Create invoice.
5. Store enough information in the payload to safely resolve the product/payment context.

Do NOT trust user-provided price.

==================================================
10. PRE-CHECKOUT
==================================================

On pre_checkout_query:

Validate:
- currency is XTR
- product exists
- product is active
- payload is valid
- amount is exactly correct for the purchase context
- Telegram user matches the purchase context if encoded

If invalid:
reject checkout.

If valid:
answer pre-checkout successfully.

Respond within Telegram's required timeout.

==================================================
11. SUCCESSFUL PAYMENT
==================================================

On successful_payment:

Extract:
- Telegram user ID
- amount
- currency
- invoice payload
- telegram_payment_charge_id

Resolve product from server-side information.

Validate:
- currency == XTR
- amount is correct
- product exists
- product is/was valid for the transaction

IDEMPOTENCY IS MANDATORY.

telegram_charge_id has a UNIQUE database constraint.

Do not rely only on:

SELECT → INSERT

because concurrent duplicate updates can race.

Use the database uniqueness constraint and safely handle duplicate insert conflicts.

Process:

successful_payment
  ↓
resolve product
  ↓
try to insert payment
  ↓
if charge ID already exists:
    do not create another purchase
    do not double-deliver
  ↓
create purchase
  ↓
send file
  ↓
send confirmation

Payment processing must be safe if Telegram delivers the same update more than once.

==================================================
12. PURCHASES
==================================================

/purchases

Load purchases where:

telegram_user_id = current Telegram user ID

Never allow a user to access another user's purchases.

Selecting a purchase:
- verify ownership
- load product
- send current telegram_file_id

V1 behavior:
if admin replaces the file later, previous buyers receive the current file version.

Do not implement file versioning in V1.

==================================================
13. ADMIN STATE
==================================================

Admin workflows need temporary state:

Add file:
WAITING_FOR_FILE
WAITING_FOR_PRICE
WAITING_FOR_NAME
WAITING_FOR_DESCRIPTION

Edit workflows similarly.

Use grammY session/conversation support if it keeps the implementation clean.

Do not create a large state-management system.

Be aware that in-memory session state can be lost when Render restarts.
For V1, this is acceptable for an unfinished admin workflow.
Completed products must always be stored in PostgreSQL.

==================================================
14. SECURITY
==================================================

Mandatory:

- verify admin using Telegram numeric ID
- validate webhook secret
- server-side product lookup
- never trust callback prices
- never trust client product metadata
- validate Stars currency
- validate payment amount
- unique Telegram charge ID
- verify purchase ownership
- keep SUPABASE_SERVICE_ROLE_KEY server-side
- keep BOT_TOKEN server-side
- don't log secrets

Callback data must be parsed and validated.

Do not let a user invoke admin handlers merely by knowing callback_data.

Every admin callback must check ctx.from.id.

==================================================
15. ERROR HANDLING
==================================================

One malformed Telegram update must not crash the server.

Use structured try/catch around update processing.

Log useful server-side errors.

Do not expose:
- database errors
- stack traces
- secrets

to Telegram users.

For Telegram API failures during delivery:
log the failure and handle it gracefully.

Do not mark a payment as nonexistent simply because file delivery temporarily failed.

The payment record must remain authoritative.

==================================================
16. IMPORTANT PAYMENT/DATABASE CONSIDERATION
==================================================

Avoid marking a payment paid only after file delivery.

Correct order:

1. successful_payment received
2. validate payment
3. persist payment
4. persist purchase
5. attempt delivery

This ensures a temporary Telegram file-delivery failure does not lose the customer's purchase.

If delivery fails:
- purchase remains recorded
- log the error
- admin/user can retry with /purchases

==================================================
17. USER UI
==================================================

Keep messages clean.

Product list:

📦 Available Files

[Premium Pack — ⭐100]
[eFootball Script — ⭐50]

Product page:

📦 Premium Pack

Description...

⭐ 100 Stars

[⭐ Buy]
[⬅️ Back]

After payment:

✅ Payment successful!

📦 Premium Pack

Your file is below.

==================================================
18. ADMIN UI
==================================================

/admin

⚙️ Admin Panel

[➕ Add File]
[📦 Manage Files]
[📊 Sales]

Keep all navigation inline.

Avoid excessive commands.

==================================================
19. TESTING
==================================================

Do not claim tests passed unless actually executed.

At minimum verify:

1. Server starts.
2. /health works.
3. Webhook secret rejects invalid requests.
4. /start works.
5. Products list works.
6. Product details work.
7. Admin authorization works.
8. Non-admin cannot enter admin workflows.
9. Add file works.
10. Edit name works.
11. Edit description works.
12. Change price works.
13. Replace file works.
14. Disable/enable works.
15. Buyers list works.
16. Sales totals work.
17. Stars invoice is generated.
18. pre_checkout_query validates amount.
19. successful_payment records payment.
20. successful_payment records purchase.
21. duplicate charge ID does not duplicate purchase.
22. file delivery works.
23. /purchases works.
24. ownership check works.
25. Render production build works.

Use Telegram Stars test environment where applicable.

==================================================
20. IMPLEMENTATION ORDER
==================================================

Phase 1:
- package setup
- TypeScript
- config
- Supabase client
- SQL migration
- Render-compatible HTTP server
- /health

Phase 2:
- grammY
- webhook handling
- secret validation
- /start
- /shop
- product listing/details

Phase 3:
- Stars invoice
- pre_checkout
- successful_payment
- idempotency
- payment/purchase persistence
- file delivery

Phase 4:
- /purchases

Phase 5:
- /admin
- add file
- manage files
- edit
- replace
- enable/disable
- buyers
- sales

Phase 6:
- error handling
- validation
- tests
- production configuration
- README

==================================================
21. DELIVERABLE
==================================================

Implement the actual project, not merely an outline.

Before coding:
- inspect the existing repository
- preserve useful existing files
- avoid unnecessary rewrites

After implementation provide:

1. Files created/modified
2. SQL migration
3. Required environment variables
4. Local setup instructions
5. Supabase setup instructions
6. Render deployment instructions
7. Telegram bot/webhook setup instructions
8. Stars test instructions
9. Testing results
10. Known limitations

Do not add features outside this specification.

The priority is:
simplicity
correct Telegram Stars handling
reliable file delivery
secure admin authorization
payment idempotency
easy deployment on Render