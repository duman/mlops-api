var express = require('express');
const writeYamlFile = require('write-yaml-file')
const exec = require('await-exec')
const router = express.Router();
const sqlite3 = require('sqlite3');
const replaceInFile = require('replace-in-file');

router.post('/', async(req, res) => {
    const {username, rolename, teamname, requestBy} = req.body; // Get request payload into respective variables

    let code = 0; // Default code
    let msg = "Success"; // Default message

    let createdAt = new Date(); // Converting dates into the actual date format

    /*
    Possible roles are:
    + it-admin // CRUD team, CRUD namespace, assign-remove members
    + oredata-admin
    + team-lead // CRUD namespace UNDER the team they are assigned to, assign-remove members
    + data-science-admin // no special permissions, just added to all teams by default
    + user // no special permissions
    */

    /*
    Request can look like the following:
    {
        "username": "testuser",
        "rolename": "it-admin",
        "description": "IT Admin has access to all features and is a member of all namespaces",
        "allowedactions": [
            "create-team",
            "update-team",
            "delete-team",
            "create-namespace",
            "update-namespace",
            "delete-namespace",
            "assign-member",
            "remove-member"
        ]
    }
    */

    if (!checkValues(req.body, "username|rolename|teamname")) { // Check if any payload parameters are missing, and if it is throw an error, and quit.
        code = 1;
        msg = "Missing JSON Body value(s).";
        let result = {
            code: code,
            msg: msg
        }
        return res.status(500).send(result);
    }

    let allowedactions = [];

    if (rolename === 'it-admin' || rolename === 'oredata-admin') {
        allowedactions = [
            "create-user",
            "update-user",
            "delete-user",
            "create-team",
            "update-team",
            "delete-team",
            "create-namespace",
            "update-namespace",
            "delete-namespace",
            "assign-member-ns",
            "unassign-member-ns",
            "remove-member"
        ]
    } else if (rolename === 'team-lead') {
        allowedactions = [
            "create-namespace",
            "update-namespace",
            "delete-namespace",
            "assign-member-ns",
            "unassign-member-ns"
        ]
    } 

    // Authorization Start
    if (!requestBy) {
        return res.status(401).send({message: "Unauthorized request attempt."});
    }

    const db = new sqlite3.Database('test.db');
    const role_info_specific = await db_each("SELECT username, rolename FROM UserRole WHERE username = '" + requestBy + "'");
    if (role_info_specific.length === 0) {
        return res.status(404).send({message: "Request owner can't be found."});
    }
    if (role_info_specific[0].rolename !== 'it-admin' && role_info_specific[0].rolename !== 'oredata-admin') {
        return res.status(403).send({message: "Authorization has been failed."});
    }
    // Authorization End

    db.run("CREATE TABLE IF NOT EXISTS UserRole (id INTEGER PRIMARY KEY, username TEXT, rolename TEXT, teamname TEXT)");

    const role_info = await db_each("SELECT username, rolename, teamname FROM UserRole");
    for (let item of role_info) {
        if (item.username === username) {
            return res.status(500).send({message: "User Role bind already exists in the DB, not changing anything"});
        }
    }

    // const permission_check = await db_each("SELECT username, rolename, description, allowedactions FROM UserRole WHERE username = '" + requestBy + "'");
    // const action_list = JSON.parse(permission_check.allowedactions);


    db.run("INSERT INTO UserRole (username, rolename, teamname) VALUES ('" + username + "', '" + rolename + "', '" + teamname + "')");

    async function db_each(query) {
        return new Promise(function(resolve, reject) {
            db.all(query, function(err, rows){
                if (err) { return reject(err); }
                resolve(rows);
            })
        })
    }

    // If role is specified as data-science-admin for some reason, add them into all namespaces
    if (rolename == "data-science-admin") {
        const ns_info = await db_each("SELECT nsname, teamname, cpu, mem, gpu, diskspace, teamname FROM Namespaces");
        const specific_user_info = await db_each("SELECT email, pass AS hash, username FROM Users WHERE username = '" + username + "'");
        const email = specific_user_info[0].email;
        for (let item of ns_info) {
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
    }

    return res.status(200).send({message: "User role bind has been created successfully"});

});

router.delete('/', async(req, res) => {

    const {username, requestBy} = req.body;

    if (!checkValues(req.body, "username")) { // Check if any payload parameters are missing, and if it is throw an error, and quit.
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

    if (username === 'oredata') {
        return res.status(500).send({message: "This is a special system user that can't be deleted."});
    }

    await db_each("DELETE FROM UserRole WHERE username = '" + username + "'");

    return res.status(200).send({message: "User has been successfully removed from UserRole table."});

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