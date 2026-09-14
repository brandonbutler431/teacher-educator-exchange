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

// Where an individual conversation lives. One page, thread id in the query.
export const THREAD_URL = "/thread";

// Discussion spaces. Three is deliberate — an empty space reads as a dead room,
// so add the fourth when the third is busy. Order is display order.
export const SPACES = [
  {
    slug: "teaching-practice",
    name: "Teaching practice",
    blurb: "Methods courses, assignments, feedback, and what happens when a class does not go the way you planned."
  },
  {
    slug: "clinical-practice",
    name: "Clinical practice & partnerships",
    blurb: "Placements, mentor teachers, supervision, and the work of holding a school–university partnership together."
  },
  {
    slug: "open-floor",
    name: "Open floor",
    blurb: "Introductions, questions that fit nowhere else, and what you would like the Exchange to become."
  }
];
