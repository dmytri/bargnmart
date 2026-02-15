const BSKY_API = "https://bsky.social/xrpc";

interface BlueskySession {
  did: string;
  accessJwt: string;
  refreshJwt: string;
}

let session: BlueskySession | null = null;

function getBlueskyConfig(): { handle: string | undefined; identifier: string; password: string | undefined } {
  const handle = process.env.BLUESKY_HANDLE;
  return {
    handle,
    identifier: handle?.replace(/^@/, ''),
    password: process.env.BLUESKY_APP_PASSWORD,
  };
}

export function isBlueskyConfigured(): boolean {
  const config = getBlueskyConfig();
  return !!config.handle && !!config.password;
}

async function createSession(): Promise<BlueskySession | null> {
  const config = getBlueskyConfig();
  if (!config.identifier || !config.password) {
    return null;
  }

  try {
    const res = await fetch(`${BSKY_API}/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: config.identifier,
        password: config.password,
      }),
    });

    if (!res.ok) {
      console.error("[bluesky] Failed to create session:", await res.text());
      return null;
    }

    const data = await res.json() as BlueskySession;
    return data;
  } catch (err) {
    console.error("[bluesky] Session error:", err);
    return null;
  }
}

export async function initBluesky(): Promise<void> {
  if (!isBlueskyConfigured()) {
    return;
  }
  session = await createSession();
  if (session) {
    const config = getBlueskyConfig();
    console.log("[bluesky] Authenticated as", config.handle);
  }
}

export async function postToBluesky(text: string): Promise<boolean> {
  if (!session) {
    session = await createSession();
  }

  if (!session) {
    console.error("[bluesky] No session, skipping post");
    return false;
  }

  try {
    const res = await fetch(`${BSKY_API}/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.accessJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repo: session.did,
        collection: "app.bsky.feed.post",
        record: {
          text,
          createdAt: new Date().toISOString(),
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[bluesky] Post failed:", err);
      if (res.status === 401) {
        session = await createSession();
      }
      return false;
    }

    const data = await res.json() as { uri: string };
    console.log("[bluesky] Posted:", data.uri);
    return true;
  } catch (err) {
    console.error("[bluesky] Post error:", err);
    return false;
  }
}

export async function postRequestToBluesky(
  text: string,
  budgetMin: number | null,
  budgetMax: number | null,
  requestId: string
): Promise<boolean> {
  let budget = "";
  if (budgetMin !== null && budgetMax !== null) {
    budget = ` - Budget: $${(budgetMin / 100).toFixed(0)}-${(budgetMax / 100).toFixed(0)}`;
  } else if (budgetMin !== null) {
    budget = ` - Budget: $${(budgetMin / 100).toFixed(0)}+`;
  }

  const url = `https://bargn.monster/r/${requestId}`;
  const post = `🆕 REQUEST: ${text}${budget} #BargNMonster → ${url}`;

  return postToBluesky(post);
}

export async function postProductToBluesky(
  name: string,
  priceCents: number | null,
  productId: string
): Promise<boolean> {
  const price = priceCents !== null ? ` - $${(priceCents / 100).toFixed(2)}` : "";
  const url = `https://bargn.monster/p/${productId}`;
  const post = `🛒 NEW: ${name}${price} #BargNMonster → ${url}`;

  return postToBluesky(post);
}
