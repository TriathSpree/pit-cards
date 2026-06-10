const AT_TOKEN = process.env.AIRTABLE_TOKEN;
const AT_BASE  = "appYhe9XzxdEP88CD";
const AT_TABLE = "Joueurs";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const r = await fetch(`https://api.airtable.com/v0/${AT_BASE}/${AT_TABLE}?sort[0][field]=objPts&sort[0][direction]=desc&maxRecords=20`, {
    headers: { Authorization: `Bearer ${AT_TOKEN}` }
  });
  const d = await r.json();
  return res.json(d);
}
