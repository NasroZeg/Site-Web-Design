# Adaptation du serveur au modèle du cours

Les routes de `app.js` utilisent des fonctions de rappel, comme l’exemple du professeur :

```js
db.query(sql, valeurs, (err, results) => {
    if (err) {
        return repondreErreur(res, err);
    }
    res.json(results);
});
```

`err` indique une erreur de requête. `results` contient les lignes d’un SELECT.
Pour un INSERT, le résultat contient notamment `insertId`.
Les valeurs du tableau remplacent les `?` de la requête dans le même ordre.

## Ce qui a été simplifié

- Les routes sont déclarées directement avec `app.get`, `app.post`, etc.
- `async`, `await`, `Promise` et la fonction d’enveloppe `route()` ont été retirés du serveur et de `db.js`.
- Les validations utilisent des `if` et des retours explicites.
- Les requêtes SQL longues utilisent des chaînes assemblées avec `+`.
- Les variables importantes portent des noms tels que `message`, `contact`, `dossier` et `classement`.

Les adresses API, les réponses attendues par la page et le port **3003** sont conservés.
Aucun nouveau module n’a été ajouté. `cors` n’est pas nécessaire puisque la page est servie par le même serveur que l’API.

## Pourquoi garder les transactions

Un envoi doit enregistrer le contenu du message, le classement de l’auteur et celui du destinataire.
Ces requêtes utilisent une seule connexion réservée par `db.commencerTransaction`.

- `commit` confirme l’ensemble des changements.
- `rollback` annule les changements si une étape échoue.
- `release` rend la connexion au pool après le traitement.

Le verrou SQL `FOR UPDATE` empêche deux demandes de modifier simultanément le même classement.
Il permet notamment de refuser le second envoi d’un brouillon déjà envoyé.

Les jointures SQL restent nécessaires pour relier les messages, leurs propriétaires et leurs dossiers.
Ces opérations sont commentées dans le code plutôt que supprimées.

## Démarrage et vérification

Lancer `npm start`, puis ouvrir `http://localhost:3003`.
Redémarrer le serveur après avoir remplacé **app.js et db.js ensemble**.
Le JavaScript de la page HTML n’a pas été réécrit dans cette adaptation.

`npm test` exécute des vérifications HTTP avec MySQL. Le compte défini dans `.env` doit pouvoir
lire la structure des tables du projet et créer puis supprimer une base de test.
Le test copie uniquement la structure des cinq tables dans une base nommée
`codex_messagerie_test_...`, ajoute des données fictives et supprime cette base à la fin.
Les données de la base du projet ne sont pas modifiées.
Les scénarios de doublon ajoutent leurs contraintes uniquement dans cette base temporaire.

Les vérifications couvrent les envois, brouillons, doubles envois, classements indépendants,
restaurations, contacts, profils, dossiers, erreurs SQL et annulations de transactions.
Le fichier `tests/api.cjs` sert uniquement aux vérifications ; il n’est pas chargé par l’application.
