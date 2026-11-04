// Vérifications d’intégration sur une base MySQL temporaire, sans modifier les données du projet.
// Lancer avec : node tests/api.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const mysql = require("mysql");
const express = require("express");
require("dotenv").config();

const racine = path.resolve(__dirname, "..");
const fichierApp = process.argv[2] ? path.resolve(process.argv[2]) : path.join(racine, "app.js");
const fichierDb = path.join(path.dirname(fichierApp), "db.js");
const baseTest = "codex_messagerie_test_" + process.pid + "_" + Date.now();
const configuration = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 3306
};
const admin = mysql.createConnection(configuration);
let pool;
let serveur;
let baseCreee = false;
let nombreRequetes = 0;
const erreursServeur = [];
const requetesEnErreur = [];
let erreurCommit = false;
let erreurDebut = false;
let erreurConnexion = false;

function sql(connexion, texte, valeurs = []) {
    return new Promise((resolve, reject) => {
        connexion.query(texte, valeurs, (err, results) => err ? reject(err) : resolve(results));
    });
}

function fermer(connexion) {
    return new Promise((resolve, reject) => connexion.end(err => err ? reject(err) : resolve()));
}

function charger(fichier, dependances) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(fichier, "utf8"), {
        module,
        exports: module.exports,
        __dirname: racine,
        console: { log() {}, error(err) { erreursServeur.push(err); } },
        process,
        require(nom) { return dependances[nom] || require(nom); }
    }, { filename: fichier });
    return module.exports;
}

// Injecter des erreurs contrôlées pour vérifier aussi rollback et la libération des connexions.
function preparerPool(options) {
    pool = mysql.createPool({ ...options, database: baseTest, connectionLimit: 3 });
    pool.on("connection", connexion => {
        connexion.query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ONLY_FULL_GROUP_BY,NO_ENGINE_SUBSTITUTION'");
    });
    const obtenir = pool.getConnection.bind(pool);
    pool.getConnection = callback => {
        if (erreurConnexion) {
            erreurConnexion = false;
            return setImmediate(() => callback(new Error("Connexion indisponible (test)")));
        }
        obtenir((err, connexion) => {
            if (err) return callback(err);
            if (!connexion.testPrepare) {
                connexion.testPrepare = true;
                const query = connexion.query.bind(connexion);
                const commit = connexion.commit.bind(connexion);
                const begin = connexion.beginTransaction.bind(connexion);
                connexion.query = (texte, valeurs, cb) => {
                    const index = requetesEnErreur.findIndex(fragment => typeof texte === "string" && texte.includes(fragment));
                    if (index !== -1) {
                        requetesEnErreur.splice(index, 1);
                        return setImmediate(() => cb(new Error("Requête interrompue (test)")));
                    }
                    return query(texte, valeurs, cb);
                };
                connexion.commit = cb => {
                    if (erreurCommit) {
                        erreurCommit = false;
                        return setImmediate(() => cb(new Error("Commit interrompu (test)")));
                    }
                    return commit(cb);
                };
                connexion.beginTransaction = cb => {
                    if (erreurDebut) {
                        erreurDebut = false;
                        return setImmediate(() => cb(new Error("Début interrompu (test)")));
                    }
                    return begin(cb);
                };
            }
            callback(null, connexion);
        });
    };
    return pool;
}

async function verifierAPI() {
    assert.match(baseTest, /^codex_messagerie_test_\d+_\d+$/);
    // Copier uniquement la structure des cinq tables, jamais les données des utilisateurs.
    await sql(admin, "CREATE DATABASE " + mysql.escapeId(baseTest));
    baseCreee = true;
    for (const table of ["UTILISATEUR", "CONTACT", "DOSSIER", "MESSAGE", "MESSAGE_UTILISATEUR"]) {
        const source = mysql.escapeId(process.env.DB_NAME) + "." + mysql.escapeId(table);
        const creation = await sql(admin, "SHOW CREATE TABLE " + source);
        await sql(admin, "USE " + mysql.escapeId(baseTest));
        await sql(admin, creation[0]["Create Table"]);
        await sql(admin, "ALTER TABLE " + mysql.escapeId(table) + " AUTO_INCREMENT = 1");
    }
    // Fixer les contraintes des scénarios de doublon uniquement dans la base de test.
    await sql(admin, "ALTER TABLE DOSSIER ADD UNIQUE KEY test_nom_dossier (nom_dossier, id_utilisateur)");
    await sql(admin, "ALTER TABLE UTILISATEUR ADD UNIQUE KEY test_courriel (courriel)");
    await sql(admin, "INSERT INTO UTILISATEUR (nom, prenom, courriel, photo_profil) VALUES ('Test', 'Alice', 'alice@test.invalid', ''), ('Test', 'Bob', 'bob@test.invalid', '')");
    for (const utilisateur of [1, 2]) {
        for (const type of ["recu", "envoye", "brouillon", "archive", "supprime"]) {
            await sql(admin, "INSERT INTO DOSSIER (nom_dossier, id_utilisateur, type_dossier) VALUES (?, ?, ?)", [type, utilisateur, type]);
        }
    }

    const db = charger(fichierDb, { mysql: { createPool: preparerPool } });
    function expressTest() {
        const app = express();
        const listen = app.listen.bind(app);
        app.listen = () => {
            serveur = listen(0, "127.0.0.1");
            return serveur;
        };
        return app;
    }
    Object.assign(expressTest, express);
    charger(fichierApp, { express: expressTest, "./db": db });
    if (!serveur.listening) await new Promise(resolve => serveur.once("listening", resolve));
    const origine = "http://127.0.0.1:" + serveur.address().port;

    async function demande(methode, route, utilisateur, donnees, statut = 200) {
        const url = origine + route + (utilisateur === null ? "" : (route.includes("?") ? "&" : "?") + "utilisateur=" + utilisateur);
        const reponse = await fetch(url, {
            method: methode,
            headers: donnees === undefined ? {} : { "Content-Type": "application/json" },
            body: donnees === undefined ? undefined : JSON.stringify(donnees),
            signal: AbortSignal.timeout(10000)
        });
        const texte = await reponse.text();
        assert.equal(reponse.status, statut, methode + " " + route + " : " + texte);
        nombreRequetes++;
        if (route.startsWith("/api")) {
            assert.match(reponse.headers.get("content-type"), /application\/json/);
            return JSON.parse(texte);
        }
        return texte;
    }
    const get = (route, u = 1, statut = 200) => demande("GET", route, u, undefined, statut);
    const post = (route, u, body, statut = 200) => demande("POST", route, u, body, statut);
    const put = (route, u, body, statut = 200) => demande("PUT", route, u, body, statut);
    const del = (route, u = 1, statut = 200) => demande("DELETE", route, u, undefined, statut);
    const patch = (id, u, action, destination, statut = 200) => demande("PATCH", "/api/messages/" + id, u, { action, id_dossier: destination }, statut);
    const dossiers = await get("/api/dossiers");
    const dossiersBob = await get("/api/dossiers", 2);
    const dossier = (type, u = 1) => (u === 1 ? dossiers : dossiersBob).find(d => d.type_dossier === type).id_dossier;
    const messages = (type, u = 1) => get("/api/messages?dossier=" + dossier(type, u), u);
    const contenu = { action: "envoyer", objet: " Objet test ", contenu: " Texte test ", id_destinataire: 2 };

    assert.match(await get("/", null), /<html/);
    assert.match(await get("/style.css", null), /box-sizing/);
    assert.match(await get("/images/profil.svg", null), /<svg/);
    assert.equal((await get("/api/utilisateurs", null)).length, 2);
    assert.equal(dossiers.length, 5);
    assert.ok(dossiers.every(d => d.nombre_messages === 0));
    for (const u of [null, 0, "01", "abc", "1 OR 1=1"]) await get("/api/dossiers", u, 400);
    await get("/api/dossiers", 999, 404);
    await get("/api/inconnue", 1, 404);
    await get("/api/messages?dossier=" + dossier("recu", 2), 1, 404);
    await get("/api/messages?dossier=999", 1, 404);

    const personnel = await post("/api/dossiers", 1, { nom_dossier: " Personnel ", commentaire: " Note " });
    await post("/api/dossiers", 1, { nom_dossier: "" }, 400);
    await post("/api/dossiers", 1, { nom_dossier: "x".repeat(51) }, 400);
    await post("/api/dossiers", 1, { nom_dossier: "Personnel" }, 500);
    await put("/api/dossiers/" + personnel.id, 2, { nom_dossier: "Autre" }, 404);
    await put("/api/dossiers/" + dossier("recu"), 1, { nom_dossier: "Interdit" }, 400);
    await del("/api/dossiers/" + dossier("recu"), 1, 400);
    await put("/api/dossiers/" + personnel.id, 1, { nom_dossier: "Travail", commentaire: "Modifié" });

    await post("/api/messages", 1, {}, 400);
    await post("/api/messages", 1, { ...contenu, objet: "" }, 400);
    await post("/api/messages", 1, { ...contenu, contenu: 12 }, 400);
    await post("/api/messages", 1, { ...contenu, objet: "x".repeat(151) }, 400);
    await post("/api/messages", 1, { ...contenu, id_destinataire: null }, 400);
    await post("/api/messages", 1, { ...contenu, id_destinataire: "abc" }, 400);
    await post("/api/messages", 1, { ...contenu, id_destinataire: 999 }, 400);
    const envoye = await post("/api/messages", 1, contenu);
    let auteur = (await messages("envoye"))[0];
    let recu = (await messages("recu", 2))[0];
    assert.equal(auteur.id_message, envoye.id);
    assert.equal(recu.id_message, envoye.id);
    assert.equal(auteur.objet, "Objet test");
    assert.equal(auteur.contenu, "Texte test");
    assert.equal(auteur.est_lu, 1);
    assert.equal(recu.est_lu, 0);
    assert.equal((await get("/api/dossiers"))[1].nombre_messages, 1);
    await patch(recu.id_message_utilisateur, 1, "lu", undefined, 404);
    await patch(recu.id_message_utilisateur, 2, "lu");
    assert.equal((await messages("recu", 2))[0].est_lu, 1);
    await patch(recu.id_message_utilisateur, 2, "non_lu");
    assert.equal((await messages("recu", 2))[0].est_lu, 0);
    await patch(auteur.id_message_utilisateur, 1, "inconnue", undefined, 400);
    await patch(auteur.id_message_utilisateur, 1, "restaurer", undefined, 400);
    await patch(auteur.id_message_utilisateur, 1, "deplacer", dossier("recu"), 400);
    await patch(auteur.id_message_utilisateur, 1, "deplacer", dossier("recu", 2), 404);

    await patch(auteur.id_message_utilisateur, 1, "archiver");
    await patch(auteur.id_message_utilisateur, 1, "deplacer", personnel.id);
    await del("/api/dossiers/" + personnel.id, 1, 400);
    await patch(auteur.id_message_utilisateur, 1, "supprimer");
    assert.equal((await messages("recu", 2)).length, 1);
    await patch(auteur.id_message_utilisateur, 1, "lu", undefined, 400);
    await patch(auteur.id_message_utilisateur, 1, "restaurer");
    assert.equal((await messages("archive")).length, 1);
    await patch(auteur.id_message_utilisateur, 1, "deplacer", dossier("envoye"));
    await patch(auteur.id_message_utilisateur, 1, "deplacer", personnel.id);
    await patch(auteur.id_message_utilisateur, 1, "supprimer");
    await patch(auteur.id_message_utilisateur, 1, "restaurer");
    assert.equal((await messages("envoye")).length, 1);
    await del("/api/dossiers/" + personnel.id);
    await del("/api/dossiers/" + personnel.id, 1, 404);

    await post("/api/messages", 1, { action: "brouillon", objet: "", contenu: "" }, 400);
    const brouillon = await post("/api/messages", 1, { action: "brouillon", objet: "À finir", contenu: "" });
    const brouillons = await messages("brouillon");
    const idBrouillon = brouillons[0].id_message_utilisateur;
    assert.equal(brouillons[0].id_destinataire, null);
    assert.equal((await messages("recu", 2)).length, 1);
    for (const action of ["lu", "non_lu", "deplacer", "archiver"]) await patch(idBrouillon, 1, action, dossier("envoye"), 400);
    await put("/api/messages/" + idBrouillon + "/brouillon", 2, contenu, 404);
    await put("/api/messages/" + idBrouillon + "/brouillon", 1, { action: "inconnue" }, 400);
    await patch(idBrouillon, 1, "supprimer");
    await put("/api/messages/" + idBrouillon + "/brouillon", 1, contenu, 400);
    await patch(idBrouillon, 1, "restaurer");
    await put("/api/messages/" + idBrouillon + "/brouillon", 1, { action: "brouillon", objet: "", contenu: "Suite" });
    assert.equal((await messages("brouillon"))[0].contenu, "Suite");

    // Deux envois concurrents : un seul doit réussir, l’autre doit être refusé.
    const envois = await Promise.all([1, 2].map(() => fetch(origine + "/api/messages/" + idBrouillon + "/brouillon?utilisateur=1", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(contenu), signal: AbortSignal.timeout(10000)
    })));
    assert.deepEqual(envois.map(r => r.status).sort(), [200, 400]);
    for (const reponse of envois) await reponse.json();
    nombreRequetes += 2;
    assert.equal((await messages("brouillon")).length, 0);
    const receptions = await messages("recu", 2);
    assert.equal(receptions.filter(m => m.id_message === brouillon.id).length, 1);
    await put("/api/messages/" + auteur.id_message_utilisateur + "/brouillon", 1, contenu, 400);

    const soi = await post("/api/messages", 1, { ...contenu, id_destinataire: 1 });
    assert.equal((await messages("envoye")).filter(m => m.id_message === soi.id).length, 1);
    assert.equal((await messages("recu")).filter(m => m.id_message === soi.id).length, 1);

    const contact = { nom: " Contact ", prenom: " Exemple ", courriel: "contact@test.invalid", photo_profil: "", telephone: "5141234567", type_telephone: "mobile" };
    await post("/api/contacts", 1, { ...contact, telephone: "12" }, 400);
    await post("/api/contacts", 1, { ...contact, courriel: "incorrect" }, 400);
    await post("/api/contacts", 1, { ...contact, type_telephone: "autre" }, 400);
    await post("/api/contacts", 1, { ...contact, photo_profil: "x".repeat(256) }, 400);
    await post("/api/contacts", 1, contact);
    const carnet = await get("/api/contacts");
    assert.equal(carnet[0].nom, "Contact");
    assert.equal((await get("/api/contacts", 2)).length, 0);
    await put("/api/contacts/" + carnet[0].id_contact, 2, contact, 404);
    await del("/api/contacts/" + carnet[0].id_contact, 2, 404);
    await put("/api/contacts/" + carnet[0].id_contact, 1, { ...contact, prenom: "Changé" });
    assert.equal((await get("/api/contacts"))[0].prenom, "Changé");
    await del("/api/contacts/" + carnet[0].id_contact);
    assert.equal((await get("/api/contacts")).length, 0);
    const profil = { nom: " Nouveau ", prenom: " Alice ", courriel: "nouveau@test.invalid", photo_profil: "photo.svg" };
    await put("/api/profil", 1, { ...profil, nom: "" }, 400);
    await put("/api/profil", 1, { ...profil, courriel: "bob@test.invalid" }, 500);
    await put("/api/profil", 1, profil);
    assert.equal((await get("/api/profil")).nom, "Nouveau");
    assert.equal((await get("/api/profil", 2)).prenom, "Bob");

    // Faire échouer la réception après l’insertion du message et vérifier que tout est annulé.
    const avant = await sql(admin, "SELECT COUNT(*) AS total FROM MESSAGE");
    requetesEnErreur.push("'destinataire'");
    await post("/api/messages", 1, contenu, 500);
    assert.equal((await sql(admin, "SELECT COUNT(*) AS total FROM MESSAGE"))[0].total, avant[0].total);
    assert.equal((await sql(admin, "SELECT COUNT(*) AS total FROM MESSAGE_UTILISATEUR mu LEFT JOIN MESSAGE m ON m.id_message = mu.id_message WHERE m.id_message IS NULL"))[0].total, 0);

    // Retirer un dossier de réception dans la base de test pour vérifier le même rollback sans erreur SQL simulée.
    await sql(admin, "INSERT INTO UTILISATEUR (nom, prenom, courriel) VALUES ('Test', 'SansDossiers', 'sans@test.invalid')");
    await post("/api/messages", 1, { ...contenu, id_destinataire: 3 }, 409);
    assert.equal((await sql(admin, "SELECT COUNT(*) AS total FROM MESSAGE"))[0].total, avant[0].total);

    // Vérifications propres à la version avec callbacks et à la lecture du JSON.
    if (!process.argv[2]) {
        erreurCommit = true;
        await post("/api/messages", 1, contenu, 500);
        assert.equal((await sql(admin, "SELECT COUNT(*) AS total FROM MESSAGE"))[0].total, avant[0].total);
        erreurDebut = true;
        await post("/api/messages", 1, contenu, 500);
        erreurConnexion = true;
        await get("/api/dossiers", 1, 500);
        const invalide = await fetch(origine + "/api/messages?utilisateur=1", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: "{", signal: AbortSignal.timeout(10000)
        });
        assert.equal(invalide.status, 400);
        assert.equal((await invalide.json()).error, "Les données JSON sont incorrectes.");
        nombreRequetes++;
    }

    // Plus de demandes que de connexions disponibles : détecter une connexion oubliée après une erreur.
    for (let i = 0; i < 8; i++) await post("/api/messages", 1, { action: "brouillon", objet: "", contenu: "" }, 400);
    await post("/api/messages", 1, contenu);
    console.log(nombreRequetes + " requêtes HTTP vérifiées : messages, brouillons, concurrence, dossiers, contacts, profil et erreurs.");
}

(async () => {
    try {
        await verifierAPI();
    } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
    } finally {
        if (serveur) await new Promise(resolve => serveur.close(resolve));
        if (pool) await fermer(pool);
        if (baseCreee) {
            // Supprimer uniquement la base temporaire créée par ce test.
            assert.match(baseTest, /^codex_messagerie_test_\d+_\d+$/);
            assert.notEqual(baseTest, process.env.DB_NAME);
            await sql(admin, "DROP DATABASE " + mysql.escapeId(baseTest));
            console.log("Base temporaire supprimée. Les données du projet n’ont pas été modifiées.");
        }
        await fermer(admin);
    }
})();
