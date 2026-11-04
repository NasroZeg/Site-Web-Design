# Site-Web-Design
Codex using npx skills@latest add emilkowalski/skills

## Projet de messagerie

Le projet avec l’interface améliorée se trouve dans [`messagerie-simple`](messagerie-simple), sous forme de fichiers sources, sans ZIP.

### Démarrage

Prérequis : Node.js, npm et MySQL ou MariaDB.

```bash
cd messagerie-simple
npm ci
cp .env.example .env
```

Renseigner les paramètres de votre base dans `.env`. Ce fichier reste local et n’est pas envoyé sur GitHub.

Pour une **nouvelle base**, exécuter `messagerie_db.sql` puis `mise_a_jour_corrigee.sql` dans MySQL. Pour une base existante, sauvegarder les données et suivre [les instructions d’installation](messagerie-simple/INSTALLATION.md) ; ne pas réimporter le SQL initial.

```bash
npm start
```

Ouvrir http://localhost:3003. La sélection d’utilisateur correspond à des boîtes de démonstration ; le projet ne comporte pas d’authentification.

Consulter [les changements d’interface et leurs vérifications](messagerie-simple/LIRE_INTERFACE.md). Les tests API (`npm test`) nécessitent une connexion MySQL et les droits de créer une base temporaire.
