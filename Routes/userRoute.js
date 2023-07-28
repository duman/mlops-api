var express = require('express');
const writeYamlFile = require('write-yaml-file')
const exec = require('await-exec')
const router = express.Router();
const sqlite3 = require('sqlite3');
const twinBcrypt = require('twin-bcrypt')
const replaceInFile = require('replace-in-file');

router.post('/', async(req, res) => {
    const {username, password, email, requestBy} = req.body; // Get request payload into respective variables

    let code = 0; // Default code
    let msg = "Success"; // Default message

    let createdAt = new Date(); // Converting dates into the actual date format

    if (!checkValues(req.body, "username|password|email")) { // Check if any payload parameters are missing, and if it is throw an error, and quit.
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
    
    db.run("CREATE TABLE IF NOT EXISTS Users (id INTEGER PRIMARY KEY, username TEXT, email TEXT, pass TEXT)");

    const user_info = await db_each("SELECT email, pass AS hash, username FROM Users");
    for (let item of user_info) {
        if (item.email === email) {
            return res.status(500).send({message: "User already exists in the DB, not changing anything"});
        }
    }

    const profileData = {
        apiVersion: "kubeflow.org/v1beta1",
        kind: "Profile",
        metadata: {
            name: username
        },
        spec: {
            owner: {
                kind: "User",
                name: email
            }
        }
    }

    await writeYamlFile('./yaml-repo/kubeflow-profile.yaml', profileData);

    let dexYamlData = {
        issuer: "http://dex.auth.svc.cluster.local:5556/dex",
        storage: {
            type: "kubernetes",
            config: {
                inCluster: true
            }
        },
        web: {
            http: "0.0.0.0:5556"
        },
        logger: {
            level: "debug",
            format: "text"
        },
        oauth2: {
            skipApprovalScreen: true
        },
        enablePasswordDB: true,
        staticPasswords: {},
        staticClients: [{
            idEnv: "OIDC_CLIENT_ID",
            redirectURIs: "\[\"/login/oidc\"\]",
            name: "Dex Login Application",
            secretEnv: "OIDC_CLIENT_SECRET"
        }]
    }

    /* Currently disabled as we may not need to create a profile for each new user, they won't have any personal space. Only team-bound spaces
    await exec("cd yaml-repo && kubectl apply -f kubeflow-profile.yaml", (error, stdout, stderr) => {
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
    */

    const passwordHash = twinBcrypt.hashSync(password);

    // console.log("Bcrypt result: ", twinBcrypt.compareSync("test123", "$2y$10$iRQTIJ39rYJxWb.4IbMi9ednmgXKD9lsCqE2QBMjfNZDzZYIYdOry")); // is true

    db.run("INSERT INTO Users (username, email, pass) VALUES ('" + username + "', '" + email + "', '" + passwordHash + "')");

    const updated_user_info = await db_each("SELECT email, pass AS hash, username FROM Users");

    dexYamlData.staticPasswords = updated_user_info;

    await writeYamlFile('./yaml-repo/dex-yaml.yaml', dexYamlData);

    const options = {
        files: './yaml-repo/dex-yaml.yaml',
        from: /'/g,
        to: '',
    };

    await replaceInFile(options);

    await exec("cd yaml-repo && kubectl create configmap dex --from-file=config.yaml=dex-yaml.yaml -n auth --dry-run=client -o yaml | kubectl apply -f - && kubectl rollout restart deployment dex -n auth", (error, stdout, stderr) => {
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

router.patch('/', async(req, res) => {
    // Update password possibility
    const {username, password, email, requestBy} = req.body;

    if (!checkValues(req.body, "username|password|email")) { // Check if any payload parameters are missing, and if it is throw an error, and quit.
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

    const user_info = await db_each("SELECT email, pass AS hash, username FROM Users WHERE username = '" + username + "'");
    if (user_info.length === 0) {
        return res.status(404).send({message: "Provided username doesn't exists."})
    }

    const passwordHash = twinBcrypt.hashSync(password);

    db.run("UPDATE Users SET username = '" + username + "', email = '" + email + "', pass = '" + passwordHash + "' WHERE username = '" + username + "'");

    let dexYamlData = {
        issuer: "http://dex.auth.svc.cluster.local:5556/dex",
        storage: {
            type: "kubernetes",
            config: {
                inCluster: true
            }
        },
        web: {
            http: "0.0.0.0:5556"
        },
        logger: {
            level: "debug",
            format: "text"
        },
        oauth2: {
            skipApprovalScreen: true
        },
        enablePasswordDB: true,
        staticPasswords: {},
        staticClients: [{
            idEnv: "OIDC_CLIENT_ID",
            redirectURIs: "\[\"/login/oidc\"\]",
            name: "Dex Login Application",
            secretEnv: "OIDC_CLIENT_SECRET"
        }]
    }

    const updated_user_info = await db_each("SELECT email, pass AS hash, username FROM Users");
    dexYamlData.staticPasswords = updated_user_info;

    await writeYamlFile('./yaml-repo/dex-yaml.yaml', dexYamlData);

    const options = {
        files: './yaml-repo/dex-yaml.yaml',
        from: /'/g,
        to: '',
    };

    await replaceInFile(options);

    await exec("cd yaml-repo && kubectl create configmap dex --from-file=config.yaml=dex-yaml.yaml -n auth --dry-run=client -o yaml | kubectl apply -f - && kubectl rollout restart deployment dex -n auth", (error, stdout, stderr) => {
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

    return res.status(200).send({message: "User information has been updated."})

    async function db_each(query) {
        return new Promise(function(resolve, reject) {
            db.all(query, function(err, rows){
                if (err) { return reject(err); }
                resolve(rows);
            })
        })
    }
});

router.get('/:username?', async(req, res) => {

    const username = req.params.username;

    const db = new sqlite3.Database('test.db');
    if (username) {
        const user_info = await db_each("SELECT email, username FROM Users WHERE username = '" + username + "'");
        if (user_info.length === 0) {
            return res.status(404).send({message: "Provided username doesn't exists."})
        }
        return res.status(200).send({users: user_info});
    } else {
        const user_info = await db_each("SELECT email, username FROM Users");
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