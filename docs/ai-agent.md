# AI agent access

How an AI agent (e.g. Claude Code) reads and writes contact data in WhoareYou
on the user's behalf, using a short-lived API token. For the security model
see [security.md](security.md#api-tokens-ai-agents).

## Getting a token

The user creates it under **Innstillinger → AI-tilgang** (`/settings/ai-access`):

- **Name** — shown in the log (e.g. "Claude").
- **Access** — `write` (read + create/update) or `read`.
- **Lifetime** — 1 h, 4 h, 24 h or 7 days. Revocable at any time.

The plaintext token (`way_…`) is shown once. The user pastes it to the agent
together with the task. Send it as:

```
Authorization: Bearer way_…
Content-Type: application/json
```

Base URL: `https://<host>/api` (e.g. `http://whoareyou.local/api`).

## Rules for the agent

1. **Only touch what the task is about.** If asked to add workplaces from a
   LinkedIn screenshot for one person, read that person and the groups you
   need — nothing else. Don't browse other contacts, posts or data "for context".
2. **Read before writing** to avoid duplicates: look up the person, their
   existing jobs/addresses, and whether the group already exists.
3. **Verify after writing**: read the person again and confirm the result
   matches what you were given. Report what you added/changed.
4. **Ask instead of guessing** when the person or group is ambiguous (two
   matches, unclear dates).
5. **Only public / user-supplied information.** Don't infer or add sensitive
   details.
6. Dates you only know as month+year: use the first of the month
   (`2021-03-01`). Current position: no `end_date`.

Everything the token does is logged (`api_token.read` / `api_token.write` /
`api_token.denied` in `audit_log`) and visible to the user under
AI-tilgang → Logg.

## What a token can reach

| Area | Prefix |
|------|--------|
| Contacts and contact fields | `/api/contacts` |
| Groups / workplaces / schools / clubs | `/api/companies` |
| Addresses | `/api/addresses` |
| Relationships | `/api/relationships` |
| Life events | `/api/life-events` |
| Labels | `/api/labels` |

Never allowed: `DELETE`, merging (contacts/addresses), trash, duplicates tools,
label batch-remove, logo/photo uploads, and every other module (auth, export,
import, admin, posts, gifts, notifications, portal …). Sensitive contacts and
fields are always hidden. Policy: [api-token-policy.js](../backend/src/utils/api-token-policy.js).

## Recipe: workplaces from a LinkedIn screenshot

```bash
H='Authorization: Bearer way_…'; API=http://whoareyou.local/api

# 1. Find the person
curl -s -H "$H" "$API/contacts?search=Ola%20Nordmann&limit=5"
# 2. Read their current jobs (companies[] with link_id, company_uuid, title, start_date, end_date)
curl -s -H "$H" "$API/contacts/<contact_uuid>"
# 3. Find the workplace, or create it (type: company|school|club|team|association|class|other)
curl -s -H "$H" "$API/companies?search=FiiZK"
curl -s -H "$H" -H 'Content-Type: application/json' -X POST "$API/companies" \
  -d '{"name":"FiiZK","type":"company"}'
# 4. Link the person (end_date omitted = current position)
curl -s -H "$H" -H 'Content-Type: application/json' -X POST "$API/companies/<company_uuid>/employees" \
  -d '{"contact_uuid":"<contact_uuid>","title":"Automasjonsingeniør","start_date":"2021-03-01","end_date":"2026-10-01"}'
# 5. Fix an existing link
curl -s -H "$H" -H 'Content-Type: application/json' -X PUT "$API/companies/employees/<link_id>" \
  -d '{"end_date":"2026-10-01"}'
# 6. Verify
curl -s -H "$H" "$API/contacts/<contact_uuid>"
```

`POST /employees` returns 409 if the person already has a current link to the
group (or a past link with the same start date) — update that link instead.

Location lines from LinkedIn ("Trondheim og omegn") describe the job, not the
person's address — don't add them as addresses.

Other endpoints: see [api.md](api.md).
