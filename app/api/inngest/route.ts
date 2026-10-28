import { serve } from "inngest/next";
import { buildInngestFunctions, inngestClient } from "@/lib/providers/queue/inngest";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Inngest calls this route to run background functions. Requests are verified with INNGEST_SIGNING_KEY
 * (the SDK rejects unsigned calls in production), so it is safe to leave outside the session guard.
 */
export const { GET, POST, PUT } = serve({ client: inngestClient, functions: buildInngestFunctions() });
