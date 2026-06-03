# Google Calendar Setup

One-time steps to connect the calendar display to Google Calendar.
Run these on your **Mac**, then copy the resulting token to the Pi.

---

## Step 1 — Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a new project (e.g. "Family Calendar").
3. In the left menu go to **APIs & Services → Library**.
4. Search for **Google Calendar API** and click **Enable**.

---

## Step 2 — Create an OAuth client

1. Go to **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth client ID**.
3. Application type: **Desktop app**.
4. Name it anything (e.g. "Family Calendar Pi").
5. Click **Create**, then **Download JSON**.
6. Rename the downloaded file to `credentials.json` and place it in `secrets/`:

```bash
mv ~/Downloads/client_secret_*.json secrets/credentials.json
```

---

## Step 3 — Configure the consent screen (IMPORTANT — read this)

If your OAuth app stays in **"Testing"** status, refresh tokens for Calendar scopes
**silently expire after 7 days**, forcing constant re-authorisation. This will break
the Pi calendar within a week.

Fix:
1. Go to **APIs & Services → OAuth consent screen**.
2. Under **Publishing status**, click **Publish App** → confirm.
   (External + In Production is fine for a private personal app; Google does not review it.)
3. You may need to add your Google account as a test user first, then publish.

---

## Step 4 — Add family member calendars

Each family member should have their own Google Calendar (so events are colour-coded).

1. In [Google Calendar](https://calendar.google.com), create one calendar per person.
2. Give each calendar a distinct colour.
3. Share each calendar with the Google account you will use on the Pi
   (or use the same account for all).
4. The `/api/calendars` endpoint will list all calendars visible to that account.

---

## Step 5 — Run the one-time auth flow

Run from the `backend/` directory with the venv active:

```bash
cd family-calendar/backend
source venv/bin/activate
GOOGLE_CREDENTIALS_PATH=../secrets/credentials.json \
GOOGLE_TOKEN_PATH=../secrets/token.json \
python -m app.auth
```

Your browser will open. Sign in with the Google account that owns the calendars.
Grant the requested permissions.

After consent, `secrets/token.json` is written. Verify:

```bash
ls -la secrets/token.json   # should exist and be non-empty
```

---

## Step 6 — Verify locally

```bash
# In backend/ with venv active
GOOGLE_CREDENTIALS_PATH=../secrets/credentials.json \
GOOGLE_TOKEN_PATH=../secrets/token.json \
DB_PATH=app/data/calendar.db \
uvicorn app.main:app --reload
```

In a second terminal:
```bash
curl http://localhost:8000/api/calendars
# Should return a JSON array of your calendars with colours
```

---

## Step 7 — Copy secrets to the Pi

**Never commit `credentials.json` or `token.json` to git.**

Copy them to the Pi via scp:

```bash
scp secrets/credentials.json <USER>@<PI_IP>:~/family-calendar/secrets/
scp secrets/token.json        <USER>@<PI_IP>:~/family-calendar/secrets/
```

Replace `<USER>` with your Pi login username and `<PI_IP>` with the Pi's IP address.

The Pi's `docker-compose.yml` mounts `./secrets:/app/secrets:ro`, so the
container will find the files automatically.

---

## Token refresh

The app auto-refreshes the token on every API call if it is expired.
Because the consent screen is set to "In Production" (Step 3), the refresh
token never expires — no re-auth needed on the Pi.
