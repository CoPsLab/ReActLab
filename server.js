// load config from file if not in production mode
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

// load modules
const fs = require('fs');
const path = require('path');

// these should be the only relevant settings in here:
// path at which the website is accessible
let baseURL = process.env.BASE_URL || '/';
if (baseURL != '/' && baseURL.endsWith('/'))
    baseURL = baseURL.substr(0, baseURL.length - 1);

const privatePrefix = 'private';

// folder for stored csv files and db
const dataFolder = (process.env.DATA_DIR || '/data').replace('/', path.sep);

// port for the server
const port = process.env.PORT || 58080;

// the interface on which the server will listen for requests
const interface = process.env.INTERFACE || '0.0.0.0';

// folder from which the experiments are read
const experimentFolder = '.' + path.sep + 'experiments';

// initialize express framework
const express = require('express');

// load experiments here
const ExperimentClasses = fs.readdirSync(experimentFolder).filter(x => x.endsWith("-experiment.js")).map(name => {
    const ExperimentClass = require('./experiments/' + name);
    ExperimentClass.experimentModuleId = name.replace('-experiment.js', '');
    ExperimentClass.dataFolder = __dirname + dataFolder + path.sep + ExperimentClass.experimentModuleId;
    ExperimentClass.baseURL = baseURL + ExperimentClass.experimentModuleId;
    return ExperimentClass;
});

// load local components
const ClientCommunication = require('./server/server.js');
const Authentication = require('./server/auth.js');
const Routes = require('./server/routes.js')
const DataBase = require('./server/db');

// create server
const mainApp = express().set('view engine', 'pug');
const server = require('http').Server(mainApp);

const bodyParser = require('body-parser')
mainApp.use(bodyParser.urlencoded({ extended: false }))
mainApp.use(bodyParser.json())

let experimentApp = mainApp;
if (baseURL != '/') {
    experimentApp = express();
    mainApp.use(baseURL, experimentApp);
}

// init redirect to first experiment
Routes.initBase(mainApp, __dirname, baseURL, experimentApp.path() + '/' + (process.env.DEFAULT_EXPERIMENT || ExperimentClasses[0].experimentModuleId), express);


ExperimentClasses.forEach(ExperimentClass => {
    const app = express();
    const privateApp = express();
    // setup views dir
    app.locals.basedir = path.join(__dirname, 'views');
    app.locals.pretty = true;
    privateApp.locals.basedir = path.join(__dirname, 'views');
    privateApp.locals.pretty = true;
    // make sure the data folder exists
    fs.mkdir(ExperimentClass.dataFolder, () => {});
    // install subapp
    const bURL = '/' + ExperimentClass.experimentModuleId;
    experimentApp.use(bURL, app);
    experimentApp.use(bURL + '/' + privatePrefix, privateApp);
    // connect database
    DataBase.connect(ExperimentClass.experimentModuleId, __dirname + dataFolder).then(db => {
        ExperimentClass.db = db;
        const routes = new Routes(ExperimentClass, app, privateApp);
    // static routes have to be done before installing auth (session cookie related issue)
    routes.initStatic(__dirname, express);
    // add authentication functions (after static routes but before other things)
    Authentication.init(privateApp, app.path());
    // start database, init dynamic routes (using db) and finally set up communication with the client

    
        // now init dynamic routes
        routes.initDynamic();
        // setup socket.io connections
        ClientCommunication(server, app.path(), ExperimentClass);
    });
});

// finally start the webserver here
server.listen(port, interface, () => console.log('Listening on ' + server.address().address + ':' + server.address().port));