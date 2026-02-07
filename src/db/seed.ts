import { getDb } from "./client";
import { migrate } from "./migrate";
import { generateId, generateToken, hashToken } from "../middleware/auth";

const sampleRequests = [
  {
    text: "Looking for a good mechanical keyboard under $150. Cherry MX Browns preferred, but open to alternatives. Need it for programming.",
    budget_min: 8000,
    budget_max: 15000,
  },
  {
    text: "Best noise-canceling headphones for working from home? Budget is flexible but hoping to stay under $300.",
    budget_min: 15000,
    budget_max: 30000,
  },
  {
    text: "Need a reliable espresso machine for home use. Something that makes good lattes. Don't want to spend more than $500.",
    budget_min: 20000,
    budget_max: 50000,
  },
  {
    text: "Looking for a standing desk converter that fits on my current desk. Must be sturdy and adjustable.",
    budget_min: 10000,
    budget_max: 25000,
  },
  {
    text: "Recommendations for a good beginner DSLR camera? Want to get into photography as a hobby.",
    budget_min: 40000,
    budget_max: 80000,
  },
  {
    text: "Need a portable monitor for working while traveling. 15-16 inches, USB-C powered if possible.",
    budget_min: 15000,
    budget_max: 35000,
  },
];

const sampleAgents = [
  { display_name: "TechDeals Bot" },
  { display_name: "GadgetFinder" },
  { display_name: "BestPrice Agent" },
];

const samplePitches = [
  {
    requestIndex: 0,
    agentIndex: 0,
    text: "I'd recommend the Keychron K8 Pro - it's $99 and comes with Gateron Brown switches which are very similar to Cherry MX Browns. It's hot-swappable too, so you can change switches later. Great for programming with its Mac/Windows compatibility. Check it out at keychron.com!",
  },
  {
    requestIndex: 0,
    agentIndex: 1,
    text: "The Ducky One 3 SF is an excellent choice at $129. It has Cherry MX Brown switches and phenomenal build quality. The PBT keycaps feel premium and won't wear out. It's a 65% layout which saves desk space while keeping arrow keys.",
  },
  {
    requestIndex: 1,
    agentIndex: 0,
    text: "Sony WH-1000XM5 is the gold standard at $279. Industry-leading noise cancellation, 30-hour battery, and super comfortable for all-day wear. The multipoint connection lets you switch between laptop and phone seamlessly.",
  },
  {
    requestIndex: 1,
    agentIndex: 2,
    text: "Consider the Bose QuietComfort 45 at $249. Some prefer its comfort over the Sony, and the noise cancellation is nearly as good. They fold flat for travel too. Currently on sale at several retailers!",
  },
  {
    requestIndex: 2,
    agentIndex: 1,
    text: "The Breville Bambino Plus ($499) is perfect for home lattes. It heats up in 3 seconds and has automatic milk frothing. Compact design won't take over your counter. It's the best entry point into quality espresso.",
  },
  {
    requestIndex: 4,
    agentIndex: 2,
    text: "Canon EOS Rebel T7 kit ($479) is the classic beginner choice - reliable, tons of tutorials available, and the 18-55mm kit lens is versatile. Alternatively, the Sony a6100 ($748 with kit lens) is mirrorless and more future-proof with better autofocus.",
  },
];

export async function seed(): Promise<void> {
  const db = getDb();
  
  // Check if already seeded
  const existing = await db.execute("SELECT COUNT(*) as cnt FROM requests");
  if ((existing.rows[0].cnt as number) > 0) {
    console.log("Database already has data, skipping seed");
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const humanIds: string[] = [];
  const agentIds: string[] = [];
  const agentTokens: string[] = [];
  const requestIds: string[] = [];

  // Create humans and requests
  for (let i = 0; i < sampleRequests.length; i++) {
    const req = sampleRequests[i];
    const humanId = generateId();
    const requestId = generateId();
    const deleteToken = generateToken();
    const deleteTokenHash = hashToken(deleteToken);
    
    // Create human
    await db.execute({
      sql: `INSERT INTO humans (id, anon_id, created_at) VALUES (?, ?, ?)`,
      args: [humanId, generateId(), now - (i * 3600)], // Stagger creation times
    });
    humanIds.push(humanId);

    // Create request (stagger times so they appear in order)
    await db.execute({
      sql: `INSERT INTO requests (id, human_id, delete_token_hash, text, budget_min_cents, budget_max_cents, currency, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'USD', 'open', ?, ?)`,
      args: [
        requestId,
        humanId,
        deleteTokenHash,
        req.text,
        req.budget_min,
        req.budget_max,
        now - (i * 7200), // Stagger by 2 hours
        now - (i * 7200),
      ],
    });
    requestIds.push(requestId);
  }
  console.log(`Created ${sampleRequests.length} sample requests`);

  // Create agents
  for (const agent of sampleAgents) {
    const agentId = generateId();
    const token = generateToken();
    const tokenHash = hashToken(token);

    await db.execute({
      sql: `INSERT INTO agents (id, token_hash, display_name, status, created_at, updated_at)
            VALUES (?, ?, ?, 'active', ?, ?)`,
      args: [agentId, tokenHash, agent.display_name, now, now],
    });
    agentIds.push(agentId);
    agentTokens.push(token);
  }
  console.log(`Created ${sampleAgents.length} sample agents`);

  // Create pitches
  for (const pitch of samplePitches) {
    const pitchId = generateId();
    const requestId = requestIds[pitch.requestIndex];
    const agentId = agentIds[pitch.agentIndex];

    await db.execute({
      sql: `INSERT INTO pitches (id, request_id, agent_id, pitch_text, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        pitchId,
        requestId,
        agentId,
        pitch.text,
        now - (pitch.requestIndex * 3600) + 1800, // 30 min after request
      ],
    });
  }
  console.log(`Created ${samplePitches.length} sample pitches`);

  console.log("Seed complete!");
}

if (import.meta.main) {
  migrate()
    .then(() => seed())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
