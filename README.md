# Job Hunt Control Center

Standalone web dashboard (separate folder) that orchestrates:

- Lead fetching from `h1b-email-leadgen`
- Outreach sending from `Portfolio/scripts/outreach`
- Job tracker sync from `job-tracker/sync.py`
- Viewing fetched lead data (`combined-master.csv`)
- Editable filters for lead fetching (titles, countries, company include/exclude, and Apollo limits)
- Editable outreach compose settings (subject, email body template, and attachment paths)

## Project path

`/Users/anand/Desktop/job-hunt-control-center`

## Setup

1. Install dependencies:

```bash
cd /Users/anand/Desktop/job-hunt-control-center
npm install
```

2. Create local env file:

```bash
cp .env.example .env
```

3. Start:

```bash
npm start
```

4. Open:

`http://localhost:3100`

## Buttons in UI

- **Fetch Emails**: Runs broad pull script in leadgen project (`npm run leads:apollo-broad`).
- **Send Emails**: Runs outreach sender from Portfolio (`outreach:send`) and auto-submits confirmation phrase.
- **Save Outreach Compose**: Saves the subject/body/attachment settings used by `Send Emails`.
- **Run Job Tracker Sync**: Runs `job-tracker/sync.py` with Gmail source and writes tracker files.
- **Open Fetched Data**: Shows parsed rows from `h1b-email-leadgen/output/combined-master.csv`.
- **Save Filters**: Stores configurable lead filters in `filters.json` and reuses them for future fetches.

## Filter fields you can modify

- `titles`: comma-separated role keywords (example: `technical recruiter, engineering recruiter`)
- `countries`: comma-separated Apollo location filters (example: `United States, Canada`)
- `companyIncludeKeywords`: only keep results matching one of these company/domain keywords
- `companyExcludeKeywords`: remove results matching any of these company/domain keywords
- `maxResults`, `perPage`, `maxPages`, `delayMs`, `maxApolloMatches`: pull volume and quota controls

## Outreach fields you can modify

- `subject`: email subject line to send.
- `bodyTemplate`: plain-text email body template (supports placeholders such as `{{firstName}}`, `{{linkedinUrlForEmail}}`).
- `coverLetterPath`: optional one-file attachment path.
- `extraAttachments`: optional comma-separated absolute file paths for additional attachments.

## Notes

- This app is an orchestrator and intentionally reuses your existing scripts.
- For outreach send to work, keep SMTP and outreach config in `Portfolio/.env`.
- For job tracker sync, ensure `job-tracker/.venv` exists and Gmail credentials/token are configured.
- Lead filters are persisted in this project at `filters.json`.
- Outreach compose settings are persisted in this project at `outreach-compose.json`.
