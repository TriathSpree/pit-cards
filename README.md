# Pit Cards 🏎️

Jeu de cartes de course inspiré du Mille Bornes.

## Déploiement Vercel

1. Forker / pusher ce repo sur GitHub
2. Importer sur Vercel
3. Ajouter la variable d'environnement : `VITE_AIRTABLE_TOKEN` = ton token Airtable
4. Déployer

## Dev local

```bash
npm install
cp .env.example .env.local
# Remplir VITE_AIRTABLE_TOKEN dans .env.local
npm run dev
```
