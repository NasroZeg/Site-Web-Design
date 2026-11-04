-- MISE À JOUR CORRIGÉE — MySQL / MySQL Workbench
-- Testé sur MySQL 8.0.46 : mode sécurisé activé, relance et mise à jour partielle.
-- Ouvrir ce fichier dans un NOUVEL onglet SQL.
-- Sélectionner tout le fichier (Ctrl+A), puis exécuter la sélection.
-- La base messagerie_db et ses tables d'origine doivent déjà exister.
-- Ce script ne supprime ni la base ni les messages.
-- Arrêter l'application pendant la mise à jour.

USE messagerie_db;

-- Workbench peut bloquer les UPDATE avec l'erreur 1175.
-- Désactiver cette option seulement dans cette connexion, puis la rétablir à la fin.
SET @ancien_sql_safe_updates = @@SESSION.SQL_SAFE_UPDATES;
SET SESSION SQL_SAFE_UPDATES = 0;

-- 1. Ajouter la colonne des dossiers système si elle est absente.
-- PREPARE exécute le texte SQL choisi dans @commande.
-- Il n'y a ni procédure stockée ni commande DELIMITER.
SET @commande = IF(
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE() AND UPPER(table_name) = 'DOSSIER'
       AND column_name = 'type_dossier') = 0,
    'ALTER TABLE DOSSIER ADD COLUMN type_dossier VARCHAR(20) NULL',
    'SELECT ''Colonne type_dossier déjà présente'' AS information'
);
PREPARE instruction_sql FROM @commande;
EXECUTE instruction_sql;
DEALLOCATE PREPARE instruction_sql;

-- 2. Ajouter le statut du message si cette colonne est absente.
SET @commande = IF(
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE() AND UPPER(table_name) = 'MESSAGE'
       AND column_name = 'statut') = 0,
    'ALTER TABLE MESSAGE ADD COLUMN statut VARCHAR(20) NOT NULL DEFAULT ''envoye''',
    'SELECT ''Colonne statut déjà présente'' AS information'
);
PREPARE instruction_sql FROM @commande;
EXECUTE instruction_sql;
DEALLOCATE PREPARE instruction_sql;

-- 3. Définir les cinq dossiers système.
-- Une table temporaire disparaît à la fermeture de cette connexion.
DROP TEMPORARY TABLE IF EXISTS migration_types_dossiers;
CREATE TEMPORARY TABLE migration_types_dossiers (
    code VARCHAR(20) NOT NULL PRIMARY KEY,
    nom VARCHAR(50) NOT NULL,
    ancien_nom VARCHAR(50) NOT NULL
);
INSERT INTO migration_types_dossiers (code, nom, ancien_nom) VALUES
('recu', 'Messages reçus', 'Boite de reception'),
('envoye', 'Messages envoyés', 'Elements envoyes'),
('archive', 'Messages archivés', 'Archive'),
('supprime', 'Messages supprimés', 'Elements supprimes'),
('brouillon', 'Brouillons', 'Brouillons');

-- 4. Réutiliser un seul ancien dossier par utilisateur et par type.
-- Si les noms ancien et nouveau existent tous les deux, choisir le nouveau.
-- Les autres dossiers sont conservés.
DROP TEMPORARY TABLE IF EXISTS migration_dossiers_choisis;
CREATE TEMPORARY TABLE migration_dossiers_choisis AS
SELECT d.id_utilisateur, t.code, t.nom,
       COALESCE(
           MIN(CASE WHEN d.nom_dossier = t.nom THEN d.id_dossier END),
           MIN(d.id_dossier)
       ) AS id_dossier
FROM DOSSIER d
JOIN migration_types_dossiers t
    ON d.nom_dossier = t.nom OR d.nom_dossier = t.ancien_nom
WHERE d.type_dossier IS NULL
AND NOT EXISTS (
    SELECT 1 FROM DOSSIER existant
    WHERE existant.id_utilisateur = d.id_utilisateur
      AND existant.type_dossier = t.code
)
GROUP BY d.id_utilisateur, t.code, t.nom;

UPDATE DOSSIER d
JOIN migration_dossiers_choisis choix ON choix.id_dossier = d.id_dossier
SET d.type_dossier = choix.code, d.nom_dossier = choix.nom;

-- 5. Créer seulement les dossiers système manquants.
INSERT INTO DOSSIER (nom_dossier, id_utilisateur, type_dossier)
SELECT t.nom, u.id_utilisateur, t.code
FROM UTILISATEUR u
CROSS JOIN migration_types_dossiers t
LEFT JOIN DOSSIER existant
    ON existant.id_utilisateur = u.id_utilisateur AND existant.type_dossier = t.code
WHERE existant.id_dossier IS NULL;

-- 6. Vérifier l'index séparément de la colonne.
-- Cela répare le cas où une ancienne exécution s'est arrêtée entre les deux.
SET @commande = IF(
    (SELECT COUNT(*) FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND UPPER(table_name) = 'DOSSIER'
       AND index_name = 'dossier_systeme') = 0,
    'ALTER TABLE DOSSIER ADD UNIQUE KEY dossier_systeme (id_utilisateur, type_dossier)',
    'SELECT ''Index dossier_systeme déjà présent'' AS information'
);
PREPARE instruction_sql FROM @commande;
EXECUTE instruction_sql;
DEALLOCATE PREPARE instruction_sql;

-- 7. Créer et remplir les classements personnels.
-- Une ligne représente le classement d'un message dans UNE boîte utilisateur.
-- Le rôle permet d'envoyer à soi-même tout en gardant deux classements distincts.
CREATE TABLE IF NOT EXISTS MESSAGE_UTILISATEUR (
    id_message_utilisateur INT AUTO_INCREMENT PRIMARY KEY,
    id_message INT NOT NULL,
    id_utilisateur INT NOT NULL,
    role_message VARCHAR(20) NOT NULL,
    id_dossier INT NOT NULL,
    est_lu BOOLEAN NOT NULL DEFAULT FALSE,
    id_dossier_restauration INT NULL,
    origine_archive BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE KEY message_boite_role (id_message, id_utilisateur, role_message),
    FOREIGN KEY (id_message) REFERENCES MESSAGE(id_message),
    FOREIGN KEY (id_utilisateur) REFERENCES UTILISATEUR(id_utilisateur),
    FOREIGN KEY (id_dossier) REFERENCES DOSSIER(id_dossier),
    FOREIGN KEY (id_dossier_restauration) REFERENCES DOSSIER(id_dossier)
);

-- Les anciens brouillons restent privés à leur auteur.
UPDATE MESSAGE SET statut = 'brouillon' WHERE etat = 'brouillon';

-- Reclasser les messages existants par rôle, sans utiliser les anciens dossiers incohérents.
INSERT INTO MESSAGE_UTILISATEUR
(id_message, id_utilisateur, role_message, id_dossier, est_lu)
SELECT m.id_message, m.id_expediteur, 'expediteur', d.id_dossier, TRUE
FROM MESSAGE m JOIN DOSSIER d
ON d.id_utilisateur = m.id_expediteur
AND d.type_dossier = CASE WHEN m.statut = 'brouillon' THEN 'brouillon' ELSE 'envoye' END
LEFT JOIN MESSAGE_UTILISATEUR existant
    ON existant.id_message = m.id_message AND existant.role_message = 'expediteur'
WHERE existant.id_message_utilisateur IS NULL;

INSERT INTO MESSAGE_UTILISATEUR
(id_message, id_utilisateur, role_message, id_dossier, est_lu)
SELECT m.id_message, m.id_destinataire, 'destinataire', d.id_dossier, COALESCE(m.est_lu, FALSE)
FROM MESSAGE m JOIN DOSSIER d
ON d.id_utilisateur = m.id_destinataire AND d.type_dossier = 'recu'
LEFT JOIN MESSAGE_UTILISATEUR existant
    ON existant.id_message = m.id_message AND existant.role_message = 'destinataire'
WHERE m.statut <> 'brouillon' AND existant.id_message_utilisateur IS NULL;

-- Les anciennes colonnes MESSAGE.id_dossier et MESSAGE.est_lu sont conservées
-- pour ne pas casser les données d'origine, mais l'application ne les utilise plus.


-- 8. Nettoyer les tables temporaires et rétablir le réglage initial.
DROP TEMPORARY TABLE IF EXISTS migration_dossiers_choisis;
DROP TEMPORARY TABLE IF EXISTS migration_types_dossiers;
SET SESSION SQL_SAFE_UPDATES = @ancien_sql_safe_updates;

-- 9. Afficher les résultats pour vérifier la mise à jour.
SELECT 'Mise à jour terminée' AS resultat;

SELECT id_utilisateur, nom_dossier, type_dossier
FROM DOSSIER
ORDER BY id_utilisateur, id_dossier;

SELECT COUNT(*) AS nombre_messages FROM MESSAGE;
SELECT COUNT(*) AS nombre_classements FROM MESSAGE_UTILISATEUR;
