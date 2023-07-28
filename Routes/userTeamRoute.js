var express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3');

router.get('/:teamname?', async(req, res) => {

    // const username = req.params.username;
    const teamname = req.params.teamname;

    const db = new sqlite3.Database('test.db');
    if (teamname) {
        const user_info = await db_each("SELECT email, username, teamname FROM UserTeam WHERE teamname = '" + teamname + "'");
        if (user_info.length === 0) {
            return res.status(200).send({users: user_info})
        }
        return res.status(200).send({users: user_info});
    } else {
        const user_info = await db_each("SELECT email, username, teamname FROM UserTeam");
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

router.delete('/:username?', async (req, res) => {

    const username = req.params.username;

    if (!checkValues(req.body, "username")) { // Check if any payload parameters are missing, and if it is throw an error, and quit.
        code = 1;
        msg = "Missing JSON Body value(s).";
        let result = {
            code: code,
            msg: msg
        }
        return res.status(500).send(result);
    }

    /*
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
    */

    await db_each("DELETE FROM UserTeam WHERE username = '" + username + "'");

    return res.status(200).send({message: "User has been successfully removed from the team."});

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

module.exports = router;