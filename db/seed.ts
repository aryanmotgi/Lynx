import { createHash, randomBytes } from "node:crypto";
import { db } from "@lynx/shared";
import { createIdentity } from "@lynx/identity-vault";

async function main() {
  const pool = db();

  // Seed test company
  const apiKey = `lynx_test_${randomBytes(16).toString("hex")}`;
  const apiKeyHash = createHash("sha256").update(apiKey).digest("hex");

  const co = await pool.query(
    `insert into companies (name, api_key_hash) values ($1, $2)
     on conflict (api_key_hash) do nothing
     returning id`,
    ["Test Co (seed)", apiKeyHash],
  );

  let companyId: string;
  if (co.rows[0]) {
    companyId = co.rows[0].id;
    console.log(`Created company ${companyId}`);
    console.log(`API key (save now, only shown once): ${apiKey}`);
  } else {
    const existing = await pool.query(
      `select id from companies where name = $1 limit 1`,
      ["Test Co (seed)"],
    );
    companyId = existing.rows[0].id;
    console.log(`Reusing company ${companyId}`);
  }

  const seeds = [
    { label: "alice", email: "alice@test.lynx.local", phone: "+15550000001" },
    { label: "bob", email: "bob@test.lynx.local", phone: "+15550000002" },
    { label: "carol", email: "carol@test.lynx.local", phone: "+15550000003" },
    { label: "dave", email: "dave@test.lynx.local", phone: "+15550000004" },
    { label: "eve", email: "eve@test.lynx.local", phone: "+15550000005" },
  ];

  for (const s of seeds) {
    const existing = await pool.query(
      `select id from identities where company_id = $1 and label = $2`,
      [companyId, s.label],
    );
    if (existing.rows[0]) {
      console.log(`Skip ${s.label} (exists)`);
      continue;
    }
    const id = await createIdentity({
      company_id: companyId,
      label: s.label,
      email: s.email,
      phone: s.phone,
      fingerprint: {
        user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        viewport: { width: 1920, height: 1080 },
        locale: "en-US",
        timezone: "America/Los_Angeles",
      },
    });
    console.log(`Seeded ${s.label} → ${id.id}`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
