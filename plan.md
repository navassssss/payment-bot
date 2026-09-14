Grammar correction: **“Now give me the complete plan and a prompt to give my agent.”**

Below is the plan I would actually use. It deliberately keeps the system small: **Render runs the bot, Supabase stores the data, Telegram handles the UI/payment/files.**

# Starbot — Complete MVP Plan

## 1. Goal

Build a Telegram bot that sells digital files using **Telegram Stars**.

### User flow

```text
/start
   ↓
Show all available files
   ↓
User selects a file
   ↓
Show name + description + price
   ↓
[ ⭐ Buy ]
   ↓
Telegram Stars payment
   ↓
Payment confirmed
   ↓
Bot sends the purchased file
```

### Admin flow

The admin uses the same Telegram bot.

```text
/admin
   ↓
Admin menu
   ├── Add File
   ├── Manage Files
   └── Sales
```

Admin can:

* Add a file
* Set name
* Set description
* Set Stars price
* Replace/edit the file
* Change price
* Change name/description
* Enable/disable a file
* Delete a file
* See who purchased a file
* See total sales

No web admin panel.

No categories.

No customer accounts.

No login.

No coupons.

No referral system.

No separate file storage.

---

# 2. Architecture

```text
                       Telegram
                    ┌─────────────┐
                    │             │
                 USER           ADMIN
                    │             │
                    └──────┬──────┘
                           │
                           ▼
                 ┌─────────────────┐
                 │     Render      │
                 │ Node.js/TS Bot  │
                 │                 │
                 │ grammY          │
                 │ Bot logic       │
                 │ Admin logic     │
                 │ Payments        │
                 │ Delivery        │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │    Supabase     │
                 │   PostgreSQL    │
                 │                 │
                 │ products        │
                 │ payments        │
                 │ purchases       │
                 └─────────────────┘
```

### Render

Run a persistent Node.js service.

Responsibilities:

* Telegram bot
* Telegram updates/webhooks
* Product browsing
* Admin commands
* Telegram Stars invoices
* Payment verification
* File delivery
* Database access

### Supabase

Use only PostgreSQL initially.

Do **not** use:

* Supabase Auth
* Supabase Storage
* Edge Functions

The actual files remain on Telegram.

---

# 3. Technology stack

```text
Language:       TypeScript
Runtime:        Node.js
Bot framework:  grammY
Database:       Supabase PostgreSQL
ORM/query:      Supabase JS or postgres client
Hosting:        Render
Payments:       Telegram Stars (XTR)
File storage:   Telegram
Package manager:npm
```

Use strict TypeScript.

---

# 4. Repository structure

Keep it simple.

```text
starbot/
├── src/
│   ├── bot.ts
│   ├── config.ts
│   ├── db/
│   │   ├── client.ts
│   │   └── queries.ts
│   │
│   ├── handlers/
│   │   ├── start.ts
│   │   ├── products.ts
│   │   ├── payments.ts
│   │   └── admin.ts
│   │
│   ├── services/
│   │   ├── product-service.ts
│   │   ├── payment-service.ts
│   │   └── purchase-service.ts
│   │
│   ├── keyboards/
│   │   ├── user.ts
│   │   └── admin.ts
│   │
│   ├── types/
│   │   └── index.ts
│   │
│   └── utils/
│       ├── auth.ts
│       └── validation.ts
│
├── supabase/
│   └── migrations/
│       └── 001_initial.sql
│
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

Do not create a monorepo.

---

# 5. Database

Only three tables are needed.

## `products`

```sql
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_stars integer not null check (price_stars > 0),
  telegram_file_id text not null,
  file_name text,
  mime_type text,
  file_size bigint,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## `payments`

```sql
create table payments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  telegram_user_id bigint not null,
  telegram_charge_id text not null unique,
  amount_stars integer not null,
  created_at timestamptz not null default now()
);
```

## `purchases`

```sql
create table purchases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  payment_id uuid not null unique references payments(id) on delete restrict,
  telegram_user_id bigint not null,
  username text,
  first_name text,
  purchased_at timestamptz not null default now()
);
```

Add indexes:

```sql
create index idx_products_active
on products(active);

create index idx_purchases_product
on purchases(product_id);

create index idx_purchases_user
on purchases(telegram_user_id);

create index idx_payments_product
on payments(product_id);
```

### Why separate payments and purchases?

Because payment processing must be idempotent.

The Telegram charge ID should be unique.

If Telegram or the application processes an update twice:

```text
successful_payment
successful_payment
```

the second one must not create another purchase.

---

# 6. Admin authorization

One admin is enough for V1.

Environment variable:

```env
ADMIN_TELEGRAM_ID=123456789
```

Every admin operation checks the Telegram numeric user ID.

```ts
function isAdmin(userId: number): boolean {
  return userId === config.adminTelegramId;
}
```

Never authorize by username.

Usernames can change.

Don't expose the admin ID through public bot responses unnecessarily.

---

# 7. Environment variables

```env
BOT_TOKEN=
ADMIN_TELEGRAM_ID=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

NODE_ENV=production
```

The Supabase service-role key must exist **only on Render**, never in client-side code.

Since there is no frontend, this is straightforward.

---

# 8. User interface

Use Telegram inline keyboards.

### `/start`

```text
🛍 Welcome to Starbot

Choose a file below:
```

Then:

```text
📦 Available Files

[Premium Pack — ⭐100]
[eFootball Script — ⭐50]
[Course PDF — ⭐200]
```

Only `active = true` products are shown.

---

# 9. Product view

When a user selects a product:

```text
📦 Premium Pack

Description:
Premium resource pack...

⭐ Price: 100 Stars

[ ⭐ Buy ]
[ ⬅️ Back ]
```

The callback data should contain the product ID.

Example:

```text
product:<uuid>
buy:<uuid>
```

Validate everything server-side.

---

# 10. Payment implementation

Use Telegram's digital-goods payment flow with:

```text
currency = "XTR"
provider_token = ""
```

The invoice payload should contain a server-generated identifier, for example:

```text
order:<productId>:<nonce>
```

Better still, create an internal pending purchase/order identifier before sending the invoice if needed for robust reconciliation.

For this MVP, the critical principle is:

```text
Invoice created
     ↓
pre_checkout_query
     ↓
validate
     ↓
answer true
     ↓
successful_payment
     ↓
record payment
     ↓
record purchase
     ↓
send file
```

Never deliver the file based on the invoice being created.

Only deliver after `successful_payment`.

---

# 11. `pre_checkout_query` validation

When Telegram sends the pre-checkout query:

Verify:

```text
product exists
product is active
user is the expected user
currency = XTR
amount = product.price_stars
payload belongs to this product
```

If valid:

```text
answerPreCheckoutQuery(true)
```

Otherwise:

```text
answerPreCheckoutQuery(false, "This product is no longer available.")
```

---

# 12. Successful payment handling

On `successful_payment`:

Extract:

```text
telegram_user_id
currency
total_amount
invoice_payload
telegram_payment_charge_id
```

Then:

### Step 1

Resolve product from payload.

### Step 2

Validate:

```text
currency == XTR
amount == product.price_stars
```

### Step 3

Check whether `telegram_payment_charge_id` already exists.

If yes:

```text
do nothing
```

### Step 4

Insert payment.

### Step 5

Insert purchase.

### Step 6

Send the Telegram file using its `file_id`.

### Step 7

Send confirmation message.

---

# 13. File delivery

Admin sends the file directly to the bot.

Telegram gives something like:

```text
file_id
file_unique_id
file_name
mime_type
file_size
```

Store:

```text
telegram_file_id
file_name
mime_type
file_size
```

Then:

```ts
await ctx.api.sendDocument(
  ctx.from.id,
  product.telegram_file_id
);
```

Don't download and re-upload the file through your server.

---

# 14. Admin workflow

## `/admin`

Only admin can execute it.

Response:

```text
⚙️ Admin

[➕ Add File]
[📦 Manage Files]
[📊 Sales]
```

---

# 15. Add File state machine

```text
/admin
  ↓
Add File
  ↓
Bot: Send the file.
  ↓
Admin sends document
  ↓
Bot: Enter price in Stars.
  ↓
Admin: 100
  ↓
Bot: Enter product name.
  ↓
Admin: Premium Pack
  ↓
Bot: Enter description or /skip
  ↓
Admin: ...
  ↓
Create product
```

Then:

```text
✅ File created

Premium Pack
⭐ 100 Stars

[View]
```

The file's `file_id` is saved.

---

# 16. Admin state

Don't use a global in-memory map alone if possible.

For this tiny system, a short-lived in-memory state can work on a single Render instance, but it is fragile across restarts/deploys.

Better for reliability: encode the current step into the conversation context or store temporary state in a small `admin_sessions` table.

However, to stay minimal, start with grammY conversation/session state and document that it is ephemeral.

If the agent implements durable admin workflows, that's also fine, but don't overengineer it.

---

# 17. Manage Files

Admin chooses:

```text
📦 Manage Files
```

Show:

```text
📦 Files

[Premium Pack ⭐100]
[eFootball Script ⭐50]
[Course PDF ⭐200]
```

Selecting a product:

```text
📦 Premium Pack

⭐100
Status: Active

[✏️ Edit Name]
[📝 Edit Description]
[💰 Change Price]
[📎 Replace File]
[👥 Buyers]
[🔴 Disable]
[🗑 Delete]
[⬅️ Back]
```

---

# 18. Replace file

Admin:

```text
[📎 Replace File]
```

Bot:

```text
Send the new file.
```

Admin sends new file.

Update:

```text
telegram_file_id
file_name
mime_type
file_size
updated_at
```

Existing purchases should continue to reference the product.

Future re-downloads will receive the new version.

That is an important behavior decision.

If you want historical buyers to always receive the exact version they bought, we'd need a version table. **Don't add that in V1.**

---

# 19. Change price

Admin:

```text
Current price: ⭐100

Send new price:
```

Admin:

```text
150
```

Update:

```text
price_stars = 150
```

Existing purchases are unaffected.

---

# 20. Buyers

Admin chooses:

```text
👥 Buyers
```

Bot:

```text
👥 Premium Pack

Total buyers: 12

1. @john
   14 Sep 2026
   ⭐100

2. @mike
   13 Sep 2026
   ⭐100

3. No username
   12 Sep 2026
   ⭐100
```

For users without usernames, display their first name and optionally Telegram ID.

Use pagination later if necessary.

---

# 21. Sales

`📊 Sales`

Show:

```text
📊 Sales

Total purchases: 47
Total Stars: ⭐4,850

Today:
12 purchases
⭐1,200
```

This can be implemented using SQL aggregation.

No analytics framework is necessary.

---

# 22. Delete behavior

I recommend **soft deletion**, not physical deletion.

When admin presses delete:

```text
active = false
```

This keeps old purchase records valid.

Don't actually delete a product that has purchases.

Otherwise foreign keys and historical sales become messy.

So use:

```text
Disable
```

internally rather than destructive delete.

You can still expose:

```text
🗑 Delete
```

but implement it as deactivate/archive.

---

# 23. Commands

User:

```text
/start
/shop
/purchases
/help
/paysupport
/terms
```

Admin:

```text
/admin
```

Optionally:

```text
/add
```

as a shortcut.

Everything else should be buttons.

---

# 24. Purchased files

Add a simple:

```text
📦 My Purchases
```

The bot shows:

```text
Your purchases:

[Premium Pack]
[eFootball Script]
```

Selecting one:

```text
📦 Premium Pack

Purchased: 14 Sep 2026

[📎 Get File]
```

Before sending:

```text
check purchase exists for this user
```

Then send the current Telegram file.

This also lets users retrieve their purchase later.

---

# 25. Security requirements

These are mandatory.

### Telegram webhook security

If using webhooks, configure Telegram's secret token and validate:

```text
X-Telegram-Bot-Api-Secret-Token
```

### Admin security

Always verify:

```text
ctx.from.id === ADMIN_TELEGRAM_ID
```

### Payment security

Never trust:

```text
callback data
invoice amount from client
product name from client
```

Re-read the product from Supabase.

### Idempotency

Unique:

```text
telegram_charge_id
```

### Database

Use parameterized queries/Supabase APIs.

### Secrets

Never commit:

```text
BOT_TOKEN
SUPABASE_SERVICE_ROLE_KEY
```

### Logging

Never log the bot token, service-role key, or sensitive full payload unnecessarily.

---

# 26. Deployment on Render

Create a Render **Web Service**.

Build:

```bash
npm ci
npm run build
```

Start:

```bash
npm start
```

Example:

```json
{
  "scripts": {
    "dev": "tsx src/bot.ts",
    "build": "tsc",
    "start": "node dist/bot.js"
  }
}
```

Use a persistent bot process.

Use webhooks.

```text
Render
  ↓
grammY
  ↓
webhooks
  ↓
Telegram
```

This removes webhook configuration and makes local development easier.

Later, webhook deployment can be added.

---

# 27. Render considerations

The free Render service can sleep/restart depending on Render's current free-service rules.

For a bot, that means:

```text
free Render
↓
bot process stops
↓
bot unavailable until restarted/woken
```

Therefore this is suitable for an MVP/testing bot, but **not something I would represent as guaranteed 24/7 production infrastructure on the free tier**.

The architecture itself remains valid.

If the bot becomes commercially important, the first thing to upgrade is the always-on compute.

---

# 28. Supabase security model

Since the bot uses the service-role key from the server, the database can remain private.

There is no browser directly accessing Supabase.

```text
Telegram
   ↓
Render
   ↓
Supabase
```

That is substantially simpler than exposing Supabase directly to a frontend.

---

# 29. Testing plan

### Unit tests

Test:

```text
isAdmin()
payment amount validation
payload parsing
duplicate charge detection
product lookup
```

### Integration tests

Test:

```text
create product
list products
create purchase
duplicate payment
disable product
replace file
buyer list
```

### Telegram testing

Use Telegram's test environment for Stars before going live.

Test:

```text
Browse
Buy
Successful payment
Wrong price
Inactive product
Duplicate payment update
File delivery
Purchase retrieval
Admin authentication
```

---

# 30. Error handling

Never let one bad update crash the whole bot.

Wrap update processing:

```text
Telegram update
      ↓
try/catch
      ↓
log error
      ↓
bot continues running
```

For a failed payment-processing database operation:

```text
log full technical error server-side
send generic user-facing error
```

Don't expose SQL/database errors to customers.

---

# 31. Important edge cases

The agent should explicitly handle:

```text
Product deleted/disabled while user is viewing it
Price changed before payment
Duplicate successful_payment update
Unknown product ID
Invalid callback data
Admin sends wrong file type
Admin enters invalid Stars amount
Customer tries to access another user's purchase
Telegram API temporary failure
Supabase temporary failure
Render restart during admin workflow
```

---

# 32. V1 completion criteria

The project is finished when all of these work:

```text
✅ Admin can add a file
✅ Admin can set Stars price
✅ File is stored using Telegram file_id
✅ User sees all active files
✅ User can open a product
✅ User can pay with Telegram Stars
✅ Bot validates pre-checkout
✅ Bot handles successful payment
✅ Payment is recorded
✅ Duplicate payment cannot create duplicate purchase
✅ File is automatically delivered
✅ User can view past purchases
✅ User can receive purchased files again
✅ Admin can edit product
✅ Admin can replace file
✅ Admin can change price
✅ Admin can disable product
✅ Admin can see buyers
✅ Admin can see sales totals
✅ Non-admin cannot use admin functions
✅ Secrets are kept server-side
✅ Database schema is migrated
✅ Render deployment works
```

---

# Prompt for your coding agent

Give your agent the following prompt **as-is**:

```text
You are building a small production-minded Telegram digital-file store called "Starbot".

IMPORTANT:
Do NOT overengineer this project.
The goal is a very small MVP.

The entire customer UI and admin UI must be inside Telegram.
There is NO web admin panel.
There is NO React frontend.
There is NO categories system.
There is NO Supabase Auth.
There is NO customer account system.
There is NO referral system.
There are NO coupons.
There is NO separate file-storage service.

TECH STACK

- TypeScript
- Node.js
- grammY
- Supabase PostgreSQL
- Render Web Service
- Telegram Stars payments using currency XTR
- Telegram itself stores the actual files

ARCHITECTURE

Telegram user/admin
        ↓
Render Node.js bot
        ↓
Supabase PostgreSQL

The Render process is the only backend application.

Use Telegram file_id for files.
Do NOT download files to Render or upload them to Supabase Storage.

DATABASE

Create these three tables:

1. products

Fields:
- id UUID primary key
- name TEXT NOT NULL
- description TEXT nullable
- price_stars INTEGER NOT NULL
- telegram_file_id TEXT NOT NULL
- file_name TEXT nullable
- mime_type TEXT nullable
- file_size BIGINT nullable
- active BOOLEAN NOT NULL DEFAULT true
- created_at TIMESTAMPTZ
- updated_at TIMESTAMPTZ

2. payments

Fields:
- id UUID primary key
- product_id UUID foreign key -> products.id
- telegram_user_id BIGINT
- telegram_charge_id TEXT UNIQUE NOT NULL
- amount_stars INTEGER
- created_at TIMESTAMPTZ

3. purchases

Fields:
- id UUID primary key
- product_id UUID foreign key -> products.id
- payment_id UUID UNIQUE foreign key -> payments.id
- telegram_user_id BIGINT
- username TEXT nullable
- first_name TEXT nullable
- purchased_at TIMESTAMPTZ

Add indexes for active products, product purchases, user purchases, and product payments.

Use soft deletion/deactivation for products. Do not physically delete a product that may have historical purchases.

ENVIRONMENT VARIABLES

BOT_TOKEN
ADMIN_TELEGRAM_ID
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

Never expose the service role key to users and never commit secrets.

ADMIN

There is exactly one admin in V1.

Authorize admin functionality using the numeric Telegram user ID from ADMIN_TELEGRAM_ID.

Never authorize using username.

Every admin action must check ctx.from.id.

USER FLOW

/start
    ↓
Show all active products as inline buttons

Example:

📦 Available Files

[Premium Pack — ⭐100]
[eFootball Script — ⭐50]

When a product is selected:

📦 Premium Pack

Description here

⭐ Price: 100 Stars

[⭐ Buy]
[⬅️ Back]

Use callback_data such as:
product:<id>
buy:<id>

All callback data must be validated server-side.

PAYMENT FLOW

Use Telegram Stars.

Invoice:
- currency = XTR
- provider_token should follow Telegram's Stars requirements
- payload must securely identify the product/payment context

IMPORTANT:
Never deliver a file when the invoice is merely created.

Only deliver after Telegram sends successful_payment.

On pre_checkout_query:

1. Resolve the product from trusted database state.
2. Verify product exists.
3. Verify product is active.
4. Verify amount exactly matches product.price_stars.
5. Verify currency is XTR.
6. Verify payload is valid.
7. Reject invalid payments.
8. Answer the pre-checkout query within Telegram's required time.

On successful_payment:

1. Extract Telegram user ID.
2. Extract total amount.
3. Extract currency.
4. Extract invoice payload.
5. Extract telegram_payment_charge_id.
6. Resolve the product from the server-side payload.
7. Verify amount exactly matches the current expected product price for that payment context.
8. Check whether telegram_payment_charge_id already exists.
9. If it already exists, do not create another purchase or send the file again.
10. Insert the payment.
11. Insert the purchase.
12. Send the Telegram file using the stored telegram_file_id.
13. Send a success message.

Payment processing must be idempotent.

FILE DELIVERY

The admin sends the file directly to the Telegram bot.

The bot extracts:
- file_id
- file_unique_id if useful
- file_name
- mime_type
- file_size

Store the Telegram file_id in products.

When delivering:
sendDocument(userTelegramId, product.telegram_file_id)

Do not re-upload the file to Supabase or Render.

ADMIN UI

/admin

Show:

⚙️ Admin

[➕ Add File]
[📦 Manage Files]
[📊 Sales]

ADD FILE FLOW

Admin clicks Add File.

Bot:
"Send the file."

Admin sends a document.

Bot:
"Enter the price in Stars."

Admin sends e.g.:
100

Bot:
"Enter the product name."

Admin:
Premium Pack

Bot:
"Enter a description or /skip."

Admin:
Premium resource pack

Create the product.

Confirm:

✅ File created

📦 Premium Pack
⭐ 100 Stars

MANAGE FILES

Show all products.

Selecting one should show:

📦 Premium Pack
⭐100
Status: Active

[✏️ Edit Name]
[📝 Edit Description]
[💰 Change Price]
[📎 Replace File]
[👥 Buyers]
[🔴 Disable]

Optional:
[🟢 Enable]

EDIT NAME

Prompt for a new name and update the database.

EDIT DESCRIPTION

Prompt for a new description and update the database.

CHANGE PRICE

Prompt for a positive integer Stars value.

Validate input.

REPLACE FILE

Prompt admin for a new document.

Update:
- telegram_file_id
- file_name
- mime_type
- file_size
- updated_at

Do not affect historical purchases.

BUYERS

For a selected product, show who purchased it.

Display:
- username if available
- otherwise first_name and/or Telegram ID
- purchase date
- amount paid

Example:

👥 Buyers — Premium Pack

1. @john
   ⭐100
   14 Sep 2026

2. @mike
   ⭐100
   13 Sep 2026

Add pagination if the list becomes large.

SALES

Show simple totals:

Total purchases
Total Stars
Today's purchases
Today's Stars

Do this with PostgreSQL queries.
Do not create an analytics platform.

PURCHASES FOR USERS

Add:

📦 My Purchases

Show the products purchased by the current Telegram user.

When a purchase is selected:
- verify that the current Telegram user owns the purchase
- send the current product file

Do not allow one user to retrieve another user's purchases.

COMMANDS

User:
- /start
- /shop
- /purchases
- /help
- /terms
- /paysupport

Admin:
- /admin
- optionally /add as shortcut

Use inline keyboards for most navigation.

SECURITY

Implement all of the following:

- admin check by Telegram numeric user ID
- server-side validation of callback data
- server-side product lookup
- exact payment amount validation
- XTR currency validation
- duplicate payment protection using unique telegram_payment_charge_id
- never trust client-provided prices
- never trust client-provided product names
- never expose service-role key
- do not log secrets
- catch Telegram/database errors so one bad update does not crash the bot

DEPLOYMENT

Use Render Web Service.

Build:
npm ci
npm run build

Start:
npm start

Use webhooks because it is simpler.

The process should remain running and reconnect after Telegram/network errors.

PACKAGE SCRIPTS

Use scripts similar to:

"dev": "tsx src/bot.ts"
"build": "tsc"
"start": "node dist/bot.js"

PROJECT STRUCTURE

Keep the project simple:

src/
  bot.ts
  config.ts
  db/
    client.ts
    queries.ts
  handlers/
    start.ts
    products.ts
    payments.ts
    admin.ts
  services/
    product-service.ts
    payment-service.ts
    purchase-service.ts
  keyboards/
    user.ts
    admin.ts
  types/
    index.ts
  utils/
    auth.ts
    validation.ts

supabase/
  migrations/
    001_initial.sql

TESTING

At minimum test:

- admin authorization
- add product
- list products
- product details
- price validation
- pre-checkout validation
- successful payment handling
- duplicate successful_payment handling
- file delivery
- purchases
- replace file
- edit price
- disable product
- buyers list
- non-admin access rejection

DEVELOPMENT RULES

1. Keep the implementation small.
2. Do not add features not requested.
3. Do not create a frontend.
4. Do not create categories.
5. Do not create Supabase Auth.
6. Do not create Supabase Storage.
7. Do not create a complex API layer.
8. Do not create a microservice architecture.
9. Prefer straightforward TypeScript modules.
10. Keep database operations isolated in db/queries.ts or small services.
11. Use strict TypeScript.
12. Add comments only where they explain non-obvious security/payment behavior.
13. Handle Telegram payment idempotency carefully.
14. Do not assume payment success until successful_payment is received.

IMPLEMENTATION ORDER

Phase 1:
- initialize project
- TypeScript
- grammY
- Supabase client
- environment validation
- database migration

Phase 2:
- /start
- product listing
- product details
- navigation

Phase 3:
- Telegram Stars invoice
- pre_checkout_query
- successful_payment
- payment database records
- purchase records
- file delivery

Phase 4:
- /purchases
- repeat file delivery

Phase 5:
- /admin
- add file
- manage files
- edit file
- price changes
- replace file
- enable/disable
- buyers
- sales

Phase 6:
- error handling
- validation
- idempotency
- tests
- Render deployment
- README

IMPORTANT OUTPUT REQUIREMENT

Before writing implementation code:
1. Inspect the repository.
2. If a plan or existing code exists, preserve useful existing work.
3. Do not ask for approval for every small decision.
4. Make reasonable implementation decisions yourself.
5. Implement the MVP end-to-end.
6. At the end, provide:
   - files created/changed
   - database migration instructions
   - required environment variables
   - local run instructions
   - Render deployment instructions
   - Telegram bot setup instructions
   - test checklist
   - known limitations

Do not claim a feature is tested unless it was actually tested.
```

One correction to the earlier architecture is important: **for this tiny version, Render + Supabase is enough; Supabase Edge Functions are unnecessary.** Keeping one persistent bot process on Render makes the implementation substantially easier.

And I would **start with long webhooks**, 