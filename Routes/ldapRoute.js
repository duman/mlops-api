var express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3');

router.post('/', async(req, res) => {
    const {username, email, requestBy} = req.body; // Get request payload into respective variables

    let code = 0; // Default code
    let msg = "Success"; // Default message

    let createdAt = new Date(); // Converting dates into the actual date format

    if (!checkValues(req.body, "username|email")) { // Check if any payload parameters are missing, and if it is throw an error, and quit.
        code = 1;
        msg = "Missing JSON Body value(s).";
        let result = {
            code: code,
            msg: msg
        }
        return res.status(500).send(result);
    }

    // Authorization Start
    if (!requestBy) {
        return res.status(401).send({message: "Unauthorized request attempt."});
    }

    const db = new sqlite3.Database('test.db');
    const role_info = await db_each("SELECT username, rolename, description, allowedactions FROM UserRole WHERE username = '" + requestBy + "'");
    if (role_info.length === 0) {
        return res.status(404).send({message: "Request owner can't be found."});
    }
    if (role_info[0].rolename !== 'it-admin' && role_info[0].rolename !== 'oredata-admin') {
        return res.status(403).send({message: "Authorization has been failed."});
    }
    // Authorization End
    
    db.run("CREATE TABLE IF NOT EXISTS LdapUsers (id INTEGER PRIMARY KEY, username TEXT, email TEXT)");

    const user_info = await db_each("SELECT email, username FROM LdapUsers");
    for (let item of user_info) {
        if (item.email === email) {
            return res.status(500).send({message: "User already exists in the DB, not changing anything"});
        }
    }

    db.run("INSERT INTO LdapUsers (username, email) VALUES ('" + username + "', '" + email + "')");

    async function db_each(query) {
        return new Promise(function(resolve, reject) {
            db.all(query, function(err, rows){
                if (err) { return reject(err); }
                resolve(rows);
            })
        })
    }

    return res.status(200).send({message: "User configuration has been generated and applied successfully"});

});

router.get('/:username?', async(req, res) => {

    const username = req.params.username;

    const db = new sqlite3.Database('test.db');
    if (username) {
        const user_info = await db_each("SELECT email, username FROM LdapUsers WHERE username = '" + username + "'");
        if (user_info.length === 0) {
            return res.status(404).send({message: "Provided username doesn't exists."})
        }
        return res.status(200).send({users: user_info});
    } else {
        const user_info = await db_each("SELECT email, username FROM LdapUsers");
        return res.status(200).send({users: user_info});
    }

    async function db_each(query) {
        return new Promise(function(resolve, reject) {
            db.all(query, function(err, rows){
                if (err) { return reject(err); }
                resolve(rows);
            })
        })
    }
});

function checkValues(obj, list) {
    if (typeof list === "string") {
        list = list.split("|");
    }
    for (prop of list) {
        let val = obj[prop];
        if (val === null || val === undefined) {
            return false;
        }
    }
    return true;
}

module.exports = router;