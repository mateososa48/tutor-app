import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Next.js imports every route module while collecting page data at build
// time, and the Auth.js adapter needs a real Drizzle instance at import. The
// Neon HTTP client does not connect until the first query, so a missing
// DATABASE_URL must not throw here (it failed every v2 preview build). With
// the variable unset, the first query fails against an obviously named host.
const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("[db] DATABASE_URL is not set — database queries will fail until it is added to the environment.");
}

const sql = neon(url ?? "postgresql://unset:unset@database-url-not-set.invalid/unset");
export const db = drizzle(sql, { schema });
