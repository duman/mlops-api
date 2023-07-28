var express = require('express');
const writeYamlFile = require('write-yaml-file')
const exec = require('await-exec')
const router = express.Router();
const sqlite3 = require('sqlite3');
const replaceInFile = require('replace-in-file');

const namespaces = [
    {
        nsname: 'demo-project',
        cpu: 1,
        gpu: 3,
        memory: 12,
        diskspace: 500,
        teamname: 'Demo'
    },
    {
        nsname: '5-project',
        cpu: 1,
        gpu: 5,
        memory: 2,
        diskspace: 400,
        teamname: 'Demo'
    },
    {
        nsname: 'some-project',
        cpu: 1,
        gpu: 8,
        memory: 12,
        diskspace: 500,
        teamname: 'Demo'
    },
    {
        nsname: '3-project',
        cpu: 1,
        gpu: 3,
        memory: 12,
        diskspace: 500,
        teamname: 'Another Demo'
    },
    {
        nsname: '2-project',
        cpu: 1,
        gpu: 3,
        memory: 12,
        diskspace: 500,
        teamname: 'Demo'
    },
    {
        nsname: '4-project',
        cpu: 1,
        gpu: 3,
        memory: 12,
        diskspace: 500,
        teamname: 'Demo'
    }
]

router.get('/demo/all', async (req, res) => {
    return res.json({projects: namespaces}).status(200);
});

router.post('/', async (req, res) => {
    const {nsname, cpu, memory, gpu, diskspace, teamname, requestBy} = req.body; // Get request payload into respective variables

    let code = 0; // Default code
    let msg = "Success"; // Default message

    let createdAt = new Date(); // Converting dates into the actual date format

    if (!checkValues(req.body, "nsname|cpu|memory|gpu|diskspace|teamname")) { // Check if any payload parameters are missing, and if it is throw an error, and quit.
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

    const team_info = await db_each("SELECT teamname, cpu, mem, gpu, diskspace FROM Teams WHERE teamname = '" + teamname + "'");
    if (team_info.length === 0) {
        return res.status(500).send({message: "Specified team doesn't exists."});
    }

    db.run("CREATE TABLE IF NOT EXISTS Namespaces (id INTEGER PRIMARY KEY, nsname TEXT, cpu TEXT, mem TEXT, gpu TEXT, diskspace TEXT, teamname TEXT)");
    // db.run("CREATE TABLE IF NOT EXISTS TeamNamespace (id INTEGER PRIMARY KEY, teamname TEXT, nsname TEXT)");

    const namespace_info = await db_each("SELECT nsname, cpu, mem, gpu, diskspace FROM Namespaces WHERE teamname = '" + teamname + "'");
    let cpuTotal = 0;
    let memTotal = 0;
    let gpuTotal = 0;
    let diskspaceTotal = 0;
    for (let item of namespace_info) {
        if (item.nsname === nsname) {
            return res.status(500).send({message: "Namsespace with same name already exists in the DB, not changing anything"});
        }
        cpuTotal += Number(item.cpu);
        memTotal += Number(item.mem);
        gpuTotal += Number(item.gpu);
        diskspaceTotal += Number(item.diskspace);
    }

    if (Number(team_info[0].cpu) < Number(cpuTotal) + Number(cpu)*1000) {
        return res.status(500).send({message: "CPU limit exceeded. Available quota: " + String((Number(team_info[0].cpu) - Number(cpuTotal)) / 1000) + " Requested CPU value: " + cpu});
    } else if (Number(team_info[0].mem) < Number(memTotal) + Number(memory)*1000) {
        return res.status(500).send({message: "Memory limit exceeded. Available quota: " + String((Number(team_info[0].mem) - Number(memTotal)) / 1000) + "GB Requested MEM value: " + memory + "GB"});
    } else if (Number(team_info[0].gpu) < Number(gpuTotal) + Number(gpu)) {
        return res.status(500).send({message: "GPU limit exceeded. Available quota: " + String((Number(team_info[0].gpu) - Number(gpuTotal)) / 1000) + " Requested GPU value: " + gpu});
    } else if (Number(team_info[0].diskspace) < Number(diskspaceTotal) + Number(diskspace)*1000) {
        return res.status(500).send({message: "Disk Space limit exceeded. Available quota: " + String((Number(team_info[0].diskspace) - Number(diskspaceTotal)) / 1000) + "GB Requested Disk Space value: " + diskspace + "GB"});
    }

    const namespaceData = {
        apiVersion: "kubeflow.org/v1beta1",
        kind: "Profile",
        metadata: {
            name: nsname
        },
        spec: {
            owner: {
                kind: "User",
                name: "nobody"
            },
            resourceQuotaSpec: {
                hard: {
                    'cpu': String(cpu*1000) + "m", // 1000m = 1 CPU
                    'memory': String(memory*1000) + "Mi", // 1000Mi = 1GB MEM 
                    'nvidia.com/gpu': String(gpu),
                    'requests.storage': String(diskspace*1000) + "Mi" // 1000Mi = 1GB Storage
                }
            }
        }
    }

    await writeYamlFile('./yaml-repo/kubeflow-namespace.yaml', namespaceData);

    await exec("cd yaml-repo && kubectl apply -f kubeflow-namespace.yaml", (error, stdout, stderr) => {
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

    db.run("INSERT INTO Namespaces (nsname, cpu, mem, gpu, diskspace, teamname) VALUES ('" + nsname + "', '" + cpu*1000 + "', '" + memory*1000 + "', '" + gpu + "', '" + diskspace*1000 + "', '" + teamname + "')");
    // db.run("INSERT INTO TeamNamespace (teamname, nsname) VALUES ('" + teamname + "', '" + nsname + "')");

    const options = {
        files: './yaml-repo/dex-yaml.yaml',
        from: /'/g,
        to: '',
    };

    await replaceInFile(options);

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

    return res.status(200).send({message: "User configuration has been generated and applied successfully"});

});

router.patch('/', async (req, res) => {
    const {nsname, cpu, memory, gpu, diskspace, teamname, requestBy} = req.body; // Get request payload into respective variables

    let code = 0; // Default code
    let msg = "Success"; // Default message

    let createdAt = new Date(); // Converting dates into the actual date format

    if (!checkValues(req.body, "nsname|cpu|memory|gpu|diskspace|teamname")) { // Check if any payload parameters are missing, and if it is throw an error, and quit.
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

    const team_info = await db_each("SELECT teamname, cpu, mem, gpu, diskspace FROM Teams WHERE teamname = '" + teamname + "'");
    if (team_info.length === 0) {
        return res.status(500).send({message: "Specified team doesn't exists."});
    }

    const ns_info = await db_each("SELECT nsname, cpu, mem, gpu, diskspace FROM Namespaces WHERE nsname = '" + nsname + "'");
    if (ns_info.length === 0) {
        return res.status(500).send({message: "Specified namespace doesn't exists."});
    }

    db.run("CREATE TABLE IF NOT EXISTS Namespaces (id INTEGER PRIMARY KEY, nsname TEXT, cpu TEXT, mem TEXT, gpu TEXT, diskspace TEXT, teamname TEXT)");
    // db.run("CREATE TABLE IF NOT EXISTS TeamNamespace (id INTEGER PRIMARY KEY, teamname TEXT, nsname TEXT)");

    const namespace_info = await db_each("SELECT nsname, cpu, mem, gpu, diskspace FROM Namespaces WHERE teamname = '" + teamname + "'");
    let cpuTotal = 0;
    let memTotal = 0;
    let gpuTotal = 0;
    let diskspaceTotal = 0;
    for (let item of namespace_info) {
        if (item.nsname === nsname) {
            continue; // so that we skip the current one, as we're going to add it from parameters
        }
        cpuTotal += Number(item.cpu);
        memTotal += Number(item.mem);
        gpuTotal += Number(item.gpu);
        diskspaceTotal += Number(item.diskspace);
    }

    if (Number(team_info[0].cpu) < Number(cpuTotal) + Number(cpu)*1000) {
        return res.status(500).send({message: "CPU limit exceeded. Available quota: " + String((Number(team_info[0].cpu) - Number(cpuTotal)) / 1000) + " Requested CPU value: " + cpu});
    } else if (Number(team_info[0].mem) < Number(memTotal) + Number(memory)*1000) {
        return res.status(500).send({message: "Memory limit exceeded. Available quota: " + String((Number(team_info[0].mem) - Number(memTotal)) / 1000) + "GB Requested memory value: " + memory + "GB"});
    } else if (Number(team_info[0].gpu) < Number(gpuTotal) + Number(gpu)) {
        return res.status(500).send({message: "GPU limit exceeded. Available quota: " + String((Number(team_info[0].gpu) - Number(gpuTotal)) / 1000) + " Requested GPU value: " + gpu});
    } else if (Number(team_info[0].diskspace) < Number(diskspaceTotal) + Number(diskspace)*1000) {
        return res.status(500).send({message: "Disk Space limit exceeded. Available quota: " + String((Number(team_info[0].diskspace) - Number(diskspaceTotal)) / 1000) + "GB Requested Disk Space value: " + diskspace + "GB"});
    }

    const namespaceData = {
        apiVersion: "kubeflow.org/v1beta1",
        kind: "Profile",
        metadata: {
            name: nsname
        },
        spec: {
            owner: {
                kind: "User",
                name: "nobody"
            },
            resourceQuotaSpec: {
                hard: {
                    'cpu': String(cpu*1000) + "m", // 1000m = 1 CPU
                    'memory': String(memory*1000) + "Mi", // 1000Mi = 1GB MEM 
                    'nvidia.com/gpu': String(gpu),
                    'requests.storage': String(diskspace*1000) + "Mi" // 1000Mi = 1GB Storage
                }
            }
        }
    }

    await writeYamlFile('./yaml-repo/kubeflow-namespace.yaml', namespaceData);

    await exec("cd yaml-repo && kubectl apply -f kubeflow-namespace.yaml", (error, stdout, stderr) => {
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

    db.run("UPDATE Namespaces SET cpu = '" + cpu*1000 + "', mem = '" + memory*1000 + "', gpu = '" + gpu + "', diskspace = '" + diskspace*1000 + "' WHERE nsname = '" + nsname + "'");

    const options = {
        files: './yaml-repo/dex-yaml.yaml',
        from: /'/g,
        to: '',
    };

    await replaceInFile(options);

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

    return res.status(200).send({message: "Namespace configuration has been generated and applied successfully"});

});

router.get('/:teamname?', async (req, res) => {

    const nsname = req.params.nsname;
    const teamname = req.params.teamname;

    const db = new sqlite3.Database('test.db');
    if (teamname) {
        if (teamname !== "undefined") {
            let ns_info = await db_each("SELECT nsname, cpu, mem as memory, gpu, diskspace, teamname FROM Namespaces WHERE teamname = '" + teamname + "'");
            if (ns_info.length === 0) {
                return res.status(200).send({projects: ns_info});
            }
            for (let i = 0; i < ns_info.length; i++) {
                ns_info[i].cpu = parseFloat(ns_info[i].cpu) / 1000;
                ns_info[i].memory = parseFloat(ns_info[i].memory) / 1000;
                ns_info[i].diskspace = parseFloat(ns_info[i].diskspace) / 1000;
            }
            return res.status(200).send({projects: ns_info});
        } else {
            let ns_info = await db_each("SELECT nsname, teamname, cpu, mem as memory, gpu, diskspace, teamname FROM Namespaces");
            for (let i = 0; i < ns_info.length; i++) {
                ns_info[i].cpu = parseFloat(ns_info[i].cpu) / 1000;
                ns_info[i].memory = parseFloat(ns_info[i].memory) / 1000;
                ns_info[i].diskspace = parseFloat(ns_info[i].diskspace) / 1000;
            }
            
            return res.status(200).send({projects: ns_info});
        }
    } else {
        let ns_info = await db_each("SELECT nsname, teamname, cpu, mem as memory, gpu, diskspace, teamname FROM Namespaces");
        for (let i = 0; i < ns_info.length; i++) {
            ns_info[i].cpu = parseFloat(ns_info[i].cpu) / 1000;
            ns_info[i].memory = parseFloat(ns_info[i].memory) / 1000;
            ns_info[i].diskspace = parseFloat(ns_info[i].diskspace) / 1000;
        }
          
        return res.status(200).send({projects: ns_info});
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

router.delete('/:nsname?', async (req, res) => {
    // exec -> kubectl delete profiles <<namespace_name>> after deleting it from the DB
    // First check if the namespace that wants to be deleted exists or not
    // Add another check for team-namespace correlation. Because if a team-lead from a different team wants to delete an ns that doesn't belong, they shouldn't

    const nsname = req.params.nsname;

    /*
    if (!checkValues(req.body, "nsname")) { // Check if any payload parameters are missing, and if it is throw an error, and quit.
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
 
    return res.status(200).send({message: "Namespace has been successfully removed from the table."});

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
