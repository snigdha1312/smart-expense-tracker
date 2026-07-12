# Smart Expense Tracker

A full-stack, enterprise-grade personal finance application designed to help users track transactions, manage categories, define monthly budgets, upload and parse receipts automatically, download monthly PDF statements, and receive AI-powered spending insights.

## Feature Highlights

- **Interactive Analytics Dashboard**: Beautiful visual analytics using Recharts including category distributions (Pie Chart), 6-month historical spending trends (Line Chart), and budget-vs-actual targets (Bar Chart).
- **Defensive CSV Statement Import**: Parse bank statements with error tracking per line, automatic data formatting (handles dollar signs, varying dates, and spacing), and duplicate confirmation checks.
- **Asynchronous Receipt OCR Processing**: Upload receipts (png/jpg) to trigger Celery tasks using Tesseract OCR to parse merchants, amounts, and dates automatically.
- **AI Financial Insights**: Deep financial spending reviews powered by Gemini LLM or smart local heuristics (fallback), complete with a 1-hour rate limit cooldown.
- **Monthly PDF PDF Statement Compilation**: Automatically compiles monthly spending PDFs (using WeasyPrint and custom HTML styling) downloadable securely via JWT authenticated headers.

---

## Architecture Diagram

```
       ┌────────────────────────┐
       │      Web Browser       │
       │    (React / Vite)      │
       └───────────┬────────────┘
                   │
                   │ HTTP / API (Nginx Port 80)
                   ▼
       ┌────────────────────────┐
       │   Nginx Reverse Proxy  │
       │  (Routes Static / API) │
       └─────┬────────────┬─────┘
             │            │
  /static/   │            │ /api/
  /media/    ▼            ▼
 ┌───────────┴─┐   ┌──────┴──────────────┐
 │Shared Static│   │ Django API Server   │
 │   Volume    │   │     (Gunicorn)      │
 └─────────────┘   └──────┬──────┬───────┘
                          │      │
      Postgres Queries    │      │ Celery Tasks
                          ▼      ▼
                ┌─────────┴┐  ┌──┴───────────────────┐
                │PostgreSQL│  │  Redis Broker        │
                │ Database │  │  (Celery / Queue)    │
                └──────────┘  └──┬───────────────────┘
                                 │
                                 ▼
                      ┌──────────┴───────────┐
                      │    Celery Worker     │
                      │  (OCR / AI / PDFs)   │
                      └──────────────────────┘
```

---

## Local Setup Instructions

### Prerequisites
- Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) on your machine.

### Getting Started

1. **Clone the repository** and navigate to the project directory.
2. **Set up Environment Variables**:
   Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
   Open the `.env` file and configure the settings (including your `GEMINI_API_KEY` for AI insights).

3. **Spin up the stack**:
   ```bash
   docker compose up --build -d
   ```
   This command automatically builds the multi-stage frontend Nginx server, compiles Django static assets, runs database migrations, and boots up all worker queues.

4. **Access the application**:
   - Web application: http://localhost
   - API endpoints: http://localhost/api/
   - Django Admin: http://localhost/admin/

---

## API Endpoint Reference

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/auth/register/` | Register a new user account | No |
| **POST** | `/api/auth/login/` | Log in and get JWT token pair | No |
| **POST** | `/api/auth/refresh/` | Refresh expired access tokens | No |
| **GET** | `/api/auth/me/` | Fetch current user details | Yes |
| **GET/POST** | `/api/categories/` | List or create custom categories | Yes |
| **GET/POST** | `/api/transactions/` | List, filter, or create transactions | Yes |
| **POST** | `/api/transactions/import-preview/` | Dry-run and parse bank CSV statements | Yes |
| **POST** | `/api/transactions/import-confirm/` | Confirm and import selected CSV rows | Yes |
| **GET** | `/api/transactions/export/` | Download CSV of filtered transactions | Yes |
| **GET** | `/api/budgets/summary/` | Fetch monthly budget aggregates | Yes |
| **POST** | `/api/receipts/upload/` | Upload receipt image to queue OCR parser | Yes |
| **POST** | `/api/receipts/<id>/confirm/` | Approve OCR text and build transaction | Yes |
| **GET** | `/api/insights/` | View current month's spending insights | Yes |
| **POST** | `/api/insights/` | Regenerate spending insights (1-hour cooldown) | Yes |
| **GET** | `/api/reports/` | List compiled monthly statements | Yes |
| **POST** | `/api/reports/generate/` | Queue on-demand monthly PDF compiler | Yes |
| **GET** | `/api/reports/<id>/download/` | Securely download statement PDF | Yes |
| **GET** | `/api/health/` | System status health check | No |
