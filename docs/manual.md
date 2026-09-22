# Portal Manual

_Last updated: 2026-09-17._

This is the working guide for the Whitewater event portal: what each screen
is for, how an event moves from inquiry to event day, and what happens
automatically along the way in GoHighLevel (GHL) and PandaDoc. It is written
for the people who use the portal every day — event coordinators and
managers. Open it any time from the **?** button beside the theme switch.

---

## 1. Who does what

Three systems, three jobs:

| System | Job |
| --- | --- |
| **GoHighLevel** | The CRM. Contacts, opportunities, the Event Sales pipeline, and every email or text that goes to a client. |
| **This portal** | Where coordinators run the event: room calendar, checklists, schedules, contracts, uploads, and the client's own portal page. |
| **PandaDoc** | Proposals (sent from GHL) and contracts (sent from the portal), including signing. |

GHL is the system of record. The portal mirrors opportunity details and
writes coordinator actions back; when the two disagree, GHL wins on the next
sync. The portal moves opportunities through the pipeline as coordinators work —
linking a room, launching a portal, getting a contract signed — so the
pipeline in GHL reflects what actually happened.

| Person | Where they work | Access |
| --- | --- | --- |
| **Manager** | The portal — everything, including the Admin section, user management, reports, and dollar values | Portal login, Manager role |
| **Coordinator** | The portal — daily event work; no Admin section, no dollar values | Portal login (the default role) |
| **Client** | Their event portal page | A private link the coordinator sends; no login |
| **Sales** | GoHighLevel | GHL login |

Roles are set by a manager under Admin → Users.

---

## 2. How an event moves through the system

Each step says what a person does and what the systems do on their own in
response.

### Step 1 — Inquiry arrives

**You do:** nothing. The client fills out the inquiry form on the website.

**Automatically:**
- GHL creates the contact and an opportunity in the **New Inquiry** stage of
  the Event Sales pipeline.
- GHL tells the portal about the new opportunity, and the portal creates a
  **draft event** for it, filled in with the contact, group name, inquiry
  type, and date of interest. It appears under **Events** with a Draft
  badge and in the Linked Event list when reserving rooms.
- GHL's own follow-up ("chase") workflows start for that contact.

If an inquiry shows up in GHL but never appears as a draft event, use the
backfill list on the **New inquiry** page (see Step 1b).

### Step 1b — Phone inquiry, and the expedited fast track

**You do:** take an inquiry by phone (or any way other than the website
form) on **New inquiry**, linked from the Opportunities and Events page
headers. The form asks the same questions as the website form — caller,
company, group or event name, inquiry type, location, date of interest,
guests, activity interest, notes, and the yes/no questions — plus the event
coordinator and an **Expedited** box. Expedited starts ticked when the date
of interest is within 14 days and can be flipped either way; it needs an
email address (the portal link goes out by email) and a coordinator.

**Automatically, on save:**
- The GHL contact is created or matched by email/phone and tagged as a
  phone inquiry. If that contact already has an open opportunity in the
  pipeline, the save stops and offers a link to it instead of creating a
  second deal.
- A GHL opportunity is created in **New Inquiry** with the same details the
  web form would have filled, assigned to the coordinator.
- The draft event is created, and a note on the GHL contact records who
  took the call and what was said.
- **Expedited:** you land on the event page with the **Add room** window
  already open. Saving the hold moves the opportunity straight to
  **Planning** — New Inquiry and Contacted are skipped.
- Phone and expedited inquiries do **not** enter GHL's chase workflows.
  Whoever took the call owns the follow-up.

**Expedited everywhere else:** a red **Expedited** badge on the event page,
the Events list, the Opportunities card, and the dashboard's upcoming and
contract lists. The dashboard's contract rule tightens for them: an
expedited event is flagged only if the contract is unsigned inside three
days of the event, or unpaid inside one.

**Backfill:** the bottom of the New inquiry page lists open opportunities
that have no portal event yet — entered straight into GHL, or a website
inquiry the portal never heard about. **Create draft event** does exactly
what Step 1 would have done.

### Step 2 — Proposal (PandaDoc, via GHL)

**You do:** sales builds and sends the proposal from PandaDoc inside GHL.

**Automatically:** the proposal link lands on the opportunity's **Proposal
Link** field, and the portal shows it on the event page and in the client's
"Documents and payment" section the next time the event is opened. Blank
the field in GHL and it disappears in the portal.

### Step 3 — Rooms are reserved

**You do:** open **Room Calendar**, create a reservation, and in the window:
- pick the room(s), date, and times (the date fills in from the
  opportunity's date of interest);
- choose the portal event in **Linked Event**;
- pick the **Event Coordinator** (the list shows GHL staff coordinators only).

**Automatically:**
- Linking a reservation to an event moves the GHL opportunity to
  **Planning**. GHL's internal tasks and notifications key off this stage.
- Picking a coordinator assigns them to the opportunity in GHL, and they
  become the event's **Coordinator** in the portal.
- Reservations start as **held** (faded and dashed on the calendar). Flip
  them to **booked** from the event page's Room bookings section, or let a
  signed contract do it (Step 4b).

### Step 4 — Event prep in the portal

**You do:** work the event from its page under **Events**:

- **Event summary** — arrival time, meeting location, guest count, activity
  passes, parking passes, storage bins. Managers also see and edit the
  event's Value. The **Coordinator** can be reassigned here at any time.
- **Primary contact and conversations** — the top of the Event facilitator
  card shows the person who inquired (name, email, phone, refreshed from GHL
  each time the page opens). The speech-bubble button opens a drawer with
  their full GHL email and text history and a reply box. Replies go out
  **through GHL**, so they land in the same conversation thread the sales
  team sees. Notes:
  - When the client replies to one of your emails, their reply shows up here
    as its own message (reopen the drawer to refresh). Only what they typed
    is shown — the quoted copy of your email underneath is left out.
  - The Email/SMS picker starts on whichever channel the contact last used
    to reach us. A channel the contact has marked Do Not Disturb (or texted
    STOP to) is removed from the picker with a note saying why.
  - **Insert snippet** drops one of GHL's saved snippets into the message
    as editable text, with the merge tags already filled in. "Refresh from
    GHL" inside the menu picks up snippets you just edited in GHL. Tags you
    can use when writing a snippet in GHL:

    | Tag | Fills in with |
    | --- | --- |
    | `{{contact.first_name}}`, `{{contact.last_name}}`, `{{contact.name}}`, `{{contact.email}}`, `{{contact.phone}}`, `{{contact.company_name}}` | The contact |
    | `{{opportunity.assigned_to}}` | The coordinator assigned to the event |
    | `{{user.first_name}}`, `{{user.last_name}}`, `{{user.name}}`, `{{user.email}}` | You, the person sending. If your portal login doesn't match a GHL user, the event's coordinator is used instead |
    | `{{opportunity.groupevent_name}}` | The event name |
    | `{{opportunity.event_date}}` | The event date, written out (November 20, 2026) |
    | `{{opportunity.portal_link}}` | The client's portal link (only once the portal has been launched) |

    If a tag can't be filled in (no coordinator assigned yet, portal not
    launched, or a tag the portal doesn't know) it stays in the message as
    `{{…}}` and an amber warning lists it under the message box. Replace it
    with the real text before sending, or it reaches the client as a blank.
  - The notepad button (red badge = note count) opens the contact's **GHL
    notes**; notes you add there save to GHL under your name.
  - The tasks button (badge = open tasks) opens the contact's **GHL
    tasks**: create tasks with a due date and assignee, and check them off,
    exactly as in GHL.
- **Pause follow-ups** — GHL's chase workflows keep nudging a contact who
  has gone quiet, but a phone call never reaches GHL, so the nudges would
  keep going. The pause button (on each Opportunities card, in the
  conversations drawer, and on the event page's contact card) stops them:
  it tags the contact in GHL, leaves a note with who paused and why, and
  shows an amber **Paused** badge with a Resume link. The contact keeps
  their place in the cadence and skips messages until resumed. A pause
  never expires on its own — it ends when someone resumes it, when a
  contract is signed, or when GHL shows the deal Booked or Lost. One pause
  covers every open opportunity that person has. The dashboard's **Paused
  follow-ups** section lists anyone paused longer than 14 days.
- **Event facilitator** — the client's on-site contact when someone other
  than the inquiry contact runs the event day (common for large corporate
  events). Tick **"Same as the event's current contact"** when there isn't
  a separate person. Saving pushes the details to GHL so staff can message
  the facilitator from Conversations. Clients can submit this from their
  portal too; those arrive flagged **needs review**.
- **Checklist** — apply a checklist template, then tailor items per event
  (client-visible vs internal, required vs optional). The default template
  includes a "Provide your event facilitator's contact info" section —
  delete it when there's no separate facilitator.
- **Schedule & Notes** — build the event-day schedule from the whitewater
  day template. Text fields accept merge tags that fill in per event.
- **Room bookings** — confirm held rooms as booked.

**Automatically:**
- Opening the event page refreshes it from GHL first (name, type, date of
  interest, contact, coordinator, proposal link, guest counts, value).
- Saving the Event summary writes guest count, pass and bin counts, and
  Value back to the GHL opportunity.
- Reassigning the coordinator updates the opportunity's assigned user in GHL.

### Step 4b — Contract (PandaDoc, from the portal)

**You do:** on the event's **Contracts** tab, click **New contract**, name it
(initial agreement, an event-order change, a 50% deposit — as many per
event as needed), pick a PandaDoc template, write any description or terms,
add the **items and prices** it covers (below), confirm the recipient
(prefilled from the GHL contact), and click **Create and send**. The client
signs it inside their portal (Step 6). Nothing goes through GHL.

**Items and prices.** Once you pick a template, the form shows the same
tables the template has in PandaDoc, under the same headings — for example
**Item**, **Rentals**, and **Food & Beverage Items**. Put each item in the
table it belongs in, exactly as you would in PandaDoc: the table decides
the taxes and fees. Food and drink go under **Food & Beverage Items**, which
is where PandaDoc adds the catering service fee and the food and beverage
tax; the form warns you if a catering item ends up in another table.

- **Add from catalog** opens the PandaDoc catalog (passes, venues, parking,
  catering, and the rest). Search or pick a category, click **Add**, then
  set the quantity on the row. The name and price come from PandaDoc and
  can't be changed here — managers set prices in PandaDoc's catalog, and a
  price changed there shows up here within a few minutes.
- **Add custom row** is for anything that isn't in the catalog (a waived
  fee, an outside-food charge). You type the name and the price.
- The **sub-heading** box above a table's rows is for the event day, the
  way the table used to be retitled in PandaDoc ("Friday, November 20th -
  9:45am arrival"). A new contract starts with the event's date filled in;
  clear it if you don't want it. For a multi-day event, click **Add another
  group** and give each day its own sub-heading.
- Templates with a **checklist of options** (the education programs on the
  EA Group templates: "Choose One (1) of the Options Below") show the
  options as checkboxes. Tick the one the group chose before you send, so
  the contract arrives with the choice already made.
- Rows a template already contains (a cleaning fee, a nights-stay line)
  appear as custom rows you can edit or remove.
- The form shows a **subtotal** only. PandaDoc works out the taxes and
  fees, and the full total appears on the contract once it's created.

**Automatically:**
- The portal builds the PandaDoc document from the template: your line
  items become its pricing table and the event, contact, and coordinator
  details fill its fields. The document is sent silently — PandaDoc only
  emails the client if you tick "also email from PandaDoc".
- Every contract stays on the event: name, terms, items, status, PandaDoc
  link, signed date. The Event summary lists them with a status pill and two
  links: **View in PandaDoc** (staff, needs your PandaDoc login) and
  **Customer View**, the customer's own public PandaDoc link — no login
  needed. Clicking it **copies** the link (you'll see "Copied!") instead of
  opening it, so you can paste it to the customer without your own visit
  showing up as theirs. It appears once PandaDoc has
  sent the contract (not for drafts or ones awaiting approval). The
  Contracts tab shows the full history, totals, **Refresh status**, **Open
  in PandaDoc**, and the archived **Signed PDF** once executed.
- **When the client signs:** every held room on the event flips to
  **booked**, the GHL opportunity moves to **Booked**, and the signed PDF is
  archived. This happens the moment they finish signing in the portal, or
  on the next refresh of the event page.
- **Editing before signature:** an unsigned contract (Awaiting PandaDoc
  approval, Awaiting signature, Viewed by customer, or a Draft left by a
  failed send) has an **Edit** button. The same form opens prefilled;
  saving updates the PandaDoc document and re-sends it. The client's earlier
  signing link stops working and their portal shows the revised contract.
  Template and recipient can't change — send to someone else with a new
  contract. Signed contracts can't be edited: changes after signing are a
  new contract (order change, final payment).
- **Approval workflow:** if the template has an approval step in PandaDoc,
  the portal shows **Awaiting PandaDoc approval** and the client sees
  *Being finalized* with no sign button. Once someone approves it in
  PandaDoc, the portal sends it to the client on the next refresh.
- **Event value = contracts combined.** After every contract is created,
  edited, or changes status, the event's **Value** becomes the sum of its
  live contracts (declined, voided, and failed ones don't count) and is
  written to the GHL opportunity. Until the first contract exists, the
  manually entered value stands.
- **Payments:** the standard templates have a payment step after signing.
  The portal treats a signed-but-unpaid contract as **Signed** (rooms
  booked, opportunity Booked, PDF archived) because the signature is what
  commits the event; the card notes that payment is pending in PandaDoc.
- Failed sends stay listed as *Failed* with PandaDoc's message so the
  template or setup can be fixed and the send retried. Only failed
  contracts can be removed.

### Step 5 — Portal launch

**You do:** when the checklist and schedule are client-ready, use the
launch action at the bottom of the event page and tick the confirmation.

**Automatically:**
- The portal generates the client's private portal link and records the
  launch time.
- The link is written to the opportunity's **Portal Link** field in GHL.
- **The portal does not email the client.** GHL workflows send the link by
  email or text using that field — client messaging stays in GHL.

### Step 6 — The client works their portal

**The client** opens their link (no login) and can:
- see the event summary, arrival details, and their coordinator's contact info;
- complete checklist items;
- upload files (insurance, logos, rosters — stored privately);
- submit vendors;
- submit or update their **event facilitator's** contact info;
- **review and sign contracts** — each contract shows its items and total
  with a *Review and sign* button that opens PandaDoc's signer right in the
  portal, no email or PandaDoc account needed. When they finish, the portal
  confirms it immediately (rooms booked, opportunity Booked, PDF archived)
  and shows the contract as **Signed**;
- open proposal, contract, invoice, and payment links ("Documents and
  payment");
- view the event-day schedule.

**Automatically:** client submissions (checklist completions, uploads,
vendors, facilitator details) are flagged **needs review** and surface on
the dashboard's work queue and the event page. Portal views are counted.

### Step 7 — Review and event day

**You do:** clear the review queue (mark uploads, vendors, and checklist
items reviewed), keep the schedule current, and run the event. Reviewing is
portal-only — nothing syncs to GHL or notifies the client.

### Step 8 — After the event

- Won business lives in **Opportunities → Won**: every won opportunity as a
  contact list, filterable by when the event happened — the starting point
  for rebooking outreach.
- Past events stay in **Events** under its past filter.

### Deleting an event (managers only)

Deleting from the event page removes the event and everything attached
(checklist, vendors, uploads, schedule, linked reservations), clears the
opportunity's Event Planning App ID and Portal Link fields in GHL so the
inquiry flow can run again, and disables the client's portal link. The GHL
contact and opportunity are otherwise untouched.

---

## 3. Screen guide

### Coordinator side

| Screen | What it's for |
| --- | --- |
| **Dashboard** | Metric tiles, then: **Vendor submissions** awaiting approval; **Upcoming events** split into today and the next seven days; **Contracts** with recently signed ones and a red **Needs attention** list — launched events within three weeks with no signed contract and, inside two weeks, signed-but-unpaid ones; **Paused follow-ups** older than 14 days. |
| **Events** | All portal events with status filters (Draft, launched, past). Open one to work it. |
| **New inquiry** | Phone intake form (creates the GHL contact and opportunity, then the draft event; Expedited opens the room-hold window) and the backfill list of GHL opportunities without a portal event. |
| **Event page** | Summary (with the contracts list), coordinator, primary contact with the conversations, notes, and tasks buttons and the follow-ups pause switch, facilitator, room bookings, launch, review queues. |
| **— Contracts** | PandaDoc contracts for the event: create, edit unsigned ones, history with status and totals, signed PDF, refresh status. |
| **— Checklist** | The event's checklist. |
| **— Schedule & Notes** | Event-day schedule grid and sectioned notes. |
| **Room Calendar** | The reservation board; where events get rooms and coordinators. |
| **Coordinator Assignments** | Month calendar of every coordinator's events, colored by coordinator. Click a chip to see every room booked that day with times and held/booked status, and an **Open event** link. The legend chips filter by coordinator and show that month's workload. A **Columns** toggle shows the original one-column-per-coordinator view with a date range. |
| **Opportunities** | The GHL pipeline, one stage at a time: stage tabs with counts above that stage's cards, a search box that filters by name, contact, email, phone, or coordinator (the tabs switch to per-stage match counts while you type), and a **stage guide** explaining what has happened and what to do next. Each card has the conversations, notes, and tasks buttons and the pause switch. The **Won** tab is the contact list for rebooking. |
| **Companies** | Company directory from the Salesforce archive: contacts, booking history, live booking stats. Past events list their PandaDoc documents (contract, additions, final payment) with each one's status; click one to open it in PandaDoc, where you need to be signed in. Dollar values are manager-only. |
| **Settings** | Checklist and schedule templates that new events start from. Changes never touch events already set up. |
| **Manual** | This guide. Opens in a new tab from the **?** beside the theme switch. |

### Admin section (managers only)

| Screen | What it's for |
| --- | --- |
| **Users** | Create and remove portal users, set roles, send password resets. |
| **Reports** | Timeframe-filtered event stats and charts, plus booked business from the Salesforce archive. No menu entry — direct link only. |
| **Integration Logs** | Every exchange between the portal, GHL, and PandaDoc, success or failure. The first stop when "something didn't sync." |
| **SF Migration** | Review Salesforce contacts staged for the move to GHL: pull, search, spot duplicates, approve or exclude. |

### Client side (no login)

| Screen | What it's for |
| --- | --- |
| **Portal overview** | Summary, arrival details, checklist, contracts with in-portal signing, documents and payment, facilitator, vendors, uploads, coordinator contact. |
| **Event schedule** | The event-day schedule and notes. |

---

## 4. Contracts and PandaDoc

**Proposals** come from GHL's PandaDoc integration and are read-only in the
portal (Step 2). **Contracts** are sent from the portal and signed in the
client's portal (Steps 4b and 6).

### Setting up a contract template in PandaDoc

Whitewater's existing templates (EA Group, Group with Catering, Final
Payment, the wedding ones) work as they are. If you build a new one:

- Give it one recipient role for the client (a role named Client, Customer,
  or Signer is picked automatically; otherwise the first role). The
  portal assigns the client to that role, and PandaDoc gives them every
  signature field.
- Include a **pricing table** with a visible Price column for the items.
  Use one table per tax treatment — for example one for untaxed items and
  one for food and beverage — and set that table's taxes and fees in the
  template. The portal shows each table under the heading you give its
  first column ("Item", "Food & Beverage Items"), so make the headings
  say what belongs there. The heading itself can't be changed from the
  portal; the event day goes in a sub-heading instead.
- A table with hidden Price and QTY columns and **optional** rows becomes a
  checklist of options in the portal.
- Add whichever fields you want filled automatically: the event name, type,
  date, arrival time, meeting location, attendee and pass counts; the
  contact's, coordinator's, and facilitator's name, email, and phone; and the
  contract's name, description, and subtotal. Templates built for the old
  Salesforce integration (Client first/last name, email, phone, Account
  Name, Date) are filled too.
- If the template has an **approval workflow**, contracts pause at
  *Awaiting PandaDoc approval* until someone approves them in PandaDoc.
- If the template has a **payment step**, clients are asked to pay right
  after signing. The portal counts the signature as the commitment; turn
  the payment step off if clients should pay some other way.

### Day to day

- **Refresh status** on the Contracts tab re-reads the document from
  PandaDoc; the event page does the same each time it opens.
- **Open in PandaDoc** / **View in PandaDoc** goes to the document for
  staff. **Customer View** on the Event summary is the customer's personal
  PandaDoc link: whoever opens it *is* the customer as far as PandaDoc is
  concerned — it marks the contract viewed and the page can sign it. That
  is why it copies rather than opens; only send it to the customer.
- A contract can only be signed while it is sent or viewed — not while it
  is a draft or awaiting approval.
- **Payment status** on the event still comes from GHL; PandaDoc payments
  are not tracked in the portal.

---

## 5. When something looks wrong

| What you see | What to check |
| --- | --- |
| A website inquiry is in GHL but not under Events | New inquiry → the backfill list at the bottom. **Create draft event** does what the automation should have. To see why it was missed, check Admin → Integration Logs: a "rejected" inquiry webhook row means the automation reached the portal but was turned away; no row at all means the GHL automation never sent it. |
| The event page shows old details | It refreshes from GHL on every open. If it still disagrees with GHL, check Admin → Integration Logs for a failed sync. |
| Coordinator lists are empty or read-only | The portal can't reach GHL right now. Tell a manager; the connection needs attention. |
| A reply from the conversations drawer won't send | The message explains why — a Do Not Disturb channel, or a GHL permission a manager needs to grant. |
| A contract failed to send | The card shows PandaDoc's message. Usually a template problem (a missing pricing table, a recipient role that doesn't match). Fix the template, delete the failed contract, and send again. |
| Saving a contract says an item is no longer in the PandaDoc catalog | Someone removed or replaced that item in PandaDoc. Remove the row and add the current item from the catalog, or add it as a custom row. |
| The catalog or the template's tables won't load in the contract form | The portal can't reach PandaDoc right now. Custom rows still work; try again in a minute, and tell a manager if it persists. |
| The client says their signing link stopped working | The contract was edited after it was sent. Their portal shows the revised one. |
| Follow-up messages still going to someone who called | Use the pause switch on their Opportunities card or event page. |
