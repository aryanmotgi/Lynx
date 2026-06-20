// Seeds Test Co + 5 stub identities into the arcus-memory Butterbase app.
//
// Requires:
//   BUTTERBASE_APP_ID=app_9kdch2ndsfx9
//   BUTTERBASE_API_KEY=bb_sk_...
//   IDENTITY_ENCRYPTION_KEY=...

import { createHash, randomBytes } from "node:crypto";
import { bbSelect, bbInsert } from "@lynx/shared";
import { createIdentity } from "@lynx/identity-vault";

interface Company {
  id: string;
  name: string;
}

async function main() {
  const apiKey = `lynx_test_${randomBytes(16).toString("hex")}`;
  const apiKeyHash = createHash("sha256").update(apiKey).digest("hex");

  let company: Company;
  const existing = await bbSelect<Company>(
    "lynx_companies",
    { name: "eq.Test Co (seed)" },
    { limit: 1, select: "id,name" },
  );
  if (existing[0]) {
    company = existing[0];
    console.log(`Reusing company ${company.id}`);
  } else {
    company = await bbInsert<Company>("lynx_companies", {
      name: "Test Co (seed)",
      api_key_hash: apiKeyHash,
    });
    console.log(`Created company ${company.id}`);
    console.log(`Lynx API key (save now, only shown once): ${apiKey}`);
  }

  const seeds = [
    { label: "alice", email: "alice@test.lynx.local", phone: "+15550000001" },
    { label: "bob", email: "bob@test.lynx.local", phone: "+15550000002" },
    { label: "carol", email: "carol@test.lynx.local", phone: "+15550000003" },
    { label: "dave", email: "dave@test.lynx.local", phone: "+15550000004" },
    { label: "eve", email: "eve@test.lynx.local", phone: "+15550000005" },
  ];

  for (const s of seeds) {
    const exists = await bbSelect(
      "lynx_identities",
      { company_id: `eq.${company.id}`, label: `eq.${s.label}` },
      { limit: 1, select: "id" },
    );
    if (exists[0]) {
      console.log(`Skip ${s.label} (exists)`);
      continue;
    }
    const id = await createIdentity({
      company_id: company.id,
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
