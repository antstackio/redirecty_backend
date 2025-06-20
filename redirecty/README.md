# Redirecty - A Fast and Simple URL Shortener

Redirecty is a high-performance, lightweight URL shortener built with [Hono](https://hono.dev/) and running on [Cloudflare Workers](https://workers.cloudflare.com/). It uses a [Neon](https://neon.tech/) serverless Postgres database for data storage, providing a scalable and cost-effective solution.

## Features

- **Fast Redirects**: Built on Cloudflare's edge network for minimal latency.
- **Custom Short Codes**: Users can provide their own custom short codes.
- **Automatic Code Generation**: If no custom code is provided, a unique 8-character code is generated using `nanoid`.
- **Title Fetching**: Automatically fetches the title of the original URL for better link management.
- **Visit Analytics**: Tracks total visits, referrers, and visitor countries for each link.
- **Scalable**: Serverless architecture for both the application and the database.

## Tech Stack

- **Framework**: [Hono](https://hono.dev/)
- **Platform**: [Cloudflare Workers](https://workers.cloudflare.com/)
- **Database**: [Neon](https://neon.tech/) (Serverless Postgres)
- **Language**: [TypeScript](https://www.typescriptlang.org/)

## Prerequisites

Before you begin, ensure you have the following:

- [Node.js](https://nodejs.org/en/) (v18 or later)
- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed and authenticated
- A [Neon account](https://neon.tech/signup) with a new project and database created.

## Setup & Deployment

### 1. Clone the Repository

```bash
git clone <repository-url>
cd redirecty_backend/redirecty
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set up the Database

1.  Log in to your Neon account and create a new project.
2.  In your project's dashboard, go to the **SQL Editor**.
3.  Copy the contents of the `schema.sql` file from the root of this repository and run it in the SQL Editor to create the `urls` table.
4.  Navigate to the **Connection Details** section of your dashboard and find your database connection string (it should look like `postgresql://...`). You will need this for the next step.

### 4. Configure Your Worker

This project uses a `wrangler.example.jsonc` as a template. You will need to create your own `wrangler.jsonc` file to run the application.

1.  Copy the example file:
    ```bash
    cp wrangler.example.jsonc wrangler.jsonc
    ```
2.  Open `wrangler.jsonc` and replace the placeholder value for `DATABASE_URL` with your actual Neon database connection string. The `wrangler.jsonc` file is included in `.gitignore` and will not be committed to the repository.

Alternatively, for production, you can use Wrangler secrets.

```bash
# Replace <YOUR_DATABASE_URL> with the connection string from Neon
wrangler secret put DATABASE_URL
```

### 5. Configure CORS

If you are using this backend with a separate frontend application, you must add your frontend's URL to the CORS allowlist.

1.  Open `redirecty/src/index.ts`.
2.  Locate the `cors` middleware section.
3.  Add your frontend application's domain to the `origin` array:
    ```typescript
    // ...
    app.use('/*', cors({
      origin: ['http://localhost:5173', 'https://your-frontend-domain.com'], // Add your frontend URL here
      // ...
    }));
    // ...
    ```

### 6. Deploy the Application

Once your worker is configured, you can deploy your application to Cloudflare Workers.

```bash
npm run deploy
```

Wrangler will build and deploy your Hono application. After deployment, it will show you the URL where your worker is live (e.g., `redirecty.<your-subdomain>.workers.dev`).

## Running Locally

To run the application on your local machine for development:

```bash
npm run dev
```

This will start a local server, typically on `http://localhost:8787`.

## API Endpoints

### `POST /api/create`

Creates a new short URL.

**Body:**

```json
{
  "url": "https://example.com/a-very-long-url-to-be-shortened",
  "shortCode": "custom-code", // Optional: your custom short code
  "title": "Custom Title"     // Optional: a title for the link
}
```

**Response (Success):**

```json
{
  "success": true,
  "shortUrl": "https://<your-worker-url>/custom-code",
  "code": "custom-code"
}
```

### `GET /:code`

Redirects to the original full URL associated with the short code and records analytics data.

### `GET /api/urls`

Retrieves a list of all created short URLs, along with their visit counts and titles.

**Response (Success):**

```json
{
    "success": true,
    "urls": {
        "example": {
            "full_url": "https://example.com/",
            "visit_count": 10,
            "title": "Example Domain"
        }
    }
}
```

### `GET /api/analytics/:code`

Retrieves detailed analytics for a specific short code.

**Response (Success):**

```json
{
    "success": true,
    "analytics": {
        "shortCode": "example",
        "originalUrl": "https://example.com/",
        "totalVisits": 10,
        "referrers": {
            "google.com": 5,
            "direct": 5
        },
        "countries": {
            "US": 8,
            "CA": 2
        },
        "lastUpdated": "2023-10-27T10:00:00.000Z",
        "title": "Example Domain"
    }
}
```

## Security Note

This project is intended as a template. For a production environment, you should secure the administrative endpoints (`/api/urls` and `/api/analytics/:code`) to prevent unauthorized access to your link data. This can be done by implementing an authentication mechanism (e.g., using JWTs, Cloudflare Access, or simple API keys).