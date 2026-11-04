// Serveur Express de la messagerie.
// Chaque route lit la demande, vérifie les données et répond après la requête SQL.
const express = require("express");
const path = require("path");
const db = require("./db");

const app = express();
const port = 3003;

// Lire les données JSON envoyées par la page HTML.
app.use(express.json());

// 1. Fichiers de la page.
// La page et l’API utilisent le même serveur : cors n’est pas nécessaire ici.
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "exercice1.html"));
});

app.get("/style.css", (req, res) => {
    res.sendFile(path.join(__dirname, "style.css"));
});

app.use("/images", express.static(path.join(__dirname, "images")));

// 2. Fonctions communes de validation et de gestion des erreurs.
function texteValide(valeur, maximum) {
    return typeof valeur === "string" && valeur.trim().length > 0 && valeur.length <= maximum;
}

function idValide(valeur) {
    return /^[1-9][0-9]*$/.test(String(valeur)) && Number.isSafeInteger(Number(valeur));
}

function erreurDemande(message, statut) {
    return { message: message, statut: statut || 400 };
}

function repondreErreur(res, err) {
    if (err.statut) {
        return res.status(err.statut).json({ error: err.message });
    }

    // Garder le détail SQL dans le terminal et envoyer un message lisible à la page.
    console.error(err);
    if (err.code === "ER_DUP_ENTRY") {
        return res.status(500).json({ error: "Ce nom de dossier ou ce courriel existe déjà." });
    }
    res.status(500).json({
        error: "Erreur SQL. Vérifier le terminal et exécuter mise_a_jour_corrigee.sql si nécessaire."
    });
}

// Une transaction regroupe plusieurs requêtes sur la même connexion.
// rollback annule les changements et release rend la connexion au pool.
function annulerTransaction(connexion, res, err) {
    connexion.rollback(() => {
        connexion.release();
        repondreErreur(res, err);
    });
}

// Répondre seulement quand tous les changements ont été enregistrés.
function terminerTransaction(connexion, res, reponse) {
    connexion.commit((err) => {
        if (err) {
            return annulerTransaction(connexion, res, err);
        }
        connexion.release();
        res.json(reponse);
    });
}

// 3. Utilisateurs.
// Cette route passe avant le contrôle /api pour permettre le premier choix d’utilisateur.
app.get("/api/utilisateurs", (req, res) => {
    const sql = "SELECT id_utilisateur, nom, prenom, courriel, photo_profil FROM UTILISATEUR ORDER BY id_utilisateur";
    db.query(sql, [], (err, results) => {
        if (err) {
            return repondreErreur(res, err);
        }
        res.json(results);
    });
});

// Le paramètre ?utilisateur=... choisit une boîte de démonstration ; ce n’est pas une connexion par mot de passe.
app.use("/api", (req, res, next) => {
    if (!idValide(req.query.utilisateur)) {
        return res.status(400).json({ error: "Sélectionner un utilisateur." });
    }
    const sql = "SELECT id_utilisateur FROM UTILISATEUR WHERE id_utilisateur = ?";
    db.query(sql, [req.query.utilisateur], (err, results) => {
        if (err) {
            return repondreErreur(res, err);
        }
        if (results.length === 0) {
            return res.status(404).json({ error: "Utilisateur introuvable." });
        }
        req.utilisateur = Number(req.query.utilisateur);
        if (!req.body) {
            req.body = {};
        }
        next();
    });
});

// 4. Recherches communes aux dossiers et aux messages.
// connexion peut être db pour une lecture ou une connexion réservée à une transaction.
// Les ? sont remplacés par les valeurs du tableau de paramètres.
function lireDossier(connexion, utilisateur, idDossier, callback) {
    const sql = "SELECT * FROM DOSSIER WHERE id_dossier = ? AND id_utilisateur = ?";
    connexion.query(sql, [idDossier, utilisateur], (err, results) => {
        if (err) {
            return callback(err);
        }
        if (results.length === 0) {
            return callback(erreurDemande("Dossier introuvable.", 404));
        }
        callback(null, results[0]);
    });
}

function lireDossierSysteme(connexion, utilisateur, type, callback) {
    const sql = "SELECT * FROM DOSSIER WHERE id_utilisateur = ? AND type_dossier = ?";
    connexion.query(sql, [utilisateur, type], (err, results) => {
        if (err) {
            return callback(err);
        }
        if (results.length === 0) {
            return callback(erreurDemande("Dossiers système absents : exécuter mise_a_jour_corrigee.sql.", 409));
        }
        callback(null, results[0]);
    });
}

// Le contenu est partagé, mais chaque utilisateur possède son propre classement.
// FOR UPDATE verrouille le classement pendant la transaction, notamment pour éviter le double envoi d’un brouillon.
function lireClassement(connexion, utilisateur, idClassement, callback) {
    const sql =
        "SELECT mu.*, d.type_dossier, m.statut " +
        "FROM MESSAGE_UTILISATEUR mu JOIN DOSSIER d ON d.id_dossier = mu.id_dossier " +
        "JOIN MESSAGE m ON m.id_message = mu.id_message " +
        "WHERE mu.id_message_utilisateur = ? AND mu.id_utilisateur = ? FOR UPDATE";
    connexion.query(sql, [idClassement, utilisateur], (err, results) => {
        if (err) {
            return callback(err);
        }
        if (results.length === 0) {
            return callback(erreurDemande("Message introuvable dans cette boîte.", 404));
        }
        callback(null, results[0]);
    });
}

// 5. Afficher les dossiers et leurs compteurs.
app.get("/api/dossiers", (req, res) => {
    // LEFT JOIN garde les dossiers vides. CASE fixe l’ordre des dossiers système.
    const sql =
        "SELECT d.*, COUNT(mu.id_message_utilisateur) AS nombre_messages " +
        "FROM DOSSIER d LEFT JOIN MESSAGE_UTILISATEUR mu ON mu.id_dossier = d.id_dossier " +
        "AND mu.id_utilisateur = d.id_utilisateur WHERE d.id_utilisateur = ? " +
        "GROUP BY d.id_dossier, d.nom_dossier, d.commentaire, d.id_utilisateur, d.type_dossier " +
        "ORDER BY CASE d.type_dossier WHEN 'recu' THEN 1 WHEN 'envoye' THEN 2 " +
        "WHEN 'brouillon' THEN 3 WHEN 'archive' THEN 4 WHEN 'supprime' THEN 5 ELSE 6 END, d.nom_dossier";
    db.query(sql, [req.utilisateur], (err, results) => {
        if (err) {
            return repondreErreur(res, err);
        }
        res.json(results);
    });
});

// Créer un dossier personnel.
app.post("/api/dossiers", (req, res) => {
    const dossier = req.body;
    if (!texteValide(dossier.nom_dossier, 50)) {
        return res.status(400).json({ error: "Saisir le nom du dossier (50 caractères maximum)." });
    }
    let commentaire = "";
    if (typeof dossier.commentaire === "string") {
        commentaire = dossier.commentaire.trim();
    }
    const sql = "INSERT INTO DOSSIER (nom_dossier, commentaire, id_utilisateur) VALUES (?, ?, ?)";
    db.query(sql, [dossier.nom_dossier.trim(), commentaire, req.utilisateur], (err, result) => {
        if (err) {
            return repondreErreur(res, err);
        }
        res.json({ message: "Dossier créé.", id: result.insertId });
    });
});

// Modifier un dossier personnel après vérification de son propriétaire.
app.put("/api/dossiers/:id", (req, res) => {
    const dossier = req.body;
    if (!texteValide(dossier.nom_dossier, 50)) {
        return res.status(400).json({ error: "Saisir le nom du dossier." });
    }
    let commentaire = "";
    if (typeof dossier.commentaire === "string") {
        commentaire = dossier.commentaire.trim();
    }
    db.commencerTransaction((err, connexion) => {
        if (err) {
            return repondreErreur(res, err);
        }
        lireDossier(connexion, req.utilisateur, req.params.id, (err, dossierActuel) => {
            if (err) {
                return annulerTransaction(connexion, res, err);
            }
            if (dossierActuel.type_dossier) {
                return annulerTransaction(connexion, res, erreurDemande("Un dossier système ne peut pas être renommé."));
            }
            const sql = "UPDATE DOSSIER SET nom_dossier = ?, commentaire = ? WHERE id_dossier = ?";
            connexion.query(sql, [dossier.nom_dossier.trim(), commentaire, dossierActuel.id_dossier], (err) => {
                if (err) {
                    return annulerTransaction(connexion, res, err);
                }
                terminerTransaction(connexion, res, { message: "Dossier modifié." });
            });
        });
    });
});

// Supprimer seulement un dossier personnel vide.
app.delete("/api/dossiers/:id", (req, res) => {
    db.commencerTransaction((err, connexion) => {
        if (err) {
            return repondreErreur(res, err);
        }
        lireDossier(connexion, req.utilisateur, req.params.id, (err, dossier) => {
            if (err) {
                return annulerTransaction(connexion, res, err);
            }
            if (dossier.type_dossier) {
                return annulerTransaction(connexion, res, erreurDemande("Un dossier système ne peut pas être supprimé."));
            }
            const sql = "SELECT COUNT(*) AS total FROM MESSAGE_UTILISATEUR WHERE id_dossier = ?";
            connexion.query(sql, [dossier.id_dossier], (err, results) => {
                if (err) {
                    return annulerTransaction(connexion, res, err);
                }
                if (results[0].total > 0) {
                    return annulerTransaction(connexion, res, erreurDemande("Déplacer les messages avant de supprimer ce dossier."));
                }
                connexion.query("DELETE FROM DOSSIER WHERE id_dossier = ?", [dossier.id_dossier], (err) => {
                    if (err) {
                        return annulerTransaction(connexion, res, err);
                    }
                    terminerTransaction(connexion, res, { message: "Dossier supprimé." });
                });
            });
        });
    });
});

// 6. Afficher les messages du dossier choisi.
app.get("/api/messages", (req, res) => {
    lireDossier(db, req.utilisateur, req.query.dossier, (err) => {
        if (err) {
            return repondreErreur(res, err);
        }
        // La jointure du destinataire est facultative pour les brouillons incomplets.
        const sql =
            "SELECT m.id_message, m.objet, m.contenu, m.date_heure, m.statut, " +
            "m.id_expediteur, m.id_destinataire, mu.id_message_utilisateur, mu.role_message, " +
            "mu.est_lu, mu.id_dossier, d.type_dossier, " +
            "CONCAT(e.prenom, ' ', e.nom) AS expediteur, " +
            "CONCAT(r.prenom, ' ', r.nom) AS destinataire " +
            "FROM MESSAGE_UTILISATEUR mu JOIN MESSAGE m ON m.id_message = mu.id_message " +
            "JOIN DOSSIER d ON d.id_dossier = mu.id_dossier " +
            "JOIN UTILISATEUR e ON e.id_utilisateur = m.id_expediteur " +
            "LEFT JOIN UTILISATEUR r ON r.id_utilisateur = m.id_destinataire " +
            "WHERE mu.id_utilisateur = ? AND mu.id_dossier = ? " +
            "ORDER BY m.date_heure DESC, m.id_message DESC";
        db.query(sql, [req.utilisateur, req.query.dossier], (err, results) => {
            if (err) {
                return repondreErreur(res, err);
            }
            res.json(results);
        });
    });
});

// Un brouillon peut être incomplet. Un envoi demande un objet, un contenu et un destinataire.
function verifierMessage(connexion, message, envoi, callback) {
    if (typeof message.objet !== "string" || message.objet.length > 150) {
        return callback(erreurDemande("Objet trop long."));
    }
    if (typeof message.contenu !== "string") {
        return callback(erreurDemande("Contenu incorrect."));
    }
    if (envoi && (!message.objet.trim() || !message.contenu.trim())) {
        return callback(erreurDemande("Remplir l'objet et le contenu."));
    }
    if (!envoi && !message.objet.trim() && !message.contenu.trim()) {
        return callback(erreurDemande("Le brouillon est vide."));
    }
    if (!message.id_destinataire) {
        if (envoi) {
            return callback(erreurDemande("Sélectionner un destinataire."));
        }
        return callback(null);
    }
    if (!idValide(message.id_destinataire)) {
        return callback(erreurDemande("Destinataire incorrect."));
    }
    const sql = "SELECT id_utilisateur FROM UTILISATEUR WHERE id_utilisateur = ?";
    connexion.query(sql, [message.id_destinataire], (err, results) => {
        if (err) {
            return callback(err);
        }
        if (results.length === 0) {
            return callback(erreurDemande("Destinataire introuvable."));
        }
        callback(null);
    });
}

// Créer le classement non lu du destinataire, pour un nouveau message ou un brouillon envoyé.
function ajouterReception(connexion, idMessage, idDestinataire, callback) {
    lireDossierSysteme(connexion, Number(idDestinataire), "recu", (err, dossier) => {
        if (err) {
            return callback(err);
        }
        const sql =
            "INSERT INTO MESSAGE_UTILISATEUR " +
            "(id_message, id_utilisateur, role_message, id_dossier, est_lu) " +
            "VALUES (?, ?, 'destinataire', ?, FALSE)";
        connexion.query(sql, [idMessage, idDestinataire, dossier.id_dossier], callback);
    });
}

// 7. Créer un message ou enregistrer un brouillon.
app.post("/api/messages", (req, res) => {
    const message = req.body;
    if (message.action !== "envoyer" && message.action !== "brouillon") {
        return res.status(400).json({ error: "Action inconnue." });
    }
    const envoi = message.action === "envoyer";
    let statut = "brouillon";
    let confirmation = "Brouillon enregistré.";
    if (envoi) {
        statut = "envoye";
        confirmation = "Message envoyé.";
    }

    // Enregistrer le message et ses classements ensemble, ou tout annuler en cas d’erreur.
    db.commencerTransaction((err, connexion) => {
        if (err) {
            return repondreErreur(res, err);
        }
        verifierMessage(connexion, message, envoi, (err) => {
            if (err) {
                return annulerTransaction(connexion, res, err);
            }
            lireDossierSysteme(connexion, req.utilisateur, statut, (err, dossier) => {
                if (err) {
                    return annulerTransaction(connexion, res, err);
                }
                const sql =
                    "INSERT INTO MESSAGE " +
                    "(objet, contenu, date_heure, etat, statut, id_expediteur, id_destinataire) " +
                    "VALUES (?, ?, NOW(), ?, ?, ?, ?)";
                const valeurs = [
                    message.objet.trim(), message.contenu.trim(), statut, statut,
                    req.utilisateur, message.id_destinataire || null
                ];
                connexion.query(sql, valeurs, (err, result) => {
                    if (err) {
                        return annulerTransaction(connexion, res, err);
                    }
                    const idMessage = result.insertId;
                    const sqlClassement =
                        "INSERT INTO MESSAGE_UTILISATEUR " +
                        "(id_message, id_utilisateur, role_message, id_dossier, est_lu) " +
                        "VALUES (?, ?, 'expediteur', ?, TRUE)";
                    connexion.query(sqlClassement, [idMessage, req.utilisateur, dossier.id_dossier], (err) => {
                        if (err) {
                            return annulerTransaction(connexion, res, err);
                        }
                        // Le brouillon reste dans la boîte de son auteur.
                        if (!envoi) {
                            return terminerTransaction(connexion, res, { message: confirmation, id: idMessage });
                        }
                        ajouterReception(connexion, idMessage, message.id_destinataire, (err) => {
                            if (err) {
                                return annulerTransaction(connexion, res, err);
                            }
                            terminerTransaction(connexion, res, { message: confirmation, id: idMessage });
                        });
                    });
                });
            });
        });
    });
});

// 8. Modifier ou envoyer un brouillon existant.
app.put("/api/messages/:id/brouillon", (req, res) => {
    const message = req.body;
    if (message.action !== "envoyer" && message.action !== "brouillon") {
        return res.status(400).json({ error: "Action inconnue." });
    }
    const envoi = message.action === "envoyer";
    let statut = "brouillon";
    if (envoi) {
        statut = "envoye";
    }
    db.commencerTransaction((err, connexion) => {
        if (err) {
            return repondreErreur(res, err);
        }
        lireClassement(connexion, req.utilisateur, req.params.id, (err, classement) => {
            if (err) {
                return annulerTransaction(connexion, res, err);
            }
            if (classement.statut !== "brouillon" || classement.role_message !== "expediteur" || classement.type_dossier === "supprime") {
                return annulerTransaction(connexion, res, erreurDemande("Seul un brouillon non supprimé peut être modifié."));
            }
            verifierMessage(connexion, message, envoi, (err) => {
                if (err) {
                    return annulerTransaction(connexion, res, err);
                }
                const sql =
                    "UPDATE MESSAGE SET objet = ?, contenu = ?, id_destinataire = ?, " +
                    "statut = ?, etat = ?, date_heure = NOW() WHERE id_message = ?";
                const valeurs = [
                    message.objet.trim(), message.contenu.trim(), message.id_destinataire || null,
                    statut, statut, classement.id_message
                ];
                connexion.query(sql, valeurs, (err) => {
                    if (err) {
                        return annulerTransaction(connexion, res, err);
                    }
                    if (!envoi) {
                        return terminerTransaction(connexion, res, { message: "Brouillon modifié." });
                    }
                    // Déplacer le classement de l’auteur dans les messages envoyés.
                    lireDossierSysteme(connexion, req.utilisateur, "envoye", (err, dossier) => {
                        if (err) {
                            return annulerTransaction(connexion, res, err);
                        }
                        const sqlClassement = "UPDATE MESSAGE_UTILISATEUR SET id_dossier = ? WHERE id_message_utilisateur = ?";
                        connexion.query(sqlClassement, [dossier.id_dossier, classement.id_message_utilisateur], (err) => {
                            if (err) {
                                return annulerTransaction(connexion, res, err);
                            }
                            ajouterReception(connexion, classement.id_message, message.id_destinataire, (err) => {
                                if (err) {
                                    return annulerTransaction(connexion, res, err);
                                }
                                terminerTransaction(connexion, res, { message: "Brouillon envoyé." });
                            });
                        });
                    });
                });
            });
        });
    });
});

// Les actions sur un classement se terminent par une requête suivie d’un commit.
function modifierClassement(connexion, res, sql, valeurs) {
    connexion.query(sql, valeurs, (err) => {
        if (err) {
            return annulerTransaction(connexion, res, err);
        }
        terminerTransaction(connexion, res, { message: "Message mis à jour." });
    });
}

// 9. Marquer comme lu, déplacer, archiver, supprimer ou restaurer.
// Modifier seulement cette boîte, sans modifier le classement du correspondant.
app.patch("/api/messages/:id", (req, res) => {
    db.commencerTransaction((err, connexion) => {
        if (err) {
            return repondreErreur(res, err);
        }
        lireClassement(connexion, req.utilisateur, req.params.id, (err, classement) => {
            if (err) {
                return annulerTransaction(connexion, res, err);
            }
            const action = req.body.action;

            // Dans la corbeille, seule la restauration est autorisée.
            if (classement.type_dossier === "supprime") {
                if (action !== "restaurer") {
                    return annulerTransaction(connexion, res, erreurDemande("Dans la corbeille, seule la restauration est possible."));
                }
                if (!classement.id_dossier_restauration) {
                    return annulerTransaction(connexion, res, erreurDemande("Dossier de restauration manquant."));
                }
                return lireDossier(connexion, req.utilisateur, classement.id_dossier_restauration, (err, dossier) => {
                    if (err) {
                        return annulerTransaction(connexion, res, err);
                    }
                    const sql =
                        "UPDATE MESSAGE_UTILISATEUR SET id_dossier = ?, id_dossier_restauration = NULL " +
                        "WHERE id_message_utilisateur = ?";
                    modifierClassement(connexion, res, sql, [dossier.id_dossier, classement.id_message_utilisateur]);
                });
            }
            if (action === "restaurer") {
                return annulerTransaction(connexion, res, erreurDemande("Ce message n'est pas supprimé."));
            }

            if (action === "lu" || action === "non_lu") {
                if (classement.statut === "brouillon") {
                    return annulerTransaction(connexion, res, erreurDemande("Un brouillon n'a pas d'état de lecture."));
                }
                const sql = "UPDATE MESSAGE_UTILISATEUR SET est_lu = ? WHERE id_message_utilisateur = ?";
                return modifierClassement(connexion, res, sql, [action === "lu", classement.id_message_utilisateur]);
            }

            // Supprimer déplace dans la corbeille sans effacer le contenu partagé.
            if (action === "supprimer") {
                return lireDossierSysteme(connexion, req.utilisateur, "supprime", (err, corbeille) => {
                    if (err) {
                        return annulerTransaction(connexion, res, err);
                    }
                    let typeRetour = "recu";
                    if (classement.statut === "brouillon") {
                        typeRetour = "brouillon";
                    } else if (classement.origine_archive) {
                        typeRetour = "archive";
                    } else if (classement.role_message === "expediteur") {
                        typeRetour = "envoye";
                    }
                    lireDossierSysteme(connexion, req.utilisateur, typeRetour, (err, retour) => {
                        if (err) {
                            return annulerTransaction(connexion, res, err);
                        }
                        const sql =
                            "UPDATE MESSAGE_UTILISATEUR SET id_dossier = ?, id_dossier_restauration = ? " +
                            "WHERE id_message_utilisateur = ?";
                        modifierClassement(connexion, res, sql, [corbeille.id_dossier, retour.id_dossier, classement.id_message_utilisateur]);
                    });
                });
            }
            if (classement.statut === "brouillon") {
                return annulerTransaction(connexion, res, erreurDemande("Un brouillon peut seulement être repris ou supprimé."));
            }

            if (action === "archiver") {
                return lireDossierSysteme(connexion, req.utilisateur, "archive", (err, dossier) => {
                    if (err) {
                        return annulerTransaction(connexion, res, err);
                    }
                    const sql =
                        "UPDATE MESSAGE_UTILISATEUR SET id_dossier = ?, origine_archive = TRUE " +
                        "WHERE id_message_utilisateur = ?";
                    modifierClassement(connexion, res, sql, [dossier.id_dossier, classement.id_message_utilisateur]);
                });
            }
            if (action !== "deplacer") {
                return annulerTransaction(connexion, res, erreurDemande("Action inconnue."));
            }

            lireDossier(connexion, req.utilisateur, req.body.id_dossier, (err, dossier) => {
                if (err) {
                    return annulerTransaction(connexion, res, err);
                }
                let origine = "recu";
                if (classement.role_message === "expediteur") {
                    origine = "envoye";
                }
                if (dossier.type_dossier && dossier.type_dossier !== origine && dossier.type_dossier !== "archive") {
                    return annulerTransaction(connexion, res, erreurDemande("Choisir un dossier personnel, les archives ou le dossier d'origine."));
                }

                // Revenir vers Reçus ou Envoyés annule la provenance Archives.
                // Un dossier personnel conserve cette provenance pour la restauration.
                let archive = Boolean(classement.origine_archive);
                if (dossier.type_dossier === "archive") {
                    archive = true;
                } else if (dossier.type_dossier === origine) {
                    archive = false;
                }
                const sql =
                    "UPDATE MESSAGE_UTILISATEUR SET id_dossier = ?, origine_archive = ? " +
                    "WHERE id_message_utilisateur = ?";
                modifierClassement(connexion, res, sql, [dossier.id_dossier, archive, classement.id_message_utilisateur]);
            });
        });
    });
});

// 10. Vérifications communes au profil et aux contacts.
// Renvoyer un message en cas d’erreur, ou une chaîne vide si les champs sont valides.
function verifierProfil(profil) {
    if (!texteValide(profil.nom, 50) || !texteValide(profil.prenom, 50) || !texteValide(profil.courriel, 100)) {
        return "Vérifier le nom, le prénom et le courriel.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profil.courriel)) {
        return "Vérifier le nom, le prénom et le courriel.";
    }
    if (typeof profil.photo_profil !== "string" || profil.photo_profil.length > 255) {
        return "Photo incorrecte.";
    }
    return "";
}

function verifierContact(contact) {
    const erreur = verifierProfil(contact);
    if (erreur) {
        return erreur;
    }
    if (!/^[0-9]{10}$/.test(contact.telephone)) {
        return "Le téléphone doit contenir 10 chiffres.";
    }
    if (contact.type_telephone !== "mobile" && contact.type_telephone !== "fixe" && contact.type_telephone !== "professionnel") {
        return "Type de téléphone incorrect.";
    }
    return "";
}

// 11. Afficher, ajouter, modifier et supprimer les contacts.
app.get("/api/contacts", (req, res) => {
    const sql = "SELECT * FROM CONTACT WHERE id_utilisateur = ? ORDER BY prenom, nom";
    db.query(sql, [req.utilisateur], (err, results) => {
        if (err) {
            return repondreErreur(res, err);
        }
        res.json(results);
    });
});

app.post("/api/contacts", (req, res) => {
    const contact = req.body;
    const erreur = verifierContact(contact);
    if (erreur) {
        return res.status(400).json({ error: erreur });
    }
    const sql =
        "INSERT INTO CONTACT " +
        "(nom, prenom, courriel, photo_profil, telephone, type_telephone, id_utilisateur) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)";
    const valeurs = [
        contact.nom.trim(), contact.prenom.trim(), contact.courriel.trim(), contact.photo_profil.trim(),
        contact.telephone, contact.type_telephone, req.utilisateur
    ];
    db.query(sql, valeurs, (err) => {
        if (err) {
            return repondreErreur(res, err);
        }
        res.json({ message: "Contact ajouté." });
    });
});

app.put("/api/contacts/:id", (req, res) => {
    const contact = req.body;
    const erreur = verifierContact(contact);
    if (erreur) {
        return res.status(400).json({ error: erreur });
    }
    const sql =
        "UPDATE CONTACT SET nom = ?, prenom = ?, courriel = ?, photo_profil = ?, " +
        "telephone = ?, type_telephone = ? WHERE id_contact = ? AND id_utilisateur = ?";
    const valeurs = [
        contact.nom.trim(), contact.prenom.trim(), contact.courriel.trim(), contact.photo_profil.trim(),
        contact.telephone, contact.type_telephone, req.params.id, req.utilisateur
    ];
    db.query(sql, valeurs, (err, result) => {
        if (err) {
            return repondreErreur(res, err);
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Contact introuvable." });
        }
        res.json({ message: "Contact modifié." });
    });
});

app.delete("/api/contacts/:id", (req, res) => {
    const sql = "DELETE FROM CONTACT WHERE id_contact = ? AND id_utilisateur = ?";
    db.query(sql, [req.params.id, req.utilisateur], (err, result) => {
        if (err) {
            return repondreErreur(res, err);
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Contact introuvable." });
        }
        res.json({ message: "Contact supprimé." });
    });
});

// 12. Afficher et modifier le profil.
app.get("/api/profil", (req, res) => {
    const sql = "SELECT id_utilisateur, nom, prenom, courriel, photo_profil FROM UTILISATEUR WHERE id_utilisateur = ?";
    db.query(sql, [req.utilisateur], (err, results) => {
        if (err) {
            return repondreErreur(res, err);
        }
        res.json(results[0]);
    });
});

app.put("/api/profil", (req, res) => {
    const profil = req.body;
    const erreur = verifierProfil(profil);
    if (erreur) {
        return res.status(400).json({ error: erreur });
    }
    const sql = "UPDATE UTILISATEUR SET nom = ?, prenom = ?, courriel = ?, photo_profil = ? WHERE id_utilisateur = ?";
    const valeurs = [profil.nom.trim(), profil.prenom.trim(), profil.courriel.trim(), profil.photo_profil.trim(), req.utilisateur];
    db.query(sql, valeurs, (err) => {
        if (err) {
            return repondreErreur(res, err);
        }
        res.json({ message: "Profil modifié." });
    });
});

// 13. Routes inconnues et erreurs de lecture du JSON.
app.use("/api", (req, res) => {
    res.status(404).json({ error: "Route API introuvable." });
});

app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Les données JSON sont incorrectes." });
    }
    if (err.status) {
        return res.status(err.status).json({ error: "Impossible de lire la demande." });
    }
    repondreErreur(res, err);
});

// 14. Démarrer le serveur sur la machine locale.
app.listen(port, "127.0.0.1", () => {
    console.log("Messagerie : http://localhost:" + port);
});
