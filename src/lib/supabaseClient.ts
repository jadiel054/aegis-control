/**
 * REMOVED — Aegis no longer uses Supabase.
 * All database access goes through @/lib/db (Neon) on the server
 * and @/lib/api-client on the browser.
 *
 * This file is kept only to avoid broken imports during migration;
 * delete any remaining `import from '@/lib/supabaseClient'`.
 */
export const supabase = null as never;
throw new Error('Supabase client removed. Use @/lib/db (server) or @/lib/api-client (browser).');
