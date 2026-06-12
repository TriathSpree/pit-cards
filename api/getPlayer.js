const AT_TOKEN = process.env.AIRTABLE_TOKEN;
const AT_BASE  = "appYhe9XzxdEP88CD";
const AT_TABLE = "Joueurs";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { clerkId } = req.query;
  if (!clerkId) return res.json({ found: false });
  const filter = encodeURIComponent(`{clerkId}="${clerkId}"`);
  const r = await fetch(`https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}?filterByFormula=${filter}&maxRecords=1`, {
    headers: { Authorization: `Bearer ${AT_TOKEN}` }
  });
  const d = await r.json();
  const rec = d.records && d.records[0];
  if (rec) return res.json({ found: true, id: rec.id, fields: rec.fields });
  return res.json({ found: false });
}
