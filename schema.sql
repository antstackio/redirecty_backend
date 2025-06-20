-- SQL script to create the 'urls' table

-- Drop existing table if it exists (for development convenience - be careful in production!)
-- DROP TABLE IF EXISTS public.urls;

CREATE TABLE IF NOT EXISTS public.urls (
    short_code TEXT PRIMARY KEY, -- Unique short identifier
    full_url TEXT NOT NULL,      -- The original long URL
    visit_count INTEGER DEFAULT 0 NOT NULL, -- Total visits
    region_visits JSONB DEFAULT '{}'::jsonb NOT NULL, -- JSONB for region visit counts (e.g., {"US": 10, "CA": 5})
    referrer_visits JSONB DEFAULT '{}'::jsonb NOT NULL, -- JSONB for referrer visit counts (e.g., {"google.com": 5, "direct": 2})
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- Timestamp of creation
    last_visited_at TIMESTAMP WITH TIME ZONE -- Timestamp of the last visit (can be NULL initially)
);

-- Optional: Add an index on created_at if you plan to query by creation date often
-- CREATE INDEX IF NOT EXISTS idx_urls_created_at ON urls(created_at);

-- Optional: Add an index on last_visited_at if you plan to query by last visit time often
-- CREATE INDEX IF NOT EXISTS idx_urls_last_visited_at ON urls(last_visited_at);


-- Grant necessary permissions to the application user (replace 'redirecty_owner' if needed)
-- Note: If you dropped and recreated the table, you might need to re-run grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.urls TO redirecty_owner;

-- If using a sequence (though nanoid doesn't need one), grant usage:
-- GRANT USAGE, SELECT ON SEQUENCE your_sequence_name TO redirecty_owner; 