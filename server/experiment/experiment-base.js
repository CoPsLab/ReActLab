const path = require('path')
const pug = require('pug')
const xml = require('libxmljs');

const objectSeparator = ".";
const objectSeparatorRegEx = new RegExp("\\.");

function findClass(node, end, possibleFields, defaultValue) {
    if (!node)
        return [defaultValue];
    const classAttr = node.attr('class');
    if (classAttr) {
        const classes = classAttr.value()
            .split(' ')
            .filter(c => possibleFields ? possibleFields.includes(c) : c)
        if (classes && classes.length > 0) {
            return classes;
        }
    }
    if (node != end) {
        return findClass(node.parent(), end, possibleFields, defaultValue);
    } else {
        return [defaultValue];
    }
}

function getFields(form, basedir) {
    var retVal = { optional: [], mandatory: [] };
    if (!form)
        return retVal;
    const compiled = pug.renderFile(form, { basedir: basedir });
    const result = xml.parseHtml(compiled);
    const formToAnalyze = result.find('/html/body//form[@id="mainForm"]');

    return formToAnalyze[0].find("//input|//select").reduce((prevVal, currVal) => {
        const toAdd = {
            type: currVal.attr('type') ? currVal.attr('type').value() : currVal.name(),
            name: currVal.attr('name').value(),
            value: currVal.attr('value') ? currVal.attr('value').value() : undefined,
            classes: findClass(currVal, formToAnalyze[0], Object.keys(prevVal), 'optional')
        };

        if (!prevVal[toAdd.classes[0]].some(x => x.name == toAdd.name))
            prevVal[toAdd.classes[0]].push(toAdd);
        return prevVal;
    }, { mandatory: [], optional: [], hidden: [] });
}

function setData(tmp, path, value) {
    path = path.split(objectSeparatorRegEx);
    if (path.length > 0) {
        // prepare path
        for (let i = 0; i < path.length - 1; ++i) {
            if (!tmp[path[i]])
                tmp[path[i]] = {};
            tmp = tmp[path[i]]
        }
        // update value 
        tmp[path[path.length - 1]] = value;
    }
}

function getData(dbData, path) {
    const retVal = {};
    Object.entries(dbData)
        // only get the stuff we want
        .filter(([k,]) => path ? k.startsWith(path) : true)
        // set the data to the object
        .map(entry => setData(retVal, entry[0], entry[1]));
    return retVal;
}


class IExperiment {
    // shortcut to static functions
    Static = this.constructor;
    static questionnaires = {};
    static idRequirementsMessage = '6 characters required';
    static mainScript = 'game.js';
    static experimentModuleId = null;
    static dataFolder = null;
    static consentFormFile = null;
    static baseURL = null;
    static db = null;
    static experimentFolder = require('path').resolve("./experiments");

    internalData = {};

    finishExperiment() {
        console.warn('calling unimplemented finishExperiment function');
    };

    createText(name, text, pos, settings) {
        console.warn("calling unimplemented createText function");
    }

    notifyNextTrial() {
        console.warn("calling unimplemented notifyNextTrial function");
    }

    runOnClient() {
        console.warn("calling unimplemented runOnClient function");
    }

    setQuestionnaireValue(name, value) {
        console.warn("calling unimplemented setQuestionnaireValue function");
    }

    setCrossBox(box, cb) {
        this.handleCrossBox = cb;
        this.runOnClient(Client => Client.setCrossBox(box));
    }

    runQuestionnaire(questionnaireId, iteration = 1) {
        if (this.db) {
            return Promise.all(
                [this.db.setExperimentData(this.internalData.id, 'questionnaireIteration', iteration, null),
                this.db.setExperimentData(this.internalData.id, 'questionnaireId', questionnaireId, null)
                ]
            ).then(
                () => this.goto()
            );
        } else {
            console.error('no database connection available');
        }
    }

    getFields(questionaireId, viewsFolder = 'views') {
        return Object.entries(this.constructor.getFields(viewsFolder, questionaireId)).sort()
            .reduce((toFill, val) => toFill.concat(val[1].sort()), [])
    }

    filePath(sessionId, filename) {
        filename = filename.startsWith('.') ? filename : '_' + filename;
        return this.dataFolder + '/' + sessionId + filename;
    }

    static createInstance(id) {
        return this.db.addExperiment(id);
    }

    static async getExperiment(id) {
        return this.db.getExperiment(id);
    }

    static getExperimentData(id, key) {
        return this.db.getExperimentData(id).then(async (allData) => {
            return getData(allData, key)
        });
    }

    static async getAllQuestionnaireData(id) {
        const data = await this.getExperimentData(id);
        return data['questionnaireData'] || {};
    }

    static async getQuestionnaireData(id, questionnaireId, questionnaireIteration) {
        if (!questionnaireIteration)
            questionnaireIteration = "default";
        return this.getExperimentData(id, 'questionnaireData' + objectSeparator + questionnaireId + objectSeparator + questionnaireIteration)
            .then(result => {
                if (result.questionnaireData && result.questionnaireData[questionnaireId])
                    return result.questionnaireData[questionnaireId][questionnaireIteration];
                return {};
            });
    }

    static setQuestionnaireData(id, questionnaireId, questionnaireIteration, key, value) {
        return this.setExperimentData(id, 'questionnaireData' + objectSeparator + questionnaireId + objectSeparator + questionnaireIteration + objectSeparator + key, value);
    }

    static bulkSetQuestionnaireData(id, questionnaireId, questionnaireIteration, data) {
        return this.setExperimentData(id, 'questionnaireData' + objectSeparator + questionnaireId + objectSeparator + questionnaireIteration, data);
    }

    static setExperimentData(experimentId, key, value) {
        if (value == null) {
            return this.db.setExperimentData(experimentId, key, value);
        } else {
            return this.db.bulkSetExperimentData(experimentId, value, key);
        }
    }

    getExperimentData(key) {
        return this.constructor.getExperimentData(this.internalData.id, key);
    }

    setExperimentData(key, value) {
        return this.constructor.setExperimentData(this.internalData.id, key, value);
    }


    getQuestionnaireData(questionnaireId, questionnaireIteration = 'default') {
        return this.constructor.getQuestionnaireData(this.internalData.id, questionnaireId, questionnaireIteration);
    }

    loadQuestionnaireData() {
        return this.constructor.getExperimentData(this.internalData.id)
            .then(dbData => {
                return this.QuestionnaireData = dbData["questionnaireData"] || {};
            });
    }

    loadExperimentData() {
        return this.constructor.getExperimentData(this.internalData.id)
            .then(dbData => {
                return this.Data = dbData["data"] || {};
            });
    }

    saveExperimentData() {
        return this.constructor.setExperimentData(this.internalData.id, "data", this.Data);
    }

    getNumParticipants(){
        return this.db.getExperiment(this.internalData.id)
            .then(exp => {
                if (exp && exp.cooperationId){
                    return this.db.getCooperationPartnerCount(exp.cooperationId);
                } else {
                    return undefined;
                }
            });        
    }

    getConnectedParticipants(){
        return this.db.getExperiment(this.internalData.id)
            .then(exp => {
                if (exp && exp.cooperationId){
                    return this.db.getConnectedCooperationPartners(exp.cooperationId);
                } else {
                    return undefined;
                }
            });        
    }

    static getFormFile(questionnaireId) {
        const formFile = this.questionnaires[questionnaireId];
        return formFile ? this.experimentFolder + path.sep + formFile : undefined;
    }

    static getWelcomePage() {
        return this.welcomePage ? this.experimentFolder + path.sep + this.welcomePage : undefined;
    }

    static getConsentFormFile() {
        if (this.consentFormFile != null)
            return this.experimentFolder + path.sep + this.consentFormFile;
        return null;
    }

    static getConsentFields(basedir) {
        return getFields(this.getConsentFormFile(), basedir);
    }

    static getFields(basedir, questionnaireId) {
        return getFields(this.getFormFile(questionnaireId), basedir);
    }

    static checkConsentFields(basedir, req) {
        const fields = this.getConsentFields(basedir);
        return this.checkMandatory(fields, req)
    }

    static checkFields(questionaireId, req, viewsFolder) {
        const fields = this.getFields(viewsFolder, questionaireId);
        return this.checkMandatory(fields, req);

    }

    static checkMandatory(fields, req) {
        return fields.mandatory.every(field => {
            switch (field.type) {
                case 'checkbox':
                    return req.body[field.name] == "on" || req.body[field.name] == field.value;
                case 'select':
                    return req.body[field.name] && req.body[field.name] != "none";
                default:
                    return req.body[field.name];
            }
        });
    }

    static isIdValid(id) {
        return id.length == 6;
    }

    static addInvitation(){
        return this.db.addInvitation();
    }

    static createInvitations(receipientList) {
        return Promise.all(
            receipientList.map(async(address) => {
                var invitation = await this.addInvitation();
                return {
                    email: address,
                    invitationId: invitation.invitationId
                };
            })
        );
    }

    // 
    Data = {}
    Texts = {}
    Assets = {}
    WindowInfo = {}

    constructor(id, db, dataFolder, numTrials) {
        // console.log("creating " + typeof(this) + " with db " + db)
        this.db = db;
        this.dataFolder = dataFolder;
        this.numTrials = numTrials;
        this.internalData.id = id;
    }

    async initialize(sessionId) { }
    async start(initialTrialNumber) { }
    async onClick(click) { }
    async onKey(key) { }
    async onSliding(data) { }
    async onDisconnect() { }
    async onInterrupted() { }
    async orientationChange(orientation) { }
}

module.exports = IExperiment