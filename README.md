# Stationery Stock Staff App

A lightweight mobile-friendly inventory web app for 9P and G9 stationery stock.

## What is already prepared

- Google Sheet backend: `Stationery Stock - Staff Web App Backend`
- Spreadsheet ID: `1fiqRuxUcOAX2vMyiQ-5Wu8MZvSyfM_7aok8wJlKEonQ`
- Existing 9P and G9 stock imported into the `Inventory` tab
- `Transactions` audit log for every staff update
- `Config` tab with low-stock threshold and alert email
- Vercel frontend + serverless proxy
- Apps Script backend source in `/apps-script`

Google Sheet:
https://docs.google.com/spreadsheets/d/1fiqRuxUcOAX2vMyiQ-5Wu8MZvSyfM_7aok8wJlKEonQ/edit

## Features

- View all current stationery stock
- Filter by 9P / G9
- Search items
- See low/out-of-stock items immediately
- Receive stock
- Issue/use stock
- Set exact quantity
- Update availability-only items
- Add a new stationery item
- Record staff name/email, time, before/after values and remarks
- Email alert when a numeric item crosses its minimum stock level

## One-time Google Apps Script setup

1. Open the Google Sheet.
2. Go to **Extensions → Apps Script**.
3. Replace `Code.gs` with the contents of `apps-script/Code.gs` from this repository.
4. If the manifest is shown, use the included `apps-script/appsscript.json` settings (Asia/Riyadh timezone, V8 runtime).
5. Run `setupApi()` once from the Apps Script editor and approve the requested Google permissions.
6. Copy the token returned by `setupApi()`.
7. Click **Deploy → New deployment → Web app**.
8. Set **Execute as: Me**.
9. Set access to **Anyone** so the Vercel server can call the endpoint. The endpoint itself remains protected by the secret token generated in step 5.
10. Deploy and copy the `/exec` Web App URL.

## Vercel setup

Import this GitHub repository into Vercel and add these two environment variables for Production and Preview:

- `APPS_SCRIPT_URL` = the Apps Script `/exec` URL
- `STOCK_API_TOKEN` = the token returned by `setupApi()`

Then deploy/redeploy the project.

The browser talks only to `/api/stock`. The API token is kept on the Vercel server and is never included in the frontend JavaScript.

## Google Sheet structure

### Inventory

`Airline | Item | Stock Value | Value Type | Remarks | Min Level | Last Updated | Active`

### Transactions

`Timestamp | Staff Name | Staff Email | Airline | Item | Action | Previous Value | Change / New Value | Resulting Value | Remarks`

### Config

- `APP_NAME`
- `DEFAULT_MIN_LEVEL`
- `ALERT_EMAIL`

The alert email is currently configured as `syedwaleedabbas@gmail.com` and can be changed directly in the Config tab.

## Notes

The original imported `9P` and `G9` tabs are preserved for reference. The web app reads and writes only the structured `Inventory`, `Transactions`, and `Config` tabs.
