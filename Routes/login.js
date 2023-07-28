var express = require('express');
const sqlite3 = require('sqlite3');
const twinBcrypt = require('twin-bcrypt')
const router = express.Router();

router.post('/', async(req, res) => {
    const {username, password} = req.body; // Get request payload into respective variables

    let code = 0; // Default code
    let msg = "Success"; // Default message

    let createdAt = new Date(); // Converting dates into the actual date format

    if (!checkValues(req.body, "username|password")) { // Check if any payload parameters are missing, and if it is throw an error, and quit.
        code = 1;
        msg = "Missing JSON Body value(s).";
        let result = {
            code: code,
            msg: msg
        }
        return res.status(500).send(result);
    }
    
    const db = new sqlite3.Database('test.db');
    db.run("CREATE TABLE IF NOT EXISTS UiUsers (id INTEGER PRIMARY KEY, username TEXT, email TEXT, pass TEXT)");

    // console.log("Bcrypt result: ", twinBcrypt.compareSync("test123", "$2y$10$iRQTIJ39rYJxWb.4IbMi9ednmgXKD9lsCqE2QBMjfNZDzZYIYdOry")); // is true

    let logged_in_user_info = await db_each("SELECT pass, username FROM UiUsers WHERE username = '" + username + "' AND pass = '" + password + "'");
    let logged_in_user_role_info = await db_each("SELECT * FROM UserRole WHERE username = '" + username + "'");
    const final_object = Object.assign(logged_in_user_info, logged_in_user_role_info);

    async function db_each(query) {
        return new Promise(function(resolve, reject) {
            db.all(query, function(err, rows){
                if (err) { return reject(err); }
                resolve(rows);
            })
        })
    }

    return res.status(200).send({message: logged_in_user_info});
});

router.post('/create', async(req, res) => {
    const {username, password, team, roleName, requestBy} = req.body; // Get request payload into respective variables

    let code = 0; // Default code
    let msg = "Success"; // Default message

    let createdAt = new Date(); // Converting dates into the actual date format

    if (!checkValues(req.body, "username|password|team|roleName")) { // Check if any payload parameters are missing, and if it is throw an error, and quit.
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

    async function db_each(query) {
        return new Promise(function(resolve, reject) {
            db.all(query, function(err, rows){
                if (err) { return reject(err); }
                resolve(rows);
            })
        })
    }

    db.run("CREATE TABLE IF NOT EXISTS UserRole (id INTEGER PRIMARY KEY, username TEXT, rolename TEXT, teamname TEXT)");

    const user_role_info = await db_each("SELECT username, rolename, teamname FROM UserRole");
    for (let item of user_role_info) {
        if (item.username === username) {
            return res.status(500).send({message: "User Role bind already exists in the DB, not changing anything"});
        }
    }

    db.run("INSERT INTO UiUsers (username, email, pass) VALUES ('" + username + "', '" + username + "', '" + password + "')");

    // const permission_check = await db_each("SELECT username, rolename, description, allowedactions FROM UserRole WHERE username = '" + requestBy + "'");
    // const action_list = JSON.parse(permission_check.allowedactions);

    db.run("INSERT INTO UserRole (username, rolename, teamname) VALUES ('" + username + "', '" + roleName + "', '" + team + "')");

    return res.status(200).send({message: "User configuration has been generated and applied successfully"});

});

router.patch('/create', async(req, res) => {
    const {username, oldusername, team, requestBy} = req.body; // Get request payload into respective variables

    let code = 0; // Default code
    let msg = "Success"; // Default message

    let createdAt = new Date(); // Converting dates into the actual date format

    if (!checkValues(req.body, "username|oldusername|team")) { // Check if any payload parameters are missing, and if it is throw an error, and quit.
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

    async function db_each(query) {
        return new Promise(function(resolve, reject) {
            db.all(query, function(err, rows){
                if (err) { return reject(err); }
                resolve(rows);
            })
        })
    }

    db.run("CREATE TABLE IF NOT EXISTS UserRole (id INTEGER PRIMARY KEY, username TEXT, rolename TEXT, teamname TEXT)");

    // const permission_check = await db_each("SELECT username, rolename, description, allowedactions FROM UserRole WHERE username = '" + requestBy + "'");
    // const action_list = JSON.parse(permission_check.allowedactions);

    db.run("UPDATE UiUsers SET username = '" + username + "' WHERE username = '" + oldusername + "'");
    db.run("UPDATE UserRole SET username = '" + username + "', teamname = '" + team + "' WHERE username = '" + oldusername + "'");

    return res.status(200).send({message: "User configuration has been generated and applied successfully"});

});

router.get('/leads', async(req, res) => {

    const db = new sqlite3.Database('test.db');
    let logged_in_user_info = await db_each("SELECT username FROM UiUsers");
    for (let user of logged_in_user_info) {
        let logged_in_user_role_info = await db_each("SELECT * FROM UserRole WHERE username = '" + user.username + "'");
        if (logged_in_user_role_info.length === 0) {
            continue;
        }
        Object.assign(user, logged_in_user_role_info[0]);

        // Clean-up where we remove unnecessary information and null values
        delete user.id;
        Object.keys(user).forEach(index => (!user[index] && user[index] !== undefined) && delete user[index]);
    }

    // Filter users where only 'team-leads' are taken into consideration
    logged_in_user_info = logged_in_user_info.filter(item => item.rolename === "team-lead");

    // Function to rename keys in an object
    function renameKeys(obj, oldKeys, newKeys) {
        for (const [index, oldKey] of oldKeys.entries()) {
        const newKey = newKeys[index];
        obj[newKey] = obj[oldKey];
        delete obj[oldKey];
        }
    }
    
    // Renaming "username" to "user" and "teamname" to "team" for each object in the array
    for (const item of logged_in_user_info) {
        renameKeys(item, ["username", "teamname"], ["name", "team"]);
    }

    return res.status(200).send({leads: logged_in_user_info});

    async function db_each(query) {
        return new Promise(function(resolve, reject) {
            db.all(query, function(err, rows){
                if (err) { return reject(err); }
                resolve(rows);
            })
        })
    }
});

router.delete('/create/:username?', async (req, res) => {

    const username = req.params.username;

    const db = new sqlite3.Database('test.db');
    await db_each("DELETE FROM UiUsers WHERE username = '" + username + "'");
    await db_each("DELETE FROM UserRole WHERE username = '" + username + "'");

    return res.status(200).send({message: "User has been successfully removed from the table."});

    async function db_each(query) {
        return new Promise(function (resolve, reject) {
            db.all(query, function (err, rows) {
                if (err) {
                    return reject(err);
                }
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