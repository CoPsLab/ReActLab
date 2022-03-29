const networkInterfaces = require('os').networkInterfaces();
const Utils = require('./experiment/experiment-utils');
const validator = require("email-validator");
const QRCode = require('qrcode');
const JSZip = require('jszip');
const path = require('path');
const fs = require('fs');

// local imports
const { sendInvite, displayMailDisabled } = require('./mail');


// get a list of ip adresses for this computer
const ipadresses = []
const portString = (process.env.PORT && process.env.PORT != "80") ? ":" + process.env.PORT : "";
if (process.env.SERVER)
    ipadresses.push({ name: process.env.SERVER, address: process.env.SERVER });
Object.keys(networkInterfaces).forEach(ifname => {
    networkInterfaces[ifname].forEach(iface => {
        // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
        if ('IPv4' == iface.family && iface.internal == false) {
            ipadresses.push({ name: ifname, address: iface.address, port: portString });
        }
    });
});

// folder definitions for phaser and socketio
const publicSocketIOLibFolder = "/node_modules/socket.io-client/dist";
const publicPhaserLibFolder = "/node_modules/phaser/dist";

// some other settings
const emailWidthPx = 300;
const maxMailsAtOnce = 10;

// subfolder which contains public files (html, css, js, images, ...)
const publicFiles = (process.env.PUBLIC_DIR || '/public').replace('/', path.sep);

// the actual routes class
class Routes {
    ExperimentClass = undefined;
    privateApp = undefined;
    app = undefined;

    constructor(ExpClass, app, privateApp) {
        this.ExperimentClass = ExpClass;
        this.privateApp = privateApp;
        this.app = app;
    }

    static initBase(app, baseDir, baseURL, standardURL, express) {
        // forward to main site to standard experiment
        app.get('/', (req, res) => res.redirect(standardURL));
        if (baseURL != '/')
            app.get(baseURL, (req, res) => res.redirect(standardURL));
        // serve public folder (also) under base url
        app.use(baseURL, express.static(baseDir + publicFiles));
    }

    initStatic(baseDir, express) {
        // public is the public for all ;)
        this.app.use('/', express.static(baseDir + publicFiles));
        // redirect socket.io and phaser requests to node modules
        this.app.use('/socket.io', express.static(baseDir + publicSocketIOLibFolder));
        this.app.use('/phaser', express.static(baseDir + publicPhaserLibFolder));
    }

    initDynamic() {
        // shortcuts for easier use 
        const app = this.app;
        const privateApp = this.privateApp;
        const ExperimentClass = this.ExperimentClass;
        const dataFolder = ExperimentClass.dataFolder;
        const privateBaseURL = privateApp.path();
        const baseURL = app.path();

        ///////////////////////////////////////////
        //// experiment unspecific stuff below  ///
        ///////////////////////////////////////////

        // render doc
        app.get('/doc', (req, res) => res.render('doc'));
        // render qr codes
        app.get('/qr/:sessionId', (req, res) => {
            const iface = req.query.interface ? req.query.interface : undefined;
            // override server 
            const serverPath =
                iface ? (req.protocol + '://' + iface + portString) + baseURL :
                    (process.env.SERVER || (req.protocol + '://' + req.get('host'))) + baseURL;
            const toQr = serverPath + '/invitation/' + req.params.sessionId;

            if (req.path.endsWith('png')) {
                res.setHeader("content-type", "image/png");
                return QRCode.toFileStream(res, toQr.substr(0, toQr.length - 4), { width: emailWidthPx }, err => {
                    if (err) console.error(err)
                });
            } else QRCode.toString(toQr, { type: 'svg' }, (err, svg) => {
                if (err) {
                    console.error(err);
                    return res.redirect(baseURL);
                } else {
                    const showInterfaceForm = !process.env.HIDE_QR_INTERFACE_FORM || process.env.HIDE_QR_INTERFACE_FORM.trim() == "false";
                    return res.render('qr', {
                        showInterfaceForm: showInterfaceForm,
                        experimentId: req.params.sessionId,
                        interface: iface,
                        adresses: ipadresses,
                        link: toQr,
                        svg: svg,
                    });
                }
            })
        });

        ////////////////////////////
        //// public stuff below  ///
        ////////////////////////////

        // render main site
        app.get('/', async (req, res) => {
            // get experimentId from get request
            const experimentId = this.getExperimentId(req);
            // put it id the cookies
            if (experimentId)
                res.cookie('sessionId', experimentId, { sameSite: 'Strict', path: baseURL });

            // get basic info for experiment from database
            const experiment = await ExperimentClass.getExperiment(experimentId);
            // check if this is an actual experiment
            if (experiment) {
                // if we got here, the experiment id is an actual experiment (which might be marked as finished, but maybe there is 
                // still an active questionnaire)
                // get experiment data
                const expData = await ExperimentClass.db.getExperimentData(experimentId);
                // this is undefined in case there is no questionnaire id registered in expData
                // in that case the code after this if block is executed
                const formFile = ExperimentClass.getFormFile(expData.questionnaireId);

                // if there was a valid questionnaireId in the data, run the associated questionnaire
                if (formFile) {
                    // create data for form
                    const toSend = {
                        questionnaireId: expData.questionnaireId,
                        insufficientInfo: req.query.err == 1,
                        exp: experimentId,
                        baseURL: baseURL
                    };

                    const questionnaireValues = await ExperimentClass.getExperimentData(experimentId, 'questionnaireValues');
                    const qData = await ExperimentClass.getQuestionnaireData(experimentId, expData.questionnaireId, expData.questionnaireIteration);
                    // finally send the questionnaire    
                    return res.render(formFile, Object.assign(toSend, qData, questionnaireValues.questionnaireValues));
                } else if (experiment.isFinished) {
                    // stop if experiment is finished already
                    return this.showErrorPage(res, baseURL, "Vielen Dank für Ihre Teilnahme!", 15, baseURL + '/abort');
                }

            }


            // check if the client is from a nice network
            const clientIP = (req.headers['x-forwarded-for'] || req.connection.remoteAddress);
            const insider = clientIP == "127.0.0.1" || (
                typeof process.env.TRUSTED_IPS !== 'undefined' && typeof process.env.TRUSTED_IPS.split(',').find(x => clientIP.match(new RegExp(x))) !== 'undefined'
            );

            if (experimentId != null) {
                // if we got here, render the normal index site
                return res.render('index', {
                    insider: insider,
                    title: app.mountpath.substr(1),
                    gamejs: ExperimentClass.mainScript,
                    exp: experimentId,
                    preload: '{' +
                        Object.entries(ExperimentClass.LoadAssets).map(([key, value]) =>
                            key + ":'" + value + "'") +
                        '}'
                });
            } else {
                return res.render('index', {
                    insider: insider,
                    title: app.mountpath.substr(1)
                });
            }
        });

        // handle invitations
        app.route('/invitation/:invitationId')
            // show the form
            .get(async (req, res) => {
                const invitationId = req.params.invitationId;
                ExperimentClass.db.getInvitation(req.params.invitationId).then(async invitation => {
                    if (invitation && !invitation.accepted) {
                        let lastWPIndex = 1;
                        if (req.query.postWelcome)
                            await ExperimentClass.db.setInvitationData(invitationId, 'welcomePage', 1);
                        else if (ExperimentClass.welcomePage)
                            lastWPIndex = (await ExperimentClass.db.getInvitationData(invitationId, 'welcomePage')).welcomePage || 0;

                        // start with welcome page
                        if (ExperimentClass.welcomePage && lastWPIndex == 0) {
                            return res.render(ExperimentClass.getWelcomePage(), {
                                invitationId: invitationId,
                                baseURL: baseURL
                            });
                        } else if (ExperimentClass.consentFormFile != null) {
                            // render consent form if available
                            let data = {
                                idReq: ExperimentClass.idRequirementsMessage,
                                invitationId: invitationId,
                                baseURL: baseURL,
                            };
                            // add previous entries
                            Object.entries(req.query).forEach(([k, v]) => data[k] = v);
                            return res.render(ExperimentClass.getConsentFormFile(), data);
                        } else {
                            // otherwise add experiment (there is no consent form)
                            invitation.accepted = true;
                            await invitation.save();
                            await ExperimentClass.db.addExperiment(invitationId);
                            if (ExperimentClass.getFormFile('initial')) {
                                await ExperimentClass.db.setExperimentData(invitationId, 'questionnaireId', 'initial');
                                await ExperimentClass.db.setExperimentData(invitationId, 'questionnaireIteration', 'default');
                            }
                            req.query.exp = invitationId
                            return res.redirect(baseURL + '?exp=' + invitationId);
                        }
                    } else if (invitation) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        return this.showErrorPage(res, baseURL, 'Invitation was already accepted. Please use your self-generated id', 3, baseURL);
                    } else {
                        // wait to avoid dos
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        return this.showErrorPage(res, baseURL, 'Invitation not found', 3, baseURL);
                    }
                });
            })
            // handle form data
            .post(async (req, res) => {
                const invitationId = req.params.invitationId;
                const invitation = await ExperimentClass.db.getInvitation(invitationId);
                if (invitation && !invitation.accepted) {
                    // check if all data was entered
                    return ExperimentClass.db.getInvitationData(invitationId).then(data => {
                        this.updateConsentData(req, invitationId)
                            .then(async () => {
                                // error code (unused on success)
                                let str = 'err=1&';
                                // check if all mandatory fields were set
                                if (ExperimentClass.checkConsentFields(app.locals.basedir, req)) {
                                    const experiment = await this.checkIdSwitch(invitationId, req.body, 'participantId');
                                    // if everything was fine start the experiment
                                    if (experiment) {
                                        res.cookie('sessionId', experiment.experimentId, { sameSite: 'Strict', path: baseURL });
                                        return res.redirect(baseURL);
                                    } else {
                                        str = 'err=' + (typeof experiment == 'undefined' ? 2 : 3) + '&';
                                    }
                                }

                                // if we arrived here, something went wrong -> re-render
                                str += Object.entries(req.body).map(([key, value]) => value ? key + '=' + value : undefined).join('&')
                                str = str.replace(/(\&\&+)/g, '&').replace(/^\&/, '');
                                // if we got here, reload
                                return res.redirect(baseURL + '/invitation/' + invitationId + '?' + str);

                            });
                    });
                } else if (invitation) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return this.showErrorPage(res, baseURL, 'Invitation was already accepted. Please use your self-generated id', 3, baseURL);
                } else {
                    // wait to avoid dos
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return this.showErrorPage(res, baseURL, 'Invitation not found', 3, baseURL);
                }
            });

        // handle questionnaire data 
        app.post('/postQuestionnaire/:experimentId', async (req, res) => {
            const experiment = await ExperimentClass.getExperiment(req.params.experimentId);
            const questionnaireId = req.body.questionnaireId;
            // get the questionnaire id
            if (experiment && questionnaireId) {
                return ExperimentClass.getExperimentData(experiment.experimentId).then(async expData => {
                    // a different questionnaire than expected was sent
                    if (expData.questionnaireId != questionnaireId || expData.questionnaireIteration == 'invalid')
                        return res.redirect(baseURL);

                    this.updateQuestionnaireData(req, experiment.experimentId, questionnaireId, expData.questionnaireIteration).then(() => {
                        // check if all fields are set
                        if (ExperimentClass.checkFields(questionnaireId, req, app.locals.basedir))
                            return ExperimentClass.db.setExperimentData(experiment.experimentId, 'questionnaireId', 'none')
                                .then(ExperimentClass.db.setExperimentData(experiment.experimentId, 'questionnaireIteration', 'invalid')
                                    .then(() => res.redirect(baseURL)));
                        return res.redirect(baseURL + "?err=1");
                    });
                });
            }

            // in any other case (experiment id not set or not found in db) redirect to base
            return res.redirect(baseURL)
        });

        // aborting means clearing the cookie and redirecting to main site
        app.get('/abort', (req, res) => {
            res.clearCookie('sessionId', '');
            res.clearCookie('invitationId', '');
            res.redirect(baseURL);
        });

        ////////////////////////////
        //// secured stuff below ///
        ////////////////////////////

        // redirect private base to normal base
        privateApp.get('/', (req, res) => res.redirect(baseURL));

        // render invite
        privateApp.route('/invite')
            .get((req, res) => {
                // check if sending mails is suppoerted at all, otherwise just show existing sessions
                if (displayMailDisabled())
                    return res.redirect(privateBaseURL + '/sessions');
                // require being logged in
                if (!req.isAuthenticated()) {
                    return res.render('login', { from: req.originalUrl, baseURL: baseURL, loginURL: privateBaseURL })
                }

                // optionally create array with emails to fill in 
                const options = {
                    baseURL: baseURL,
                    headerText: "Invite Participants"
                };
                if (req.query.revalidate) {
                    options.invalid = req.query.revalidate.toString().split(',')
                }
                // render the invite page
                res.render('invite', options);
            })
            .post((req, res) => {
                // backend for receiving invite forms
                // this only works if sending mails is enabled
                if (displayMailDisabled())
                    return res.redirect(privateBaseURL + '/sessions');
                // and only if you are logged in
                if (!req.isAuthenticated()) {
                    return res.render('login', { from: req.originalUrl, baseURL: baseURL, loginURL: privateBaseURL })
                }

                // extract receivers from request
                const receivers = req.body.receivers;
                if (receivers) {
                    let maxMailsReached = false;
                    let invalid = '';
                    let valid = [];

                    // sort by valid and invalid
                    receivers.toString().split('\n')
                        .forEach(element => {
                            if (element.length > 0) {
                                if (valid.length < maxMailsAtOnce && validator.validate(element.trim())) {
                                    valid.push(element.trim());
                                    maxMailsReached = valid.length == maxMailsAtOnce;
                                } else {
                                    if (invalid.length > 0)
                                        invalid += "%0A"; // newline
                                    invalid += element.trim();
                                }
                            }
                        });

                    //  send mails one by one to receivers                    
                    console.log("calling create invitations")
                    ExperimentClass.createInvitations(valid).then(
                        invites => invites.forEach(async invite => {
                            // get all the information for the emails
                            console.log(invite.email + " " + invite.invitationId);
                            const invitationId = invite.invitationId
                            const experimentName = app.mountpath.substr(1);
                            const serverPath = (process.env.SERVER || (req.protocol + '://' + req.get('host'))) + baseURL;
                            const experimentURL = serverPath + '/invitation/' + invitationId;
                            const qrPath = serverPath + '/qr/' + invitationId + '.png';
                            let mailTemplate = 'views/mail.pug';
                            if (ExperimentClass.mailTemplate)
                                mailTemplate = 'experiments/' + ExperimentClass.mailTemplate;
                            // send the email
                            sendInvite(mailTemplate, invite.email, experimentName, experimentURL, qrPath, emailWidthPx);
                            // wait 500 ms before sending the next mail
                            await new Promise(resolve => setTimeout(resolve, 500));
                        })
                    );

                    // if there were invalid mails, go to invite with remaining addresses already filled in
                    if (invalid.length > 0) {
                        let invalidStr = '?revalidate=' + invalid.toString();
                        // optionally add the information that the max number of recipients was reached
                        if (maxMailsReached)
                            invalidStr += '&maxReached';
                        return res.redirect(privateBaseURL + '/invite' + invalidStr);
                    }
                }

                // if we got here, everything is fine an we simply redirect to the sessions page
                res.redirect(privateBaseURL + '/sessions');
            });

        // serve data directory
        privateApp.get('/data', async (req, res) => {
            if (!req.isAuthenticated()) {
                return res.render('login', { from: privateBaseURL + '/data', baseURL: baseURL, loginURL: privateBaseURL })
            }

            const experiments = await ExperimentClass.db.updateExperimentList();
            // collect file information
            let csvFiles = fs.readdirSync(dataFolder).filter(x => x.endsWith(".csv"));
            csvFiles = csvFiles.map(file => {
                const name = file.substr(0, file.length - 4);
                const stats = fs.statSync(dataFolder + "/" + file);
                const time = stats.mtime.toISOString();
                const experiment = experiments.find(x => x.experimentId == name);
                let finished = 'unknown';
                if (experiment != null)
                    finished = experiment.isFinished ? 'finished' : 'unfinished';

                return {
                    name: name,
                    date: stats.mtime,
                    time: time.substr(0, time.lastIndexOf('.')),
                    finished: finished,
                };
            });

            // render data page
            return res.render('data', {
                files: csvFiles,
                dataDir: '/data',
                loginURL: privateBaseURL,
                baseURL: baseURL,
                headerText: "Recorded Data"
            });
        });

        // serve data files
        privateApp.get('/data/*.*', (req, res) => {
            if (!req.isAuthenticated()) {
                return res.render('login', { from: '/data', baseURL: baseURL, loginURL: privateBaseURL });
            }

            // remove '/data/' part and send from data folder
            return res.sendFile(dataFolder + path.sep + req.url.substr(6));
        });

        privateApp.post('/downloadData', async (req, res) => {
            return fs.readdir(dataFolder, (error, files) => {
                if (!error) {
                    const zip = new JSZip();
                    files.filter(x => x.endsWith(".csv")).forEach(
                        file => zip.file(file, fs.readFileSync(dataFolder + path.sep + file)));

                    // send data
                    res.setHeader('content-disposition', 'attachment; filename=' + ExperimentClass.experimentModuleId + '-data.zip');
                    res.setHeader("content-type", "application/zip");
                    return zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true }).pipe(res);
                } else {
                    res.render('error');
                }
            });
        });

        privateApp.get('/consentData/:invitationId', async (req, res) => {
            return ExperimentClass.db.getInvitationData(req.params.invitationId).then(data => {
                res.render('consentData', {
                    data: Object.entries(data).filter(x => x[0] != 'welcomePage').map(([k, v]) => [k, v]),
                    headerText: "Consent Data",
                    baseURL: baseURL
                })
            })
        });

        privateApp.post('/downloadConsentData', async (req, res) => {
            return ExperimentClass.db.getInvitations().then(invitations => {
                Promise.all(invitations.filter(inv => inv.accepted).map(async (inv) => {
                    return ExperimentClass.db.getInvitationData(inv.invitationId).then(invData => {
                        return { id: inv.invitationId, data: invData };
                    });
                })).then(data => {
                    // init variables
                    const zip = new JSZip();
                    const keys = [];
                    let csvText = "";

                    // collect keys
                    data.forEach(consentEntry => {
                        Object.keys(consentEntry.data)
                            .filter(x => x != 'welcomePage')
                            .forEach(key => {
                                if (keys.indexOf(key) < 0) {
                                    csvText += (csvText.length > 0 ? ',' : '') + key;
                                    keys.push(key);
                                }
                            });
                    });
                    csvText += '\n';

                    // create files
                    data.forEach(consentEntry => {
                        if (Object.keys(consentEntry.data).length > 0) {
                            // create single json files
                            zip.file(consentEntry.id + '.json', JSON.stringify(consentEntry.data));
                            // add to csv 
                            keys.forEach(key => {
                                // add data
                                if (consentEntry.data[key])
                                    csvText += consentEntry.data[key];
                                csvText += ',';
                            });
                            csvText = csvText.substr(0, csvText.length - 1) + '\n';
                        }
                    });
                    // add csv file
                    zip.file('all.csv', csvText);

                    // send data
                    res.setHeader('content-disposition', 'attachment; filename=' + ExperimentClass.experimentModuleId + '-consent.zip');
                    res.setHeader("content-type", "application/zip");
                    zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true }).pipe(res);
                });
            });
        });

        privateApp.post('/downloadQuestionnaireData', async (req, res) => {
            ExperimentClass.db.getExperimentIds().then(async idArray => {
                const zip = new JSZip();

                while (idArray.length > 0) {
                    const expId = idArray.pop();
                    const questionnaires = await ExperimentClass.getAllQuestionnaireData(expId);
                    Object.entries(questionnaires).forEach(([questionnaireId, value]) => {
                        const fields = Object.entries(ExperimentClass.getFields('views', questionnaireId))
                            .sort()
                            .reduce((toFill, val) => toFill.concat(val[1].sort()), [])
                            .map(x => x.name)
                        zip.file(expId + questionnaireId + '.csv', Utils.writeQuestionnairesToString(value, fields));
                    });
                }

                res.setHeader('content-disposition', 'attachment; filename=' + ExperimentClass.experimentModuleId + '-questionnaires.zip');
                res.setHeader("content-type", "application/zip");
                zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true }).pipe(res);
            });
        });


        // allow registration for new sessions
        privateApp.post('/requestNewSession', async function (req, res) {
            // if logged in, create a new experiment
            if (req.isAuthenticated()) {
                await ExperimentClass.addInvitation();
            }

            // redirect to session overview
            return res.redirect(privateBaseURL + '/sessions');
        });

        // render the new experiment site
        privateApp.get('/sessions', async (req, res) => {
            if (!req.isAuthenticated()) {
                return res.render('login', {
                    from: req.originalUrl,
                    baseURL: baseURL,
                    loginURL: privateBaseURL
                });
            }

            return ExperimentClass.db.getInvitations().then(invitations => res.render('sessions', {
                openSessions: invitations,
                loginURL: privateBaseURL,
                baseURL: baseURL,
                headerText: "Existing Sessions"
            }));
        });
    }

    getExperimentId(req) {
        let experimentId = req.query.exp;
        // if there was nothing, maybe it was in the post data
        if (!experimentId && req.body)
            experimentId = req.body.exp;
        // if it's still empty try to find it in cookies
        if (!experimentId && req.headers.cookie) {
            const cookieSession = req.headers.cookie.split('; ').find(x => x.startsWith('sessionId='));
            if (cookieSession)
                experimentId = cookieSession.substr(10);
        }

        return experimentId ? experimentId : null;
    }

    async checkIdSwitch(invitationId, questionnaireData, idFieldName) {
        const invitation = await this.ExperimentClass.db.getInvitation(invitationId);
        if (invitation && questionnaireData[idFieldName] && this.ExperimentClass.isIdValid(questionnaireData[idFieldName])) {
            if (await this.ExperimentClass.getExperiment(questionnaireData[idFieldName])) {
                console.error("Experiment " + questionnaireData[idFieldName] + " already exists");
                return null;
            } else {
                invitation.consentFormFilled = true;
                invitation.accepted = true;
                invitation.save();
                this.ExperimentClass.db.setInvitationData(invitationId, 'accepted at', new Date().toString());

                const experiment = this.ExperimentClass.createInstance(questionnaireData[idFieldName], invitation.cooperationId);
                await this.ExperimentClass.db.setExperimentData(questionnaireData[idFieldName], 'questionnaireIteration', 'default');
                if (this.ExperimentClass.getFormFile('initial')) {
                    await this.ExperimentClass.db.setExperimentData(questionnaireData[idFieldName], 'questionnaireId', 'initial');
                }
                return experiment;
            }
        }
        return undefined;
    }

    updateQuestionnaireData(req, experimentId, questionnaireId, qIt) {
        const checkboxFields = this.ExperimentClass.getFields(this.app.locals.basedir, questionnaireId).mandatory
            .filter(field => field.type == 'checkbox')
            .map(field => field.name);

        const objToWrite = {};
        Object.entries(req.body)
            .filter(([key, _value]) => key != 'experimentId' && key != 'questionnaireId')
            .forEach(([key, _value]) => {
                objToWrite[key] = _value;
            });
        checkboxFields.filter(fieldName => !Object.keys(req.body).includes(fieldName)).forEach(key => {
            objToWrite[key] = '';
        });

        return this.ExperimentClass.bulkSetQuestionnaireData(experimentId, questionnaireId, qIt, objToWrite);
    }

    updateConsentData(req, invitationId) {
        const checkboxFields = this.ExperimentClass.getConsentFields(this.app.locals.basedir).mandatory
            .filter(field => field.type == 'checkbox')
            .map(field => field.name);
        return Promise
            .all(Object.entries(req.body)
                .filter(([key, _value]) => key != 'participantId')
                .map(async ([key, value]) =>
                    this.ExperimentClass.db.setInvitationData(invitationId, key, value))
                .concat(checkboxFields.filter(fieldName => !Object.keys(req.body).includes(fieldName)).map(async (key) =>
                    // set values of unset checkboxed to ''
                    this.ExperimentClass.db.setInvitationData(invitationId, key, '')
                ))
            )
    }

    showErrorPage(res, baseURL, msg, timeout, redirectUrl) {
        return res.render('error.pug', {
            msg: msg,
            baseURL: baseURL,
            timeout: timeout,
            redirectUrl: redirectUrl
        })
    }
}

module.exports = Routes