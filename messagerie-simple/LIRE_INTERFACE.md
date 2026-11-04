# Interface minimaliste — version améliorée

Les fichiers sources du projet sont inclus. Démarrez-le comme auparavant avec votre base MySQL et `npm start`.

Pour mettre à jour une installation existante, remplacez seulement `style.css` et `exercice1.html`. Conservez vos propres données et votre fichier `.env`.

| Avant | Après | Raison |
| --- | --- | --- |
| Cartes qui agrandissent la page | Panneaux limités à la hauteur disponible | Éviter le défilement de la page |
| Footer placé après le contenu | Footer dans une zone réservée en bas de la fenêtre | Le garder visible sans recouvrir le contenu |
| Grandes marges, dégradé et transparence | Fond neutre, bordures discrètes et formulaires compacts | Garder une interface minimaliste |

Les longues listes, messages et formulaires défilent à l’intérieur de leurs panneaux lorsque nécessaire. Sur téléphone, le tableau conserve toutes ses colonnes et peut défiler horizontalement. Aucune fonctionnalité n’a été ajoutée ou retirée.

Fichiers modifiés : style.css ; exercice1.html (correction « Utilissateurs » → « Utilisateur » uniquement). Le JavaScript, le serveur et le SQL sont identiques à l’original. Pour GitHub, le fichier .env contenant la configuration locale et les clés est exclu ; un .env.example sans clés est fourni. Le dossier node_modules est également exclu : utilisez npm ci.

Validation Chromium : neuf tailles (1440×900, 1280×720, 1024×768, 768×1024, 640×720, 390×844, 375×667, 320×568, 844×390), 99 vérifications de disposition, quatre onglets, lecture de texte long, rédaction et envoi simulé, accès aux boutons de formulaires, confirmations. Aucune erreur JavaScript détectée. Les réponses API ont été simulées pour ces vérifications ; MySQL n’est pas disponible dans l’environnement de vérification (ECONNREFUSED), les opérations réelles sur la base ne sont donc pas validées à nouveau.
