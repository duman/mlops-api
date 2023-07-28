var express = require('express');
const writeYamlFile = require('write-yaml-file')
const exec = require('await-exec')
const router = express.Router();
const sqlite3 = require('sqlite3');
const replaceInFile = require('replace-in-file');

router.post('/', async(req, res) => {
    const {teamname, username, requestBy} = req.body; // Get request payload into respective variables

    let code = 0; // Default code
    let msg = "Success"; // Default message

    let createdAt = new Date(); // Converting dates into the actual date format

    if (!checkValues(req.body, "teamname|username")) { // Check if any payload parameters are missing, and if it is throw an error, and quit.
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
    if (role_info[0].rolename !== 'it-admin' && role_info[0].rolename !== 'oredata-admin' && role_info[0].rolename !== 'team-lead') {
        return res.status(403).send({message: "Authorization has been failed."});
    }
    // Authorization End

    db.run("CREATE TABLE IF NOT EXISTS UserTeam (id INTEGER PRIMARY KEY, teamname TEXT, username TEXT, email TEXT)");

    // Check if team exists
    let isTeamValid = false;
    const team_info = await db_each("SELECT teamname, cpu, mem, gpu, diskspace FROM Teams");
    for (let item of team_info) {
        if (item.teamname === teamname) {
            isTeamValid = true;
        }
    }

    // Check if user exists
    let isUserValid = false;
    const user_info = await db_each("SELECT username, email FROM LdapUsers");
    for (let item of user_info) {
        if (item.username === username) {
            isUserValid = true;
        }
    }

    // Return error if one of them is invalid
    /*
    if (!isTeamValid || !isUserValid) {
        return res.status(500).send({message: "Either team or username provided was invalid."});
    }
    */

    // Check if user record already exists within the UserTeam correlation table
    const userteam_info = await db_each("SELECT teamname, username, email FROM UserTeam WHERE username = '" + username + "' AND teamname = '" + teamname + "'");
    if (userteam_info.length > 0) {
        return res.status(500).send({message: "Given user already exists within the team."});
    }

    // Get all namespaces in the given team, generate authorization yamls and add users into all namespaces under that team
    const namespace_info = await db_each("SELECT nsname, cpu, mem, gpu, diskspace FROM Namespaces WHERE teamname = '" + teamname + "'");
    const specific_user_info = await db_each("SELECT email, username FROM LdapUsers WHERE username = '" + username + "'");
    // const email = specific_user_info[0].email;
    const email = username;

    // Insert into DB if all good
    db.run("INSERT INTO UserTeam (teamname, username, email) VALUES ('" + teamname + "', '" + username + "', '" + email + "')");
    for (let item of namespace_info) {
        let nsname = item.nsname;
        let replacedEmail = email.replace('@', '-').replace('.', '-');

        const when = [
            {
                key: 'request.headers[kubeflow-userid]',
                values: [email],
            }
        ]

        const authorizationPolicyYamlData = {
            apiVersion: 'security.istio.io/v1beta1',
            kind: 'AuthorizationPolicy',
            metadata: {
                annotations: {
                    role: 'edit',
                    user: email
                },
                name: replacedEmail + '-' + nsname + '-clusterrole-edit',
                namespace: nsname,
            },
            spec: {
                action: 'ALLOW',
                rules: {
                    '- when': when
                }
            }
        }

        const apiGroup = [
            {
                apiGroup: 'rbac.authorization.k8s.io',
                kind: 'User',
                name: email
            }
        ]

        const rolebindingPolicyYamlData = {
            apiVersion: 'rbac.authorization.k8s.io/v1',
            kind: 'RoleBinding',
            metadata: {
                annotations: {
                    role: 'edit',
                    user: email
                },
                name: replacedEmail + '-' + nsname + '-clusterrole-edit',
                namespace: nsname,
            },
            roleRef: {
                apiGroup: 'rbac.authorization.k8s.io',
                kind: 'ClusterRole',
                name: 'kubeflow-edit',
            },
            subjects: apiGroup
        }

        await writeYamlFile('./yaml-repo/authorizationpolicy.yaml', authorizationPolicyYamlData);
        await writeYamlFile('./yaml-repo/rolebinding.yaml', rolebindingPolicyYamlData);

        const options1 = {
            files: './yaml-repo/authorizationpolicy.yaml',
            from: /'/g,
            to: '',
        };

        const options2 = {
            files: './yaml-repo/rolebinding.yaml',
            from: /'/g,
            to: '',
        };
    
        await replaceInFile(options1);
        await replaceInFile(options2);

        await exec("cd yaml-repo && kubectl apply -f authorizationpolicy.yaml", (error, stdout, stderr) => {
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
        
        await exec("cd yaml-repo && kubectl apply -f rolebinding.yaml", (error, stdout, stderr) => {
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

    async function db_each(query) {
        return new Promise(function(resolve, reject) {
            db.all(query, function(err, rows){
                if (err) { return reject(err); }
                resolve(rows);
            })
        })
    }

    return res.status(200).send({message: "User has been assigned to a team and all related namespaces successfully"});

});

router.delete('/:username?/:teamname?', async(req, res) => {

    const username = req.params.username;
    const teamname = req.params.teamname;

    /*
    const {username, teamname, requestBy} = req.body;

    if (!checkValues(req.body, "username|teamname")) { // Check if any payload parameters are missing, and if it is throw an error, and quit.
        code = 1;
        msg = "Missing JSON Body value(s).";
        let result = {
            code: code,
            msg: msg
        }
        return res.status(500).send(result);
    }
    */

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
    if (role_info[0].rolename !== 'it-admin' && role_info[0].rolename !== 'oredata-admin' && role_info[0].rolename !== 'team-lead') {
        return res.status(403).send({message: "Authorization has been failed."});
    }
    // Authorization End
    */

    const db = new sqlite3.Database('test.db');
    await db_each("DELETE FROM UserTeam WHERE username = '" + username + "' AND teamname = '" + teamname + "'");
    // DELETE FROM UserTeam WHERE username = 'ldapuser1@oredata.com' AND teamname = 'test';
    const namespace_info = await db_each("SELECT nsname, cpu, mem, gpu, diskspace FROM Namespaces WHERE teamname = '" + teamname + "'");
    const specific_user_info = await db_each("SELECT email, username FROM LdapUsers WHERE username = '" + username + "'");
    // const email = specific_user_info[0].email;
    const email = username;
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

    return res.status(200).send({message: "User has been successfully removed from the team."});

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

function replaceAll(str, find, replace) {
    return str.replace(new RegExp(find, 'g'), replace);
}

module.exports = router;