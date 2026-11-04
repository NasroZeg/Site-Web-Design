# Vérifications de la version 2

Réalisées sur une base de test MariaDB 10.11 et dans Firefox :
- SQL d'origine importé ; migration exécutée plusieurs fois sans doublons.
- 30 anciens messages reclassés en 60 associations et 25 dossiers système.
- Requêtes exécutées avec le mode SQL strict et ONLY_FULL_GROUP_BY.
- Envoi Ahmed > Amina et suppression indépendante des deux boîtes.
- Lecture/non lecture, archivage, déplacement et restauration.
- Refus de déplacer une corbeille ou de modifier un message envoyé.
- Protection des dossiers système et des données d'un autre utilisateur.
- Brouillon sans destinataire, reprise, restauration et envoi.
- Deux envois simultanés du même brouillon : un seul accepté.
- Envoi à soi-même avec deux classements distincts.
- Réception impossible : annulation des écritures de l'envoi par transaction.
- Ajout, modification et suppression des contacts ; modification du profil.
- Compteurs vérifiés par rapport aux listes.
- Huit lignes visibles avant défilement.
- Défilement du texte long ; pas de débordement de page sur mobile.
- Navigation entre utilisateurs, contacts et dossiers sans erreur JavaScript.

La base de test et ses messages supplémentaires ne sont pas inclus dans le ZIP.
Ta connexion MySQL locale doit être vérifiée avec ton fichier .env.
