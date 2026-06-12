const AT_TOKEN = process.env.AIRTABLE_TOKEN;
const AT_BASE  = "appYhe9XzxdEP88CD";
const AT_TABLE = "Joueurs";
const AT_URL   = `https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { fields, recId } = req.body;

  // Si on a un recId, PATCH direct
  if (recId) {
    const r = await fetch(`${AT_URL}/${recId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${AT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields })
    });
    return res.json(await r.json());
  }

  // Sinon, cherche si un record avec ce clerkId existe déjà
  if (fields.clerkId) {
    const filter = encodeURIComponent(`{clerkId}="${fields.clerkId}"`);
    const search = await fetch(`${AT_URL}?filterByFormula=${filter}&maxRecords=1`, {
      headers: { Authorization: `Bearer ${AT_TOKEN}` }
    });
    const found = await search.json();
    if (found.records && found.records.length > 0) {
      const existingId = found.records[0].id;
      const r = await fetch(`${AT_URL}/${existingId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${AT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields })
      });
      return res.json(await r.json());
    }
  }

  // Nouveau record
  const r = await fetch(AT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${AT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields })
  });
  return res.json(await r.json());
}
