const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const cors = require('cors');
const https = require('https');
const fs = require('fs');

app.use(cors({
    origin: '*'
}));

app.use(
    bodyParser.urlencoded({
        limit: '5mb',
        extended: false
    })
);

app.use(
    bodyParser.json({
        limit: '50mb'
    })
);

app.use(express.json());

// Route
const userRoute = require('./Routes/userRoute');
const ldapRoute = require('./Routes/ldapRoute');
const userTeamRoute = require('./Routes/userTeamRoute');
const teamRoute = require('./Routes/teamRoute');
const namespacesRoute = require('./Routes/namespaceRoute');
const roleRoute = require('./Routes/roleRoute');
const assignUserRoute = require('./Routes/assignUserRoute');
const loginRoute = require('./Routes/login');

// Path
app.use('/users', userRoute);
app.use('/ldap', ldapRoute);
app.use('/user-team', userTeamRoute);
app.use('/teams', teamRoute);
app.use('/namespaces', namespacesRoute);
app.use('/roles', roleRoute);
app.use('/assign-user', assignUserRoute);
app.use('/login', loginRoute);

const PORT = 3032;
const HOST = '127.0.0.1';

module.exports = app;

https
  .createServer(
    {
      key: fs.readFileSync("key.pem"),
      cert: fs.readFileSync("cert.pem"),
    },
    app
  )
  .listen(PORT, () => {
    console.log(`Running on ${HOST}:${PORT}`);
  });