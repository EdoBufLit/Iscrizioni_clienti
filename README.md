# Association Self-Serve Member Signup & Portals

A minimal web application for association member signup, document upload, and member status verification.

## Features

- **Public Signup**: `/join/{org_slug}`
- **Document Upload**: ID and Fiscal Code (PDF/Image)
- **Member Portal**: Magic link login (no passwords)
- **Status Tracking**: Pending -> Active automation

## Setup

1. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Initialize Database**
   ```bash
   python create_tables.py
   python init_db.py
   ```

3. **Environment Variables**
   Create a `.env` file or export these variables:

   | Variable | Description | Default |
   |----------|-------------|---------|
   | `SECRET_KEY` | Secret for sessions and token hashing | `supersecretkey` |
   | `BASE_URL` | Public URL of the app (for emails) | `http://localhost:8000` |
   | `UPLOAD_DIR` | Directory for uploaded files | `data/uploads` |
   | `LOGIN_TOKEN_EXPIRE_MINUTES` | Login link validity | `15` |
   | `JOIN_TOKEN_EXPIRE_MINUTES` | Signup continue link validity | `120` |

4. **Run Application**
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

## Development

- **Database**: SQLite at `data/app.db`
- **Logs**: Output to stdout
