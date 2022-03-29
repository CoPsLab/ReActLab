const { shuffle, getTrialFromBlocks, createCombinations, writeQuestionnairesToCSV } = require('../server/experiment/experiment-utils');
const Trial = require('./examples/example-trial.js');
const fs = require('fs');

module.exports = class extends require('../server/experiment/experiment-base') {
    static consentFormFile = 'examples/form-consent.pug';
    static welcomePage = 'examples/welcome.pug';
    static questionnaires = {
        // use same form as initial form
        initial: 'examples/form-intermediate.pug',
        intermediate: 'examples/form-intermediate.pug'
    }
    static numTrials = 8;
    static LoadAssets = {
        cursor: 'assets/example-content/circle.png',
        redDot: 'assets/example-content/selection.png'
    }

    // the currently active trial
    currentTrial = null;
    // the file to which data is written
    outFile = null;
    // flag to monitor if a first click was received
    started = false;
    // the current trial number
    currentTrialNumber = -1;
    // the trials before which the intermediate questionnaire is shown
    intermediateQuestionnaireTrials = [3];
    // a flag to disable reactions to clicks
    ignoreClicks = false;

    // get everything set up to start
    async initialize(sessionId) {
        // get the file path (no real filename but only .csv because the session id is alreay part of the filename)
        const fileName = this.filePath(sessionId, ".csv");
        const didExist = fs.existsSync(fileName);
        // open the datafile for this session (use 'a' for mode, so new data is appended)
        this.outFile = fs.openSync(fileName, 'a');

        // possibly add header
        if (!didExist) {
            // if there is some data from the initial form, write it as a first line to the csv file
            if (this.QuestionnaireData['initial']['default']) {
                const dataStr = JSON.stringify(this.QuestionnaireData['initial']['default']);
                fs.writeFileSync(this.outFile, dataStr.substring(1, dataStr.length - 1) + "\n\n");
            }

            fs.writeFileSync(this.outFile, Trial.getCSVHeader());
        }

        // set some value that can be used in all(!) the following questionnaires for this participant
        // tableHeader is the name of the variable in the questionnaire pug file.
        await this.setQuestionnaireValue("tableHeader", "This is a table header set inside the experiment");

        // example for creating block data
        if (!this.Data.blocks) {
            // create all combinations of the following three parameters
            let combinations = createCombinations({
                frequency: [100, 200],
                orientation: ['landscape', 'portrait'],
                position: [{ x: 1, y: -1 }, { x: -1, y: 1 }]
            });

            // shuffle the combinations
            combinations = shuffle(combinations);

            // prepend training
            combinations.unshift({
                frequency: 0,
                orientation: 'landscape',
                position: { x: 0, y: 0 }
            })

            // save combinations
            this.Data.blocks = combinations;
            this.saveExperimentData();
        }

        // create two texts (just for testing, again)
        await this.createText('textTopLeft', '', { x: -.3, y: -0.3 }, { color: '#00FF00' });
        await this.createText('centerText', '', { x: 0, y: -0.25 }, {
            color: '#00AFFF',
            fontSize: '100px',
            align: 'center',
            fontStyle: 'bold',
            fixedWidth: this.WindowInfo.width,
            wordWrap: { width: 0.9 * this.WindowInfo.width }
        })

    }

    // handle device orientation change
    orientationChange(orientation) {
        const trialSettings = getTrialFromBlocks(this.Data.blocks, this.currentTrialNumber);
        if (trialSettings && orientation != trialSettings.orientation) {
            console.log("participant switched to " + orientation + " which is not correct");
            this.Texts.centerText.set("please switch to " + trialSettings.orientation + " orientation");
            this.Texts.centerText.setVisible(true);
            this.disableClicks = true;
        } else if (this.Texts.centerText) {
            this.Texts.centerText.setVisible(false);
            this.disableClicks = false;
        }
    }

    // this function is called once, when the experiment is started
    start(trial) {
        // otherwise make the cursor visible (just for testing)
        this.Assets.cursor.moveTo({ x: 0, y: 0, z: -1 });
        this.Assets.cursor.setVisible(true);

        //scale cursor and text to half their size
        this.Texts.centerText.setScale(0.5, 0.5);
        this.Assets.cursor.setScale(0.5, 0.5);

        // if the trial number is too high, finish the trial (which should end the experiment, too)
        if (trial >= this.Static.numTrials)
            return this.onTrialFinished(trial);
        else // store first trial number
            this.currentTrialNumber = trial;

    }

    // called when a click is received
    onClick(click) {
        if (!this.started) {
            const trialSettings = getTrialFromBlocks(this.Data.blocks, this.currentTrialNumber);
            // the first time we start the first trial and hide the centered text
            this.currentTrial = new Trial(this.currentTrialNumber, this, this.Assets.redDot, trialSettings);
            this.Texts.centerText.setVisible(false);
            // started is true now, so all the next clicks will go to the else block below
            this.started = true;
        } else if (click.isDown && this.currentTrial != null && !this.ignoreClicks) {
            // all other times, we let the trial handle the click
            this.currentTrial.handleClick(click);
        }
    }

    // check if all trials are done, otherwise start a new one
    onTrialFinished(tid) {
        if (tid < this.numTrials) {
            this.currentTrialNumber += 1;
            // console.log(getTrialFromBlocks(this.Data.blocks, this.currentTrialNumber));
            this.runOnClient(client => {
                // rotate text arbitraryly (between -45 and 45 degrees)
                this.Texts.centerText.setRotation((Math.random() - 0.5) * 90.0);
                this.Texts.centerText.set((this.numTrials - tid) + " trials left");
                this.Texts.centerText.setVisible(true);
                client.wait(1000);
                this.Texts.centerText.setVisible(false);
            }).then(() => {
                // before we are running the next (third) trial, run an intermediate questionnaire
                // we are hiding the abort button from now on
                this.setQuestionnaireValue('hideAbort', true)
                const tmp = this.intermediateQuestionnaireTrials.shift()
                if (this.currentTrialNumber == tmp)
                    this.runQuestionnaire('intermediate', this.currentTrialNumber);
                else {
                    this.intermediateQuestionnaireTrials.unshift(tmp);
                    this.currentTrial = new Trial(this.currentTrialNumber, this, this.Assets.redDot)
                }
            });

            this.notifyNextTrial();
        } else {
            // run final questionnaire if not done yet
            if (!this.Data.finalQuestionnaireDone) {
                this.Data.finalQuestionnaireDone = true;
                this.saveExperimentData();
                this.setQuestionnaireValue('submitText', "Finish Experiment")
                return this.runQuestionnaire('intermediate', 'final');
            } else {

                // otherwise save all questionnaire data
                Object.keys(this.Static.questionnaires).forEach(key =>
                    writeQuestionnairesToCSV(
                        this.QuestionnaireData[key],
                        this.getFields(key),
                        this.filePath(this.internalData.id, key + 'Data.csv')
                    )
                );

                // and finally say thank you and hide dot
                this.Texts.centerText.set(["Experiment finished.", "Thank you =)"]);
                this.Texts.centerText.setVisible(true);
                this.Assets.redDot.setVisible(false);
                return this.finishExperiment();
            }
        }
    }

    // this is called after(!) disconnects. Probably you want to close open files here
    onDisconnect() {
        // close data file on disconnect                
        if (this.outFile != null) {
            fs.closeSync(this.outFile);
        }
    }
}