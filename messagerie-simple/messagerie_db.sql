CREATE DATABASE messagerie_db;

USE messagerie_db;

CREATE TABLE UTILISATEUR (
    id_utilisateur INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(50),
    prenom VARCHAR(50),
    courriel VARCHAR(100) UNIQUE,
    mot_de_passe VARCHAR(255),
    photo_profil VARCHAR(255)
);


CREATE TABLE CONTACT (
    id_contact INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(50),
    prenom VARCHAR(50),
    courriel VARCHAR(100),
    photo_profil VARCHAR(255),
    telephone VARCHAR(10),
    type_telephone VARCHAR(20),
    id_utilisateur INT,

    FOREIGN KEY (id_utilisateur)
        REFERENCES UTILISATEUR(id_utilisateur)
);

CREATE TABLE DOSSIER (
    id_dossier INT AUTO_INCREMENT PRIMARY KEY,
    nom_dossier VARCHAR(50) NOT NULL,
    commentaire TEXT,
    id_utilisateur INT NOT NULL,

    FOREIGN KEY (id_utilisateur)
        REFERENCES UTILISATEUR(id_utilisateur)
        ON DELETE CASCADE,

    UNIQUE (nom_dossier, id_utilisateur)
);


CREATE TABLE MESSAGE (
    id_message INT AUTO_INCREMENT PRIMARY KEY,
    objet VARCHAR(150),
    contenu TEXT,
    date_heure DATETIME,
    etat VARCHAR(20),
    est_lu BOOLEAN DEFAULT FALSE,
    id_expediteur INT,
    id_destinataire INT,
    id_dossier INT,

    FOREIGN KEY (id_expediteur)
        REFERENCES UTILISATEUR(id_utilisateur),

    FOREIGN KEY (id_destinataire)
        REFERENCES UTILISATEUR(id_utilisateur),

    FOREIGN KEY (id_dossier)
        REFERENCES DOSSIER(id_dossier)
);

INSERT INTO UTILISATEUR
(nom, prenom, courriel, mot_de_passe, photo_profil)
VALUES
('Benali', 'Ahmed', 'ahmed@email.com', 'aaa111', 'ahmed.jpg'),
('Haddad', 'Amina', 'amina@email.com', 'bbb222', 'amina.jpg'),
('Mansouri', 'Youssef', 'youssef@email.com', 'ccc333', 'youssef.jpg'),
('Bensaid', 'Fatima', 'fatima@email.com', 'ddd444', 'fatima.jpg'),
('Amrani', 'Karim', 'karim@email.com', 'eee555', 'karim.jpg');


INSERT INTO CONTACT
(nom, prenom, courriel, photo_profil, telephone, type_telephone, id_utilisateur)
VALUES
('Saidi', 'Ali', 'ali@email.com', 'ali.jpg', '5141111111', 'mobile', 1),
('Brahimi', 'Sara', 'sara@email.com', 'sara.jpg', '5142222222', 'mobile', 1),

('Kaci', 'Nadia', 'nadia@email.com', 'nadia.jpg', '5143333333', 'fixe', 2),
('Meziane', 'Omar', 'omar@email.com', 'omar.jpg', '5144444444', 'mobile', 2),

('Cherif', 'Samir', 'samir@email.com', 'samir.jpg', '5145555555', 'professionnel', 3),
('Taleb', 'Lina', 'lina@email.com', 'lina.jpg', '5146666666', 'mobile', 3),

('Hamdi', 'Rania', 'rania@email.com', 'rania.jpg', '5147777777', 'mobile', 4),
('Merabet', 'Adel', 'adel@email.com', 'adel.jpg', '5148888888', 'fixe', 4),

('Dahmani', 'Imane', 'imane@email.com', 'imane.jpg', '5149999999', 'mobile', 5),
('Salhi', 'Walid', 'walid@email.com', 'walid.jpg', '5141010100', 'professionnel', 5);


INSERT INTO DOSSIER
(nom_dossier, id_utilisateur)
VALUES
-- Dossiers de Ahmed
('Boite de reception', 1),
('Elements supprimes', 1),
('Elements envoyes', 1),
('Brouillons', 1),
('Archive', 1);

UPDATE DOSSIER
SET commentaire = 'Ce dossier contient des informations importantes.'
WHERE id_dossier = 1;

INSERT INTO MESSAGE
(objet, contenu, date_heure, etat, est_lu, id_expediteur, id_destinataire, id_dossier)
VALUES

-- 20 messages reçus
('Bonjour', 'Bonjour Amina, comment vas-tu ?', '2026-09-01 09:00:00', 'recu', FALSE, 1, 2, 1),
('Reunion', 'La reunion commence a 10 heures.', '2026-09-01 09:30:00', 'recu', FALSE, 2, 1, 1),
('Projet', 'Voici les informations du projet.', '2026-09-01 10:00:00', 'recu', FALSE, 3, 1, 1),
('Document', 'Peux-tu verifier le document ?', '2026-09-01 10:30:00', 'recu', FALSE, 4, 1, 1),
('Travail', 'Le travail est termine.', '2026-09-01 11:00:00', 'recu', FALSE, 5, 1, 1),
('Cours', 'Le cours commence demain.', '2026-09-02 08:00:00', 'recu', FALSE, 1, 3, 5),
('Question', 'J ai une question sur le cours.', '2026-09-02 08:30:00', 'recu', FALSE, 2, 3, 5),
('Exercice', 'Voici la correction de exercice.', '2026-09-02 09:00:00', 'recu', FALSE, 4, 3, 5),
('Examen', 'La date de examen est confirmee.', '2026-09-02 09:30:00', 'recu', FALSE, 5, 3, 5),
('Resultat', 'Ton resultat est disponible.', '2026-09-02 10:00:00', 'recu', FALSE, 3, 2, 2),

('Invitation', 'Tu es invite a notre rencontre.', '2026-09-03 11:00:00', 'recu', TRUE, 1, 4, 4),
('Rendez-vous', 'Le rendez-vous est confirme.', '2026-09-03 11:30:00', 'recu', TRUE, 2, 4, 4),
('Information', 'Voici les informations demandees.', '2026-09-03 12:00:00', 'recu', TRUE, 3, 4, 4),
('Confirmation', 'Je confirme ma presence.', '2026-09-03 12:30:00', 'recu', TRUE, 5, 4, 4),
('Absence', 'Je serai absent demain.', '2026-09-03 13:00:00', 'recu', TRUE, 4, 5, 5),
('Rapport', 'Le rapport est disponible.', '2026-09-04 08:00:00', 'recu', TRUE, 1, 5, 5),
('Demande', 'Voici ma nouvelle demande.', '2026-09-04 08:30:00', 'recu', TRUE, 2, 5, 5),
('Modification', 'La modification est terminee.', '2026-09-04 09:00:00', 'recu', TRUE, 3, 5, 5),
('Suivi', 'Je fais un suivi sur le dossier.', '2026-09-04 09:30:00', 'recu', TRUE, 4, 2, 2),
('Merci', 'Merci pour ton aide.', '2026-09-04 10:00:00', 'recu', TRUE, 5, 2, 2),


-- 10 messages envoyés
('Bienvenue', 'Bienvenue dans notre messagerie.', '2026-09-05 08:00:00', 'envoye', TRUE, 1, 2, 3),
('Nouvelle', 'Voici une nouvelle information.', '2026-09-05 08:30:00', 'envoye', TRUE, 1, 3, 3),

('Test 01', 'Je reponds a ton message.', '2026-09-05 09:00:00', 'envoye', TRUE, 2, 1, 3),
('Disponibilite', 'Je suis disponible demain.', '2026-09-05 09:30:00', 'envoye', TRUE, 2, 4, 3),

('Fichier', 'Je viens d’envoyer le fichier.', '2026-09-05 10:00:00', 'envoye', TRUE, 3, 1, 3),
('Correction', 'Voici la correction demandee.', '2026-09-05 10:30:00', 'envoye', TRUE, 3, 5, 3),

('Rencontre', 'La rencontre est prevue vendredi.', '2026-09-05 11:00:00', 'envoye', TRUE, 4, 2, 3),
('Validation', 'Le document est valide.', '2026-09-05 11:30:00', 'envoye', TRUE, 4, 5, 3),

('Fin du projet', 'Le projet est maintenant termine.', '2026-09-05 12:00:00', 'envoye', TRUE, 5, 1, 3),
('Remerciement', 'Merci pour votre participation.', '2026-09-05 12:30:00', 'envoye', TRUE, 5, 3, 3);






SELECT *
FROM UTILISATEUR;

SELECT COUNT(*) AS nombre_utilisateurs
FROM UTILISATEUR;

SELECT *
FROM CONTACT;

SELECT COUNT(*) AS nombre_contacts
FROM CONTACT;


    
SELECT *
FROM CONTACT
WHERE prenom = 'Ali';


SELECT *
FROM DOSSIER;

SELECT *
FROM MESSAGE;

SELECT COUNT(*) AS nombre_messages
FROM MESSAGE;



SELECT
    etat,
    COUNT(*) AS nombre_messages
FROM MESSAGE
GROUP BY etat;

SELECT *
FROM MESSAGE
WHERE etat = 'recu';

SELECT *
FROM MESSAGE
WHERE est_lu = FALSE;


-- Afficher les contacts avec leur propriétaire
SELECT
    CONTACT.prenom AS prenom_contact,
    CONTACT.nom AS nom_contact,
    CONTACT.telephone,
    UTILISATEUR.prenom AS proprietaire
FROM CONTACT
JOIN UTILISATEUR
    ON CONTACT.id_utilisateur = UTILISATEUR.id_utilisateur;

-- Afficher les messages avec les noms  ************
SELECT
    MESSAGE.id_message,
    MESSAGE.objet,
    EXPEDITEUR.prenom AS expediteur,
    DESTINATAIRE.prenom AS destinataire,
    MESSAGE.etat,
    MESSAGE.est_lu,
    MESSAGE.date_heure
FROM MESSAGE
JOIN UTILISATEUR AS EXPEDITEUR
    ON MESSAGE.id_expediteur = EXPEDITEUR.id_utilisateur
JOIN UTILISATEUR AS DESTINATAIRE
    ON MESSAGE.id_destinataire = DESTINATAIRE.id_utilisateur;


-- Afficher les messages avec leur dossier
SELECT
    MESSAGE.id_message,
    MESSAGE.objet,
    MESSAGE.etat,
    DOSSIER.nom_dossier
FROM MESSAGE
JOIN DOSSIER
    ON MESSAGE.id_dossier = DOSSIER.id_dossier;


-- Afficher la boîte de réception
SELECT
    MESSAGE.objet,
    MESSAGE.contenu,
    MESSAGE.est_lu
FROM MESSAGE
JOIN DOSSIER
    ON MESSAGE.id_dossier = DOSSIER.id_dossier
WHERE DOSSIER.nom_dossier = 'Boite de reception';
-- 'Elements supprimes';   'Elements envoyes';   'Archive';


-- Afficher les messages reçus par Ahmed
SELECT
    MESSAGE.objet,
    MESSAGE.contenu,
    MESSAGE.date_heure,
    MESSAGE.est_lu
FROM MESSAGE
JOIN UTILISATEUR
    ON MESSAGE.id_destinataire = UTILISATEUR.id_utilisateur
WHERE UTILISATEUR.prenom = 'Ahmed'
AND MESSAGE.etat = 'recu';


-- Trouver les messages dont le dossier n’appartient pas au destinataire :

SELECT
    MESSAGE.id_message,
    MESSAGE.objet,
    MESSAGE.id_destinataire,
    DOSSIER.id_utilisateur AS proprietaire_dossier
FROM MESSAGE
JOIN DOSSIER
    ON MESSAGE.id_dossier = DOSSIER.id_dossier
WHERE MESSAGE.etat = 'recu'
AND MESSAGE.id_destinataire <> DOSSIER.id_utilisateur;













