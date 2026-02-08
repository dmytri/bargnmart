import { getDb } from "../db/client";
import { generateId } from "../middleware/auth";
import { isValidText } from "../middleware/validation";

export async function handleLeads(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const { email, type, source, consent, consent_text } = body as {
    email?: string;
    type?: string;
    source?: string;
    consent?: boolean | number;
    consent_text?: string;
  };

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return new Response(JSON.stringify({ error: "Valid email is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!consent) {
    return new Response(JSON.stringify({ error: "Consent is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (consent_text && !isValidText(consent_text, 1000)) {
    return new Response(JSON.stringify({ error: "consent_text too long" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (type && !isValidText(type, 100)) {
    return new Response(JSON.stringify({ error: "type too long (max 100 chars)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (source && !isValidText(source, 200)) {
    return new Response(JSON.stringify({ error: "source too long (max 200 chars)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const id = generateId();

  await db.execute({
    sql: `INSERT INTO leads (id, email, type, source, consent, consent_text, created_at)
          VALUES (?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(email) DO UPDATE SET
            type = COALESCE(excluded.type, leads.type),
            source = COALESCE(excluded.source, leads.source),
            consent_text = COALESCE(excluded.consent_text, leads.consent_text)`,
    args: [id, email, type || null, source || null, consent_text || null, now],
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
