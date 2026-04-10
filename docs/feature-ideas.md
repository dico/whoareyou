# Feature Ideas

> Brainstormed ideas for future development. Not committed to — just a reference for when planning next work. Ordered roughly by estimated value vs. effort within each category.

## Memory & Documentation

### Milestones
Structured logging of "first time" moments for children: first word, first step, first tooth, first day of school. New timeline post type with icon + date + auto-calculated age from birth date. Renders as special pages in book generation.
- Reuses: post system (new `post_type` column), book templates, contact birth dates

### Family recipes
Recipe collection linked to contacts ("Grandma's meatballs"). Dedicated `recipes` table with ingredients, instructions, photos. Taggable with contacts. Shareable via portal.
- Reuses: contact system, portal infrastructure, media upload

### Year in Review
Auto-generated "2025 in pictures" — most liked posts, new contacts, milestones, gift stats, map of places visited. Rendered as a special book or interactive page.
- Reuses: all existing data sources, book generation engine

### Voice recordings / audio memories
Record grandparents' stories, children's first words. `post_media` already supports `audio/*` MIME types — needs a record button in UI and an audio player in the timeline. Relatively small effort.
- Reuses: post_media, upload pipeline

---

## Practical Family Management

### Important documents
Storage of passports, insurance, vaccination cards, birth certificates per contact. Dedicated tab on the contact profile. Encrypted storage (AES-256, same pattern as export).
- Reuses: file upload, contact profile tabs, export encryption

### Medical info
Allergies, blood type, GP, medication list per contact. New fields on contact or a dedicated `contact_medical` table. Visible to family members but NOT portal guests (visibility=family).
- Reuses: contact fields system, visibility model

### Shared lists
Shopping lists, packing lists, to-dos shared within the family. Simple `shared_lists` + `shared_list_items` tables. Visible in portal for collaboration with grandparents.
- Reuses: tenant scope, portal infrastructure

---

## Integrations

### Calendar sync (iCal feed) ⭐ low effort / high value
Export birthdays, reminders, and events as an iCal feed (`.ics`). Just a GET endpoint that generates iCal — no OAuth needed. Can also import from calendar.
- Reuses: contacts (birthdays), reminders, gift events

### Google Photos / iCloud import
Bulk-import photos with EXIF dates → automatic timeline posts. Google Photos has an OAuth API. Can reuse the MomentGarden import pattern (ZIP or API).
- Reuses: MomentGarden import flow, image processing pipeline

### Contact sync (vCard/CardDAV)
Export contacts as vCard for phone import. vCard export is simple; CardDAV server is larger scope.
- Reuses: contacts data

### Email notifications (daily digest) ⭐ low effort / high value
Daily email: "Today is Ola's birthday", "Reminder: dentist appointment". Notification generation exists, SMTP is configured — needs a cron job to send pending notifications.
- Reuses: notification module, SMTP service, cron pattern from export

---

## Social & Engagement

### Shared event albums
After a family dinner: share a link, everyone uploads photos to a shared timeline. Reuses portal share-links + portal post creation (already implemented). Needs an "album" wrapper around multiple posts.
- Reuses: portal share links, portal post creation

### Family calendar page ⭐ low effort / high value
Visual calendar with birthdays, events, reminders. Data already exists — needs a calendar page with month/week view. Could use a lightweight library (FullCalendar) or render manually.
- Reuses: contacts (birthdays), reminders, gift events, life events

### "Thinking of you" ping
One-click message to a contact: "Hey, thinking of you today". Sent via email or SMS (Twilio). Updates `last_contacted_at`. Extremely low friction for staying in touch.
- Reuses: SMTP, contact fields (email/phone)

---

## Analytics & Insights

### Contact engagement dashboard
"Who haven't you been in touch with lately?" sorted by `last_contacted_at`. Already possible with a simple query. Needs a page.
- Reuses: contacts.last_contacted_at

### Gift statistics ⭐ natural extension
"Spent 12,400 kr on Christmas gifts 2025", "Average per person: 890 kr", trend graphs. All data exists in `gift_orders`. New dashboard widget or tab on event page.
- Reuses: gift_orders, gift_events

### Relationship visualization
Interactive network graph (D3.js force graph) showing all contacts and their relationships. Family tree already exists — extends it to friends, colleagues, etc. Click → open profile.
- Reuses: relationships API, family tree data

### Photo statistics
"472 photos in 2025", "Most photographed person: Teo (189 photos)", photos per month. Simple aggregation of `post_media` + `post_contacts`.
- Reuses: post_media, post_contacts

---

## Portal & Sharing

### Wishlist sharing via portal
Already on the TODO list. Let portal guests browse wishlists for their accessible contacts.

### Portal push notifications
Push notifications to portal guests when new photos are posted. Web Push API (no app required). Grandparents get "New photo of Teo!" in their browser.
- Reuses: portal infrastructure, Web Push API

### Portal contributions
Let portal guests upload their own photos (partially implemented). Extend with a "Send a photo to the family" flow with simple UI.
- Reuses: portal post creation (already exists)

---

## Signage & Display

### "This day in history" ⭐ low effort / high engagement
Show posts from the same date in previous years. Nostalgia trigger. Can be shown on signage, in portal, or as a daily push notification.
- Reuses: posts table (simple date query)

### Digital photo frame mode
Dedicated fullscreen mode with transition effects, background music, and "this day last year" function. Runs on an old iPad or Raspberry Pi.
- Reuses: signage infrastructure, media serving

---

## Top 5 Recommendations (value vs. effort)

1. **Calendar sync (iCal feed)** — one endpoint, daily value for every user
2. **"This day in history"** — emotionally engaging, trivial query
3. **Family calendar page** — data exists, just needs a view
4. **Gift statistics** — natural extension of the gift module
5. **Daily birthday/reminder emails** — SMTP exists, cron pattern exists
