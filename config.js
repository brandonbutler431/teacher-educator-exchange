// The Teacher Educator Exchange — community configuration
// Public values only. The service_role / secret key must NEVER appear here.

export const SUPABASE_URL = "https://hmcuvnftmsflbjgxdpix.supabase.co";
export const SUPABASE_KEY = "sb_publishable_lHJwCwdxE3feiwuJLeomfQ_-VWeDq6P";

// How many comments a signed-out visitor may read before the wall.
// NOTE: this is a product choice, not a security boundary — the remaining
// comments are still fetched and present in the page data.
export const FREE_READ_COUNT = 2;

export const GUIDELINES_URL = "/guidelines";
export const DEFAULT_PROMPT = "How does this show up in your own work?";
