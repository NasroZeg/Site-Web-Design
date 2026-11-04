# Messagerie simple — Version 2

## Mettre à jour ton projet qui fonctionne déjà

1. Arrêter le serveur avec Ctrl+C.
2. Conserver une copie de ton ancien dossier de projet et exporter la base
   messagerie_db depuis MySQL Workbench (Server > Data Export).
3. Ouvrir le dossier messagerie-simple de ce dépôt.
4. Remplacer app.js, db.js, exercice1.html et style.css dans ton projet.
   Garder ton dossier images et ton .env, qui fonctionnent déjà.
5. Dans MySQL Workbench, ouvrir mise_a_jour_corrigee.sql et exécuter TOUT le fichier.
   IMPORTANT : ne pas réexécuter messagerie_db.sql sur ta base existante.
6. Dans le terminal ouvert dans ton projet :
       npm install
       npm start
7. Ouvrir http://localhost:3003 et actualiser avec Ctrl+F5.

Aucun nouveau module n'est nécessaire. La version 2 utilise toujours express,
mysql et dotenv. Tu peux aussi utiliser directement le dossier du projet :
copier tes photos dans son dossier images et conserver tes paramètres .env.

## Si tu repars d'une base vide
1. Exécuter messagerie_db.sql une seule fois (le SQL d'origine).
2. Exécuter ensuite mise_a_jour_corrigee.sql.
3. npm install, puis npm start.
4. Ouvrir http://localhost:3003, sans Live Server.

Le SQL d'origine est livré sans modification.
mise_a_jour_corrigee.sql crée MESSAGE_UTILISATEUR, ajoute DOSSIER.type_dossier et
MESSAGE.statut, puis crée les dossiers système de chaque utilisateur.
Il peut être relancé sans réinitialiser les classements de la version 2.
Ne pas remettre l'ancien app.js après cette mise à jour : il ne gère pas les associations.

## Fonctionnement

### Utilisateurs
La liste en haut choisit la boîte de démonstration : Ahmed, Amina, Youssef, etc.
Les formulaires non enregistrés sont vidés lors du changement d'utilisateur.
Il n'y a ni authentification, ni inscription.

### Messages
- Deux sous-onglets à droite : Consulter et Nouveau message.
- Lire un message le marque comme lu dans la boîte courante (sauf la corbeille).
- Le bouton permet aussi de le marquer comme non lu.
- Les messages envoyés ne peuvent plus être modifiés.
- Le formulaire est vidé uniquement après un envoi/enregistrement réussi.
- Un formulaire entièrement vide n'envoie aucune requête.
- Huit messages sont visibles avant le défilement vertical.
- Sur un petit écran, le tableau possède aussi un défilement horizontal.
- Le texte long d'un message défile dans le panneau de lecture à droite.

### Brouillons
Un objet OU un contenu suffit pour enregistrer un brouillon.
Le destinataire peut être choisi plus tard.
Le brouillon reste visible seulement dans la boîte de l'auteur.
Dans Brouillons, cliquer Lire puis Reprendre le brouillon pour le modifier.
Envoyer un brouillon déplace son classement vers Messages envoyés et crée le
classement Messages reçus du destinataire. Un second envoi du même brouillon
est refusé par le serveur.
Un brouillon supprimé doit d'abord être restauré pour être repris.

### Dossiers et compteurs
Chaque utilisateur possède :
- Messages reçus
- Messages envoyés
- Brouillons
- Messages archivés
- Messages supprimés

Les dossiers apparaissent à la fois dans le filtre et dans l'onglet Dossiers.
Le nombre indiqué est le total ACTUEL de messages classés dans ce dossier
pour l'utilisateur sélectionné, y compris les messages lus.
Les dossiers système ne peuvent être ni renommés ni supprimés.
Les dossiers personnels peuvent être créés et renommés.
Pour supprimer un dossier personnel, déplacer d'abord tous ses messages.

### Classement et restauration
Archiver, déplacer ou supprimer change uniquement MESSAGE_UTILISATEUR :
cela ne modifie pas la boîte du correspondant.
Un message reçu ou envoyé peut être déplacé vers un dossier personnel ou
les archives, puis revenir dans sa famille d'origine.
On ne peut pas transformer un message reçu en message envoyé.
Dans Messages supprimés, seule l'action Restaurer est disponible.

Destination de restauration :
- message reçu, puis supprimé : Messages reçus ;
- message envoyé, puis supprimé : Messages envoyés ;
- message archivé, puis supprimé : Messages archivés ;
- message reçu/envoyé déplacé dans un dossier personnel, puis supprimé :
  Messages reçus/envoyés ;
- message archivé déplacé dans un dossier personnel, puis supprimé :
  Messages archivés ;
- brouillon supprimé : Brouillons.

Le retour explicite d'une archive vers Reçus/Envoyés annule son origine Archives.
Aucune suppression définitive n'est prévue.

### Contacts et profil
Ajouter, modifier et supprimer les contacts de l'utilisateur sélectionné.
Un numéro de 10 chiffres par contact, avec son type.
La photo est un NOM de fichier placé dans images (exemple : ali.svg).
Si elle est absente, profil.svg s'affiche.
Mon profil permet de modifier nom, prénom, courriel et nom de photo.
Les mots de passe ne sont ni affichés ni utilisés.
Les destinataires des messages sont les utilisateurs de UTILISATEUR :
ajouter un contact ne crée pas un compte destinataire.

## Explication de la base pour la présentation
MESSAGE contient le contenu partagé : objet, texte, expéditeur, destinataire et date.
MESSAGE_UTILISATEUR contient le classement personnel et l'état de lecture.
L'envoi crée une seule ligne MESSAGE et deux associations MESSAGE_UTILISATEUR.
Une transaction MySQL garantit que les trois écritures réussissent ensemble.
En cas d'erreur, aucune réception partielle n'est conservée.
Le rôle permet même un envoi à soi-même : une association dans Envoyés,
une autre dans Reçus.
Les requêtes utilisent des ? pour séparer les valeurs du SQL.

Les anciens champs MESSAGE.id_dossier et MESSAGE.est_lu sont conservés
pour compatibilité avec le SQL initial. La nouvelle application ne les lit plus.
Les anciennes associations incohérentes sont remplacées fonctionnellement par
les classements de MESSAGE_UTILISATEUR.
Lors de la première migration, les anciens messages sont reclassés en Envoyés
pour l'auteur et Reçus pour le destinataire. Les anciens dossiers Archive/Corbeille
ne sont pas interprétés comme un historique fiable, car ils étaient incohérents.
L'ancien état lu/non lu est repris uniquement pour le destinataire.

## Parcours de vérification sur ton ordinateur
1. Choisir Ahmed, cliquer Nouveau message, envoyer « Test séparation » à Amina.
2. Vérifier Ahmed > Messages envoyés et son compteur.
3. Choisir Amina : le message est dans Messages reçus et est non lu.
4. Lire : il passe à Lu ; le marquer comme non lu avec le bouton.
5. Supprimer : il est dans la corbeille d'Amina.
6. Choisir Ahmed : son message est toujours dans Messages envoyés.
7. Revenir à Amina, restaurer : retour dans Messages reçus.
8. Archiver, créer « Cours », déplacer l'archive dans Cours, supprimer et restaurer :
   retour dans Messages archivés.
9. Enregistrer un brouillon sans destinataire, le reprendre, choisir Youssef et envoyer.
10. Vérifier Youssef > Messages reçus.
11. Ajouter, modifier et supprimer un contact.
12. Modifier le profil et vérifier son nom dans la liste d'utilisateurs.
13. Charger plus de 8 messages et un contenu long pour vérifier le défilement.

## Erreurs fréquentes
- Erreur SQL au chargement : exécuter mise_a_jour_corrigee.sql sur messagerie_db.
- Unknown database : importer le SQL d'origine dans la bonne instance MySQL.
- Access denied : vérifier .env (utilisateur, mot de passe, port).
- .env introuvable : lancer npm start depuis le dossier du projet.
- Port 3000 occupé : arrêter l'ancien serveur avant npm start.
- Réponse HTML au lieu de JSON : ouvrir http://localhost:3003 ; pas Live Server.
- Dossier déjà présent : choisir un autre nom pour ce même utilisateur.

## Périmètre
Application locale de démonstration. Pas de pièces jointes, de recherche,
d'inscription ou d'authentification. Le serveur écoute uniquement sur 127.0.0.1.
