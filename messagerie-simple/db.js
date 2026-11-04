// db.js : connexion à MySQL et lecture des paramètres de .env.
const mysql = require("mysql");
require("dotenv").config();
const pool = mysql.createPool({
    connectionLimit: 10,
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

// Même utilisation que dans le cours : db.query(sql, valeurs, callback).
function query(sql, valeurs, callback) {
    pool.query(sql, valeurs, callback);
}

// Réserver la même connexion pour toutes les étapes d’une transaction.
// Des appels pool.query séparés risqueraient de changer de connexion en cours de route.
function commencerTransaction(callback) {
    pool.getConnection((err, connexion) => {
        if (err) {
            return callback(err);
        }
        connexion.beginTransaction((err) => {
            if (err) {
                connexion.release();
                return callback(err);
            }
            // app.js exécutera ensuite commit ou rollback, puis release.
            callback(null, connexion);
        });
    });
}

module.exports = {
    query: query,
    commencerTransaction: commencerTransaction
};
