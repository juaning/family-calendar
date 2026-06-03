"""
One-time Google OAuth consent flow.

Usage (from the backend/ directory with venv active):

    GOOGLE_CREDENTIALS_PATH=../secrets/credentials.json \\
    GOOGLE_TOKEN_PATH=../secrets/token.json \\
    python -m app.auth

The browser will open for consent. After granting access, token.json is written.
Copy token.json to the Pi's secrets/ directory via scp — never via git.
"""
from pathlib import Path
from google_auth_oauthlib.flow import InstalledAppFlow
import app.config as config


def main() -> None:
    cred_path = Path(config.GOOGLE_CREDENTIALS_PATH)
    if not cred_path.exists():
        print(f"ERROR: credentials.json not found at {config.GOOGLE_CREDENTIALS_PATH}")
        print("Download it from Google Cloud Console → APIs & Services → Credentials")
        raise SystemExit(1)

    flow = InstalledAppFlow.from_client_secrets_file(str(cred_path), config.GOOGLE_SCOPES)
    creds = flow.run_local_server(port=0)

    token_path = Path(config.GOOGLE_TOKEN_PATH)
    token_path.parent.mkdir(parents=True, exist_ok=True)
    token_path.write_text(creds.to_json())
    print(f"Token saved to {config.GOOGLE_TOKEN_PATH}")
    print("Copy this file to the Pi's secrets/ directory. Never commit it.")


if __name__ == "__main__":
    main()
