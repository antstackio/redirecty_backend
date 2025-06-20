import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { cors } from 'hono/cors'


// Define the environment interface
interface Env {
  DATABASE_URL: string
}

// Create the Hono app with the environment type
const app = new Hono<{ Bindings: Env }>()

// Add CORS middleware
app.use('/*', cors({
  origin: ['http://localhost:5173'], // Add your frontend URL here
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
  maxAge: 600,
  credentials: true,
}))

// Error handler middleware
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({
    success: false,
    error: 'Internal server error'
  }, 500);
});

// Helper function to fetch title from URL
async function fetchTitle(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'RedirectyTitleFetcher/1.0' }
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
      console.warn(`Failed to fetch title for ${url}: Non-HTML or bad response status ${response.status}`);
      return null;
    }
    const html = await response.text();
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : null;
  } catch (error) {
    console.error(`Error fetching title for ${url}:`, error);
    return null;
  }
}

// Define the schema for URL creation
const urlSchema = z.object({
  url: z.string().url(),
  shortCode: z.string().min(1).max(50).optional(),
  title: z.string().max(255).optional() // Added optional title
})

// Create a short URL
app.post('/api/create', zValidator('json', urlSchema), async (c) => {
  try {
    // Log the DB URL being used
    console.log('[DEBUG] Using DATABASE_URL:', c.env.DATABASE_URL);
    
    const { url, shortCode, title: providedTitle } = c.req.valid('json')
    const sql = neon(c.env.DATABASE_URL)

    let code: string
    let success = false
    let finalTitle = providedTitle || null;

    // Fetch title if not provided
    if (!finalTitle) {
        console.log(`Title not provided for ${url}, attempting to fetch...`);
        finalTitle = await fetchTitle(url);
        console.log(`Fetched title for ${url}: ${finalTitle}`);
    }

    if (shortCode) {
      code = shortCode
      try {
        await sql`INSERT INTO public.urls (short_code, full_url, title) VALUES (${code}, ${url}, ${finalTitle})`
        success = true
      } catch (dbError: any) {
        // Check for unique constraint violation (PostgreSQL error code 23505)
        if (dbError?.code === '23505') {
          return c.json({
            success: false,
            error: 'Short code already exists'
          }, 409)
        } else {
          console.error('Database error inserting provided short code:', dbError);
          throw new Error('Database error')
        }
      }
    } else {
      // Retry mechanism for generated codes
      for (let i = 0; i < 5; i++) { // Max 5 attempts
        code = nanoid(8)
        try {
          await sql`INSERT INTO public.urls (short_code, full_url, title) VALUES (${code}, ${url}, ${finalTitle})`
          success = true
          break
        } catch (dbError: any) {
          if (dbError?.code !== '23505') {
            console.error('Database error inserting generated short code:', dbError);
            throw new Error('Database error') // Re-throw non-unique constraint errors
          }
          // If it's a unique constraint violation (23505), loop continues to generate a new code
          console.log(`Generated code ${code} already exists, retrying...`)
        }
      }
      if (!success) {
          return c.json({
              success: false,
              error: 'Failed to generate a unique short code after multiple attempts'
          }, 500)
      }
    }

    // Return the short URL
    const shortUrl = `${new URL(c.req.url).origin}/${code!}`
    return c.json({
      success: true,
      shortUrl,
      code: code!
    })
  } catch (err) {
    console.error('Error creating short URL:', err);
    if (err instanceof Error) {
      // Handle validation errors from zValidator
      if (err.name === 'ZodError') {
        return c.json({
          success: false,
          error: 'Invalid input data',
          details: err.message
        }, 400)
      }
      return c.json({
        success: false,
        error: err.message
      }, 500)
    }
    return c.json({
      success: false,
      error: String(err)
    }, 500)
  }
})



// Redirect endpoint with analytics
app.get('/:code', async (c) => {
  try {
    const code = c.req.param('code')
    const sql = neon(c.env.DATABASE_URL)

    // Fetch the URL - Explicitly use public schema
    const results = await sql`SELECT full_url FROM public.urls WHERE short_code = ${code}`

    if (!Array.isArray(results) || results.length === 0 || !results[0]?.full_url) {
      return c.json({ success: false, error: 'Short code not found or invalid data' }, 404)
    }
    
    const full_url = (results[0] as { full_url: string }).full_url

    // Get country and referrer information
    const country = c.req.header('CF-IPCountry') || 'unknown'
    const referrerHeader = c.req.header('Referer');
    let referrer = 'direct'; // Default if no header or empty
    if (referrerHeader) {
        try {
            // Extract hostname for cleaner tracking
            referrer = new URL(referrerHeader).hostname;
        } catch (e) {
            // Handle invalid URLs in referrer header, maybe log or keep as direct
            console.warn(`Invalid Referer header URL: ${referrerHeader}`);
            referrer = 'invalid_referrer'; // Or keep as 'direct'
        }
    }
    // AWAIT the database update to ensure completion before redirecting
    try {
      await sql`UPDATE public.urls 
               SET 
                 visit_count = visit_count + 1, 
                 last_visited_at = NOW(),
                 -- Update region visits
                 region_visits = jsonb_set(
                   region_visits, 
                   ARRAY[${country}::text], 
                   (COALESCE(region_visits->>${country}::text, '0')::int + 1)::text::jsonb, 
                   true
                 ),
                 -- Update referrer visits
                 referrer_visits = jsonb_set(
                   referrer_visits,
                   ARRAY[${referrer}::text],
                   (COALESCE(referrer_visits->>${referrer}::text, '0')::int + 1)::text::jsonb,
                   true
                 )
               WHERE short_code = ${code}`;
      console.log(`Successfully updated analytics for ${code} from ${country} / ${referrer}`);
    } catch (updateError) {
        console.error(`Failed to update analytics for ${code}:`, updateError);
    }

    // Redirect to the original URL
    return c.redirect(full_url)

  } catch (err) {
    console.error('Error redirecting:', err);
    return c.json({
      success: false,
      error: 'Failed to process redirect'
    }, 500);
  }
})

// List all URLs with visit counts
app.get('/api/urls', async (c) => {
  try {
    const sql = neon(c.env.DATABASE_URL)

    // Fetch URLs, visit counts, and titles
    const results = await sql`SELECT short_code, full_url, visit_count, title FROM public.urls ORDER BY short_code ASC`

    // Define the type for the value in the record, including title
    type UrlData = {
      full_url: string;
      visit_count: number;
      title: string | null; // Added title
    };

    // Transform the results into the desired format
    const urls: Record<string, UrlData> = {}
    if (Array.isArray(results)) {
      // Cast each row when processing
      for (const row of results) {
        // Include title in the type cast
        const typedRow = row as { short_code: string, full_url: string, visit_count: number | null, title: string | null }
        // Ensure properties exist before assignment
        if (typedRow.short_code && typedRow.full_url) {
            urls[typedRow.short_code] = {
              full_url: typedRow.full_url,
              visit_count: typedRow.visit_count || 0, // Default to 0 if null
              title: typedRow.title // Add title here
            };
        }
      }
    }

    return c.json({
      success: true,
      urls: urls
    });
  } catch (err) {
    console.error('Error listing URLs:', err);
    return c.json({
      success: false,
      error: 'Failed to list URLs'
    }, 500);
  }
});

// Get analytics for a specific short code
app.get('/api/analytics/:code', async (c) => {
  try {
    const code = c.req.param('code');
    const sql = neon(c.env.DATABASE_URL)

    // Query the database for the specific URL record and its analytics, including title - Explicitly use public schema
    const results = await sql`SELECT full_url, visit_count, region_visits, referrer_visits, last_visited_at, title 
                             FROM public.urls
                             WHERE short_code = ${code}`

    if (!Array.isArray(results) || results.length === 0) {
      return c.json({ success: false, error: 'Short code not found' }, 404);
    }

    // Cast the result when accessing it, include referrer_visits
    const record = results[0] as {
      full_url: string,
      visit_count: number | null,
      region_visits: Record<string, number> | null,
      referrer_visits: Record<string, number> | null, // Add referrer_visits type
      last_visited_at: string | null,
      title: string | null // Added title
    }

    // Format the response
    return c.json({
      success: true,
      analytics: {
        shortCode: code,
        originalUrl: record.full_url,
        totalVisits: record.visit_count || 0,
        referrers: record.referrer_visits || {}, // Populate referrers from DB
        countries: record.region_visits || {},
        lastUpdated: record.last_visited_at ? new Date(record.last_visited_at).toISOString() : new Date().toISOString(),
        title: record.title // Add title here
      }
    });

  } catch (err) {
    console.error('Error getting analytics:', err);
    return c.json({
      success: false,
      error: 'Failed to get analytics'
    }, 500);
  }
});

export default app
   