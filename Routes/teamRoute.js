const express = require('express');
const exec = require('await-exec')
const router = express.Router();
const sqlite3 = require('sqlite3');

let teams = [
    {
        name: 'Demo',
        cpu: 2,
        memory: 4,
        gpu: 2,
        diskSpace: 250
    },
    {
        name: 'Another Demo',
        cpu: 6,
        memory: 64,
        gpu: 3,
        diskSpace: 512
    },
    {
        name: 'Some Demo',
        cpu: 4,
        memory: 16,
        gpu: 3,
        diskSpace: 600
    },
    {
        name: 'Another Some Demo',
        cpu: 4,
        memory: 8,
        gpu: 3,
        diskSpace: 600
    },
    {
        name: 'Some Demo Too',
        cpu: 2,
        memory: 16,
        gpu: 3,
        diskSpace: 600
    }
]

let leads = [
    {id: 1, name: 'Özgür Gökmen', team: 'Demo', ldapGroup: 'DemoGroup'},
    {id: 2, name: 'Özgür Gökmen', team: 'Demo', ldapGroup: 'DemoGroup'},
    {id: 3, name: 'Özgür Gökmen', team: 'Demo', ldapGroup: 'DemoGroup'},
    {id: 4, name: 'Özgür Gökmen', team: 'Demo', ldapGroup: 'DemoGroup'},
    {id: 5, name: 'Özgür Gökmen', team: 'Demo', ldapGroup: 'DemoGroup'},
    {id: 6, name: 'Tuğberk Kaan Duman', team: 'Demo', ldapGroup: 'DemoGroup'},
]

router.get('/available-resources', async (req, res) => {
    return res.json({
        cpu: [2, 4, 8, 16, 32, 64, 128, 256],
        gpu: [0],
        memory: [4, 8, 16, 32, 64, 128, 256, 512],
        diskSpaces: [8, 16, 32, 64, 128, 256, 512, 1024, 2048],
    });
});

router.post('/demo/create', async (req, res) => {
    teams.push(req.body);
    return res.json({message: 'Success'}).status(201);
});

router.get('/demo/all', async (req, res) => {
    return res.json({teams, leads}).status(200);
});

router.get('/demo/names', async (req, res) => {
    return res.json(teams.map(value => value.name)).status(200);
});

router.delete('/lead/delete/:id', async (req, res) => {
    const earlyReturn = false;
    try {
        if (earlyReturn)
            throw new Error("Unable To Delete Lead");

        leads = leads.filter(value => value.id !== parseInt(req.params.id));

        return res.json({teams, leads}).status(204);
    } catch (error) {
        res.status(400).send(error.message)
    }
});

router.post('/lead/create', async (req, res) => {
    leads.push(req.body);

    return res.json({message: 'Success'}).status(200);
});

router.delete('/demo/delete/:teamName', async (req, res) => {
    const earlyReturn = true
    try {
        if (earlyReturn)
            throw new Error("Unable To Delete Team")

        teams = teams.filter(value => value.name !== req.params.teamName)

        return res.json({teams: teams}).status(204);
    } catch (error) {
        res.status(400).send(error.message)
    }
});

router.post('/', async (req, res) => {
    const {teamname, cpu, mem, gpu, diskspace, requestBy} = req.body; // Get request payload into respective variables

    let code = 0; // Default code
    let msg = "Success"; // Default message

    let createdAt = new Date(); // Converting dates into the actual date format

    if (!checkValues(req.body, "teamname|cpu|mem|gpu|diskspace")) { // Check if any payload parameters are missing, and if it is throw an error, and quit.
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

    db.run("CREATE TABLE IF NOT EXISTS Teams (id INTEGER PRIMARY KEY, teamname TEXT, cpu TEXT, mem TEXT, gpu TEXT, diskspace TEXT)");

    const team_info = await db_each("SELECT teamname, cpu, mem, gpu, diskspace FROM Teams");
    for (let item of team_info) {
        if (item.teamname === teamname) {
            return res.status(500).send({message: "Team already exists in the DB, not changing anything"});
        }
    }

    db.run("INSERT INTO Teams (teamname, cpu, mem, gpu, diskspace) VALUES ('" + teamname + "', '" + cpu*1000 + "', '" + mem*1000 + "', '" + gpu + "', '" + diskspace*1000 + "')");

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

    return res.status(200).send({message: "Team has been created successfully"});

});

router.patch('/', async (req, res) => {
    const {teamname, cpu, mem, gpu, diskspace, requestBy} = req.body; // Get request payload into respective variables

    let code = 0; // Default code
    let msg = "Success"; // Default message

    let createdAt = new Date(); // Converting dates into the actual date format

    if (!checkValues(req.body, "teamname|cpu|mem|gpu|diskspace")) { // Check if any payload parameters are missing, and if it is throw an error, and quit.
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

    db.run("CREATE TABLE IF NOT EXISTS Teams (id INTEGER PRIMARY KEY, teamname TEXT, cpu TEXT, mem TEXT, gpu TEXT, diskspace TEXT)");

    const team_info = await db_each("SELECT teamname, cpu, mem, gpu, diskspace FROM Teams WHERE teamname = '" + teamname + "'");
    if (team_info.length === 0) {
        return res.status(500).send({message: "Team cannot be found."});
    }

    db.run("UPDATE Teams SET cpu = '" + cpu*1000 + "', mem = '" + mem*1000 + "', gpu = '" + gpu + "', diskspace = '" + diskspace*1000 + "' WHERE teamname = '" + teamname + "'");

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

    return res.status(200).send({message: "Team has been updated successfully"});

});

router.get('/', async (req, res) => {

    const teamname = req.params.teamname;

    const db = new sqlite3.Database('test.db');
    if (teamname) {
        const team_info = await db_each("SELECT teamname, cpu, mem, gpu, diskspace FROM Teams WHERE teamname = '" + teamname + "'");
        if (team_info.length === 0) {
            return res.status(404).send({message: "Provided team name doesn't exists."})
        }
        return res.status(200).send({teams: team_info});
    } else {
        let team_info = await db_each("SELECT teamname, cpu, mem, gpu, diskspace FROM Teams");
        for (let i = 0; i < team_info.length; i++) {
            team_info[i].cpu = parseFloat(team_info[i].cpu) / 1000;
            team_info[i].mem = parseFloat(team_info[i].mem) / 1000;
            team_info[i].diskspace = parseFloat(team_info[i].diskspace) / 1000;
        }
        return res.status(200).send({teams: team_info});
    }

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

router.get('/ui/:teamname?', async (req, res) => {

    const teamname = req.params.teamname;

    const db = new sqlite3.Database('test.db');
    let teamArr = [];
    if (teamname && teamname !== "undefined") {
        const team_info = await db_each("SELECT teamname, cpu, mem, gpu, diskspace FROM Teams WHERE teamname = '" + teamname + "'");
        if (team_info.length === 0) {
            return res.status(404).send({message: "Provided team name doesn't exists."})
        }
        const teamNames = team_info.map(team => team.teamname);
        return res.status(200).send(teamNames);
    } else {
        const team_info = await db_each("SELECT teamname, cpu, mem, gpu, diskspace FROM Teams");
        const teamNames = team_info.map(team => team.teamname);
        return res.status(200).send(teamNames);
    }

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

router.delete('/:teamname?', async (req, res) => {

    /*
    const {teamname, requestBy} = req.body;

    if (!checkValues(req.body, "teamname")) { // Check if any payload parameters are missing, and if it is throw an error, and quit.
        code = 1;
        msg = "Missing JSON Body value(s).";
        let result = {
            code: code,
            msg: msg
        }
        return res.status(500).send(result);
    }
    */

    const teamname = req.params.teamname;

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

    const db = new sqlite3.Database('test.db');
    await db_each("DELETE FROM Teams WHERE teamname = '" + teamname + "'");
    const ns_info = await db_each("SELECT nsname, cpu, mem, gpu, diskspace, teamname FROM Namespaces WHERE teamname = '" + teamname + "'");
    for (item of ns_info) {
        let nsname = item.nsname;
        await db_each("DELETE FROM Namespaces WHERE nsname = '" + nsname + "'");
        await exec("kubectl delete profiles " + nsname, (error, stdout, stderr) => {
            if (error) {
                console.log(`error: ${error.message}`);
                return;
            }
            if (stderr) {
                console.log(`stderr: ${stderr}`);
                return;
            }
            console.log(`stdout: ${stdout}`);
        });
    }

    // DELETE FROM UserTeam WHERE username = 'ldapuser1@oredata.com' AND teamname = 'test';
    const namespace_info = await db_each("SELECT nsname, cpu, mem, gpu, diskspace FROM Namespaces WHERE teamname = '" + teamname + "'");
    const all_team_members = await db_each("SELECT email, username FROM UserTeam WHERE teamname = '" + teamname + "'");
    for (let member of all_team_members) {
        const email = all_team_members[member].email;
        for (let item of namespace_info) {
            let nsname = item.nsname;
            let replacedEmail = email.replace('@', '-').replace('.', '-');
            let rolename = replacedEmail + '-' + nsname + '-clusterrole-edit';
            await exec("kubectl delete rolebinding -n " + nsname + " " + rolename, (error, stdout, stderr) => {
                if (error) {
                    console.log(`error: ${error.message}`);
                    return;
                }
                if (stderr) {
                    console.log(`stderr: ${stderr}`);
                    return;
                }
                console.log(`stdout: ${stdout}`);
            });
            await exec("kubectl delete authorizationpolicy -n " + nsname + " " + rolename, (error, stdout, stderr) => {
                if (error) {
                    console.log(`error: ${error.message}`);
                    return;
                }
                if (stderr) {
                    console.log(`stderr: ${stderr}`);
                    return;
                }
                console.log(`stdout: ${stdout}`);
            });
            
        }
    }

    const username = await db_each("SELECT username FROM UserRole WHERE teamname = '" + teamname + "'");
    await db_each("DELETE FROM UiUsers WHERE username = '" + username + "'");
    await db_each("DELETE FROM UserTeam WHERE teamname = '" + teamname + "'");
    await db_each("DELETE FROM UserRole WHERE teamname = '" + teamname + "'");

    return res.status(200).send({message: "Team has been successfully removed from the table."});

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
