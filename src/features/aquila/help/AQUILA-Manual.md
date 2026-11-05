# AQUILA: Competitor and Market Intelligence

Owner: Scenic Zest Tours (Paris guided tours)
Status date: 3 November 2026
Repository: GitHub, private, `ShabrezNoorani/AQUILA`
Live site: https://aquila-scenic-zest.netlify.app (sign-in required)

This document describes what AQUILA is, what it contains, how it works, how to run it, and how it will connect to AURELIA. Each section marks what is built, what is pending verification, and what is planned.

---

## 1. Purpose

AQUILA records what competing tour operators publish about their tours, dates those records, and lets the owner ask questions about the market. It answers questions such as:

- Which competitor tours use stronger demand signals, and what they do differently.
- Where a place is served by many operators, and where a gap may exist.
- Which tours fit a given requirement, such as the lowest cost and no ticket needed.

AQUILA does not publish anything, contact customers, change prices, or act on competitor sites. It is a private record and analysis tool for one owner.

---

## 2. Status

| Area | Status |
|---|---|
| Sign-in restricted to the owner | Built and tested |
| Listings, each with its company (ours marked OWN), with edit and delete | Built and tested |
| Companies page, and each company's listings, as Library (cards) or List (table), with tag filter | Built and tested |
| Snapshots (dated records of a listing), with edit and delete | Built and tested |
| Reviews on a listing, with add, edit and delete | Built and tested |
| Tags: any number per listing, of any kind (for example type, place, food) | Built and tested |
| Option rows with price per person, traveller count and price date | Built and tested |
| Assisted capture from a Viator page via a browser bookmark | Built and tested with saved sample pages |
| Atomic snapshot save (snapshot and options saved together or not at all) | Database function created; confirm the app calls it |
| Ask AI (Gemini) | Built; function deployed; end-to-end test pending |
| GetYourGuide and TripAdvisor as sources | Source names available; capture parser for GetYourGuide not built |
| Timing rules (days, start times, bookable, date ranges) | Database table created; screens not built |
| Booking requirements (tickets, card, pay later) | Not built |
| Capture queue and due list | Partly built; to be polished |
| Interface upgrade to AURELIA's palette and typography | Built and tested |
| Connection to AURELIA (menu link or merge) | Not started; needs owner approval |

---

## 3. Concepts

- **Listing.** One tour product on one website. Each listing belongs to a **company**, set in the one Company box. The **OWN** tick beside it marks the company as the owner's own (ticked = our own company, not ticked = competitor). A listing has a source (Viator, TripAdvisor, GetYourGuide, or manual), a link, and an active flag.
- **Company.** Who owns a tour. The Companies page shows every company; click one to see its listings as **Library** (cards with the title, company, OWN badge, price from the lowest option price, rating and review count, and tags) or **List** (a table). The chosen view is remembered in this browser.
- **Tags.** Every tag has a *kind* and a *name*, for example kind *type* with walking, boat or food, or kind *place* with Notre Dame, Ile de la Cite or Le Marais. The owner creates tags and can add new kinds at any time; nothing is hard-coded. A listing can have any number of tags of any kinds, or none, and mixing is allowed (for example Food + Walking + Interior). A tag with the same kind and the same name, ignoring capitals and extra spaces, is the same tag. Filters show one row per kind, and when several tags are selected a listing must have all of them.
- **Snapshot.** A dated record of a listing's details at one moment: title, duration, languages, group type, highlights, inclusions, exclusions, the overview, itinerary, rating, review count, and urgency text. Snapshots show change over time. The raw captured page is kept with each snapshot.
- **Option.** One bookable variant inside a snapshot, with its name, description, price per person, number of travellers the price is for, and the date the price applies to. Options are stored in their own table so they can be compared across snapshots.
- **Review.** A review held on a listing (not on a snapshot), with a star rating from 1 to 5, the review text, an optional date as shown, and a source. Reviewers' names are not stored.
- **Timing rule.** A record of when a tour runs: the days of the week, a start time, whether that time is bookable, and the date range the rule applies to. Used to show seasonal changes.
- **Suggestion.** A saved answer from Ask AI: the question, the tags used, the listings and snapshots it relied on, the model, and the answer.

---

## 4. How data gets into AQUILA

AQUILA never scrapes websites, never runs on a schedule against competitor sites, and never works around blocks, CAPTCHAs or access limits. Every capture is done by the owner, in the owner's own browser, on a page the owner is already viewing.

### 4.1 Assisted capture (main route)
1. In AQUILA, open a listing and choose **Import from page**.
2. Copy the bookmark code shown on that page, and save it in the browser as a bookmark named "AQUILA capture".
3. Open a product page on the competitor's site in the same browser.
4. Click the bookmark. It copies the page's address and HTML to the clipboard and does nothing else.
5. Return to AQUILA, paste into the box, and choose **Parse**.
6. Review the preview. The app shows what it found and what is missing. Correct anything by hand.
7. Save. The snapshot is stored with its options, its raw page, and its status.

Status rule: a capture is **complete** only if the title, duration, languages, rating and review count are present and at least one option has a price. Otherwise it is **partial**.

### 4.2 Manual entry
The same form is available for the owner's own products and for anything that cannot be captured. Option lines use the format `name | description | price`.

### 4.3 Reviews
Reviews are added by hand from the listing page: star rating, text, and optional date. The owner may choose which reviews to record, for example from a star filter on the competitor's page.

### 4.4 Limits of capture
- Prices shown on a product page depend on the date and group size selected at the time of capture. AQUILA records both.
- Some pages show only a "from" price until a date is chosen. Such options are recorded without a price, and the snapshot is partial.
- Booking requirements (tickets, payment method) are not yet captured automatically.

---

## 5. How Ask AI works

1. The owner opens **Ask AI**, optionally chooses tags (shown one row per kind), and types a question. With no tags, every listing is used; with tags, only listings that have all the chosen tags.
2. The page sends the question and tag identifiers to the `aquila-ask` Supabase Edge Function, with the owner's sign-in.
3. The function checks the caller is the owner. Anyone else receives a 403 response and no data.
4. The function reads the data using the owner's own sign-in, so the database's row-level security applies.
5. It assembles the data **grouped by company**, our own (OWN) company first, then competitors, then listings with no company: each listing with its company name, whether that company is OWN, all its tags with their kinds, its latest snapshot with options, price dates and traveller counts, its timing rules, and its reviews as star counts and text. Reviewers' names are never included.
6. It sends the question and this data to Google's Gemini model, using the model name `gemini-flash-lite-latest`, which is defined in one place in the code and can be changed there.
7. The model is instructed to cite listing names and capture dates, to say when data is missing, and not to guess.
8. The answer is returned with the list of listings and snapshots it used, and saved as a suggestion.

Reliability: answers are only as good as the captured data. Four or five examples do not describe a market. The owner should check the cited listings before acting on an answer, and should look at the number of listings used in each answer.

Data sent to Gemini: only the owner's public listing data and public review text. Private material (margins, internal pricing strategy, internal notes) is not stored in AQUILA and must not be added. If that ever changes, the Gemini account must move to a paid tier first.

---

## 6. Security and data handling

- **Who can use it.** One owner, identified by a Supabase user ID. The screen checks it, the Ask AI function checks it, and the database rules check it on every table.
- **Sign-in.** Email and password through Supabase Auth, the same system as AURELIA. Guests who have accounts in the same Supabase project are shown "Not authorized" and see no data.
- **Database rules.** Every AQUILA table is named with the prefix `mt_`. Row-level security is enabled on each one, the anonymous role has no access, and only the owner's user ID is allowed.
- **Keys and secrets.** The Gemini key is stored as a Supabase secret named `AQUILA_GEMINI_KEY`. It is not in the code, not in the browser, and not in the repository. AURELIA's own key is a separate secret and is not used by AQUILA.
- **Separation from AURELIA.** AQUILA creates and uses only `mt_` tables. It does not read, write, alter or drop any AURELIA table. The two apps share one Supabase project, and therefore one sign-in.
- **Repository.** The repository is private. Captured sample pages (fixtures) are kept out of Git by the ignore file, so they are never pushed.

---

## 7. Database

All tables are in the same Supabase project as AURELIA, and all are prefixed `mt_`.

| Table | Purpose |
|---|---|
| `mt_listings` | Each tour product: name, company (the company's OWN mark says if it is ours), source, link, active flag, and capture cadence in days |
| `mt_tags` | Every tag: kind (any text, for example type or place) and name. Names are unique per kind |
| `mt_listing_tags` | Which tags belong to which listing |
| `mt_snapshots` | Dated records of a listing's details, status, and raw page |
| `mt_snapshot_options` | One row per option per snapshot, with price per person, travellers, price date and sort order |
| `mt_reviews` | Reviews held on a listing |
| `mt_timing_rules` | Days, start time, bookable flag and date range for a listing's timings |
| `mt_suggestions` | Saved Ask AI questions and answers, with the tags, listings and snapshots used |

Database function: `mt_save_snapshot` saves a snapshot and its options in one transaction, so a failure never leaves a snapshot without its options.

---

## 8. Running and maintaining AQUILA

**Locally (development):**
- Install: `npm install`
- Start: `npm run dev`, then open http://localhost:5173
- Tests: `npm test`
- Build check: `npm run build`

**Live site:**
- Automatic builds from GitHub have been turned off to save build minutes. To publish, run `npx netlify-cli deploy --build --prod` from the project folder.
- Environment settings for the live site (the Supabase address, the publishable key and the Node version) are stored in Netlify.

**Ask AI function:**
- Deploy: `npx supabase functions deploy aquila-ask`
- Set the Gemini key: `npx supabase secrets set AQUILA_GEMINI_KEY=<key>` (never commit the key)
- Check the secrets: `npx supabase secrets list` (shows names only)

**Adding a new database change:**
- Write the SQL with the header line "This only creates mt_ objects and touches nothing else." Review it, run it in the Supabase SQL editor, then check Table Editor.

---

## 9. Roadmap (planned, not built)

1. **Booking requirements.** Capture tickets, payment method, pay-later, and cancellation terms, so the AI can rank tours by cost and by what is needed to book.
2. **GetYourGuide parser.** Build it from saved sample pages, in the same assisted way as Viator.
3. **TripAdvisor parser.** Same approach.
4. **Timing screens.** Enter days and start times by hand, and capture start times where the page shows them.
5. **Capture queue.** Show what is due and move through it quickly, for bulk capture.
6. **Standard questions.** Saved prompts such as urgency comparison, gap finder and lowest-cost-no-ticket.
7. **AURELIA connection.** Either a menu link opening AQUILA, or a later merge of the screens. Either needs the owner's approval and a separate plan.

---

## 10. Glossary

- **Assisted capture:** the owner clicks a bookmark on a page they are viewing, and the app reads that page's content.
- **Edge Function:** a small server program that runs on Supabase, here `aquila-ask`.
- **Row-level security (RLS):** database rules that decide which rows each user may read or change.
- **Snapshot:** a dated record of a listing.
- **Tag:** a label on a listing, with a kind and a name. For example, type tags say what kind of tour it is and place tags say where it runs; the owner can add other kinds.
- **Partial / complete:** the status given to a snapshot, based on whether its core fields and at least one priced option were found.

---

## 11. Frequently asked questions

**Does AQUILA scrape competitor websites?** No. Every capture is made by the owner in their own browser, on a page they are viewing, and is pasted in by hand.

**Does AQUILA train its own AI model?** No. It sends the owner's data with each question to Google's Gemini model and uses the answer. No model is trained.

**Can AQUILA change anything on a competitor's site?** No.

**Can a guest see the data?** No. Only the owner's sign-in is allowed by the screens, the function and the database rules.

**Is competitor data sent to Google?** Yes, when the owner asks a question: public listing data and public review text for the tags chosen. Private data is not stored in AQUILA.
