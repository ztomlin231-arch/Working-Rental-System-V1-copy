# High Adventure Rental Management Demo

Local-first rental management proof of concept for High Adventure Ski Shop. This app replaces the current paper-based seasonal ski rental form with a browser-based workflow that runs entirely on one computer using a local SQLite database.

## Chosen Stack

- Frontend: React + TypeScript + Vite
- Backend: Express + TypeScript
- Database: SQLite via `better-sqlite3`

Why this stack:

- Fast to run locally with very little setup
- Easy for a future developer to understand and extend
- Real relational storage now, with a clean path to swap SQLite for Postgres or another cloud database later
- Keeps the MVP practical without overengineering

## What The MVP Includes

- Dashboard with counts for active rentals, returned rentals, closed rentals, customers, and skiers
- Create and edit rental agreements
- Multiple skiers under one customer agreement
- Season/year tracking for each rental agreement
- One-click renewal flow that pre-fills customer and skier info from a prior year while leaving equipment blank
- Search by customer name, skier name, phone, or email
- Equipment serial number lookup and assignment history
- Agreement status tracking: active, returned, closed
- Customer history view showing prior seasons
- Delete-customer function for removing a customer and all related agreements
- Print-friendly agreement view
- Internal notes field
- CSV export of rental/customer/skier data
- Warning when a ski serial number is already assigned in another active rental

## Project Structure

```text
client/          React frontend
server/          Express API + SQLite setup
shared/          Shared TypeScript types
data/            Local SQLite database file
```

## Exact Commands To Install And Run

From the project folder:

```bash
cd "/Users/zacharytomlin/Documents/My CODEX"
npm install
npm run dev
```

Then open:

- App: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:3001/api/health](http://localhost:3001/api/health)

## Building For A More Production-Like Demo

If you want to verify the code compiles:

```bash
cd "/Users/zacharytomlin/Documents/My CODEX"
npm run build
```

## Notes On The Local Database

- SQLite database file: `data/rentals.db`
- This is local-only for demo purposes
- No cloud services or paid dependencies are required

## Future Upgrade Path

This proof of concept is intentionally structured so it can evolve later without a full rewrite:

- Replace SQLite with a cloud database such as Postgres
- Move the Express API behind hosted infrastructure
- Add employee authentication and permissions
- Add store/location fields for multi-store visibility
- Adapt the React UI for iPad/browser use across locations

The current data model already separates customers, rental agreements, and skier equipment assignments so the app is not boxed into a single-paper-form design forever.
