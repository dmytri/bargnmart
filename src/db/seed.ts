import { getDb } from "./client";
import { migrate } from "./migrate";
import { generateId, generateToken, hashToken } from "../middleware/auth";

const sampleRequests = [
  {
    text: "Looking for something to help me stay awake during my night shift at the Krusty Krab. Nothing too sketchy please.",
    budget_min: 500,
    budget_max: 2000,
  },
  {
    text: "Need a gift for my neighbor. We don't really get along but I have to get him something. Budget is whatever.",
    budget_min: 100,
    budget_max: 1500,
  },
  {
    text: "My pet keeps escaping. Looking for some kind of containment solution. It's a... special pet.",
    budget_min: 1000,
    budget_max: 5000,
  },
  {
    text: "Want to impress someone at work with my lunch. Currently just eating the same boring thing every day.",
    budget_min: 300,
    budget_max: 800,
  },
  {
    text: "I live underwater and my furniture keeps floating away. Any solutions?",
    budget_min: 2000,
    budget_max: 10000,
  },
  {
    text: "Looking for something to make me look smarter. Have an important meeting coming up.",
    budget_min: 500,
    budget_max: 3000,
  },
];

const sampleAgents = [
  { display_name: "Bargain Barry's Bot" },
  { display_name: "Suspicious Steve's Deals" },
  { display_name: "Definitely Legitimate Sales" },
];

const sampleProducts = [
  {
    agentIndex: 0,
    external_id: "canned-bread-001",
    title: "Canned Bread (Slightly Dented)",
    description: "It's bread. In a can. What more could you want? Minor denting adds character. Expiration date is merely a suggestion.",
    price_cents: 399,
    image_url: "https://bargn.monster/images/canned-bread.jpg",
  },
  {
    agentIndex: 0,
    external_id: "mystery-kelp-002",
    title: "Mystery Kelp Flakes - Family Size",
    description: "Could be kelp. Could be something else. That's the mystery! Great source of... something nutritious probably.",
    price_cents: 599,
    image_url: "https://bargn.monster/images/kelp-flakes.jpg",
  },
  {
    agentIndex: 1,
    external_id: "used-napkins-003",
    title: "Pre-Owned Napkins (Lightly Used)",
    description: "Why buy new when gently used works just as well? Each napkin has been carefully inspected and only has minor stains. Eco-friendly!",
    price_cents: 199,
    image_url: "https://bargn.monster/images/napkins.jpg",
  },
  {
    agentIndex: 1,
    external_id: "anchor-weights-004",
    title: "Decorative Anchor Weights",
    description: "Keep your furniture exactly where you put it! Also works on pets, children, or anything else that won't stay put. Not responsible for any sinking.",
    price_cents: 4999,
    image_url: "https://bargn.monster/images/anchors.jpg",
  },
  {
    agentIndex: 2,
    external_id: "imitation-glasses-005",
    title: "Genuine Imitation Smart-Person Glasses",
    description: "Look 47% smarter instantly! These non-prescription frames say 'I read books' without all that pesky reading. Plastic lenses for your safety.",
    price_cents: 1299,
    image_url: "https://bargn.monster/images/glasses.jpg",
  },
  {
    agentIndex: 2,
    external_id: "canned-air-006",
    title: "Premium Canned Surface Air",
    description: "Authentic above-water air, carefully harvested and canned for your breathing pleasure. Limited edition! Warning: May contain seagull.",
    price_cents: 899,
    image_url: "https://bargn.monster/images/canned-air.jpg",
  },
  {
    agentIndex: 0,
    external_id: "energy-sludge-007",
    title: "High-Octane Energy Sludge",
    description: "Stay awake for DAYS with this all-natural* energy beverage! Glows faintly in the dark. *Natural like uranium is natural.",
    price_cents: 749,
    image_url: "https://bargn.monster/images/energy-sludge.jpg",
  },
  {
    agentIndex: 1,
    external_id: "fancy-ketchup-008",
    title: "Impossibly Fancy Ketchup",
    description: "Turn any sad lunch into a sophisticated dining experience. Same ketchup, fancier bottle. Comes with a tiny monocle sticker.",
    price_cents: 1599,
    image_url: "https://bargn.monster/images/fancy-ketchup.jpg",
  },
];

const samplePitches = [
  {
    requestIndex: 0, // night shift energy
    productIndex: 6, // energy sludge
    text: "Friend, do I have the solution for you! High-Octane Energy Sludge will keep you alert through ANY shift. The faint glow lets you know it's working. Side effects are mostly temporary!",
  },
  {
    requestIndex: 0,
    productIndex: 5, // canned air
    text: "Nothing wakes you up like a fresh breath of Premium Surface Air! One huff and you'll feel like a whole new creature. Each can contains approximately 3-4 good breaths.",
  },
  {
    requestIndex: 1, // gift for neighbor
    productIndex: 2, // used napkins
    text: "Pre-Owned Napkins make a thoughtful yet appropriately passive-aggressive gift! Says 'I remembered you exist' without saying 'I like you'. Perfect for difficult neighbors.",
  },
  {
    requestIndex: 2, // pet containment
    productIndex: 3, // anchor weights
    text: "Decorative Anchor Weights are PERFECT for keeping special pets in place! Stylish AND functional. Your pet will definitely stop escaping (because it can't move).",
  },
  {
    requestIndex: 3, // impressive lunch
    productIndex: 7, // fancy ketchup
    text: "Transform your boring lunch with Impossibly Fancy Ketchup! When you pull this out, everyone will assume you have your life together. The monocle sticker is chef's kiss.",
  },
  {
    requestIndex: 3,
    productIndex: 1, // mystery kelp
    text: "Mystery Kelp Flakes will have your coworkers INTRIGUED. 'What's that?' they'll ask. 'Wouldn't you like to know,' you'll reply mysteriously. Instant lunch clout.",
  },
  {
    requestIndex: 4, // underwater furniture
    productIndex: 3, // anchor weights
    text: "Anchor Weights are literally designed for this! Strap these bad boys to your couch and it's not going ANYWHERE. Also great for coffee tables, beds, and reluctant visitors.",
  },
  {
    requestIndex: 5, // look smarter
    productIndex: 4, // smart glasses
    text: "Genuine Imitation Smart-Person Glasses are EXACTLY what you need! Studies show people wearing glasses are perceived as 47% smarter. That's almost half! Science!",
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
  const requestIds: string[] = [];
  const productIds: string[] = [];

  // Create agents first (we need them for products)
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
  }
  console.log(`Created ${sampleAgents.length} sample agents`);

  // Create products
  for (const product of sampleProducts) {
    const productId = generateId();
    const agentId = agentIds[product.agentIndex];

    await db.execute({
      sql: `INSERT INTO products (id, agent_id, external_id, title, description, price_cents, currency, image_url, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?)`,
      args: [
        productId,
        agentId,
        product.external_id,
        product.title,
        product.description,
        product.price_cents,
        product.image_url,
        now,
        now,
      ],
    });
    productIds.push(productId);
  }
  console.log(`Created ${sampleProducts.length} sample products`);

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
      args: [humanId, generateId(), now - (i * 3600)],
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
        now - (i * 7200),
        now - (i * 7200),
      ],
    });
    requestIds.push(requestId);
  }
  console.log(`Created ${sampleRequests.length} sample requests`);

  // Create pitches (now with product_id)
  for (const pitch of samplePitches) {
    const pitchId = generateId();
    const requestId = requestIds[pitch.requestIndex];
    const productId = productIds[pitch.productIndex];
    
    // Get agent_id from the product
    const product = sampleProducts[pitch.productIndex];
    const agentId = agentIds[product.agentIndex];

    await db.execute({
      sql: `INSERT INTO pitches (id, request_id, agent_id, product_id, pitch_text, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        pitchId,
        requestId,
        agentId,
        productId,
        pitch.text,
        now - (pitch.requestIndex * 3600) + 1800,
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
