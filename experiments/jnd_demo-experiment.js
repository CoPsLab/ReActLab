const Utils = require('../server/experiment/experiment-utils');
const TrialFactory = require('./jnd/jnd-trial.js');
const fs = require('fs');
const e = require('express');
const { log } = require('console');

module.exports = class jnd extends require('../server/experiment/experiment-base') {
    // static consentFormFile = 'default/form-consent.pug';//'jnd/consent-form.pug'; 
    static welcomePage = 'jnd/welcome-form.pug'; //'welcome-form.pug';
    static questionnaires = {
        // use same form as initial form
        //initial: 'jnd/demographs-form1.pug', //'demographs-form1.pug',
        intermediate_train: 'jnd/intermediate-form-train.pug',
        intermediate: 'jnd/intermediate-form.pug', //'intermediate-form.pug',
        end: 'jnd/end-form.pug'
    }
    // --------------------------------
    // settings for experiment go here:
    static mainScript = 'game.js'; // set main script, path is relative to 'public' folder
    static numTrials = 10; // set number of trials
    static LoadAssets = { // select the Assets to be loaded
        //cursor: 'assets/circle.png', // example for showing a cursor. Path is relative to the public folder
        blue: 'assets/blueImage2.jpeg',
        red: 'assets/redImage2.jpeg',
        blue1: 'assets/blueImage2.jpeg',
        red1: 'assets/redImage2.jpeg',
        white: 'assets/test.jpeg',
        arrow: 'assets/arrow.png'
    };

    // --------------------------------
    currentTrial = null;
    outFile = null;
    started = false;

    // the current trial number (reset at the beginning of each block)
    currentTrialNumber = 1;
    // the number of trials in each block
    static trialsInBlock = 10; //in real experiment: 160
    static trialsInTraining = 10;//Trials in training are less
    myTrials = jnd.trialsInBlock;
    myTrialsTrain = jnd.trialsInTraining;
    // the number of blocks
    static blockNumber = 7;
    myBlocks = jnd.blockNumber;
    // the trial before which the intermediate questionnaire is shown (determines length of a block)
    intermediateQuestionnaireTrial = jnd.trialsInBlock + 1;
    intermediateQuestionnaireAfterTrain = jnd.trialsInTraining + 1;

    //total number of trials (in *all* experiment)
    static numTrials = jnd.trialsInTraining + jnd.trialsInBlock * (jnd.blockNumber - 1);

    // --------------------------------
    // helper function to make writing to a file more concise
    writeToCSV(textToWrite) {
        if (this.outFile)
            fs.writeFileSync(this.outFile, textToWrite);
        else {
            console.error("out file was not open: " + this.dataFolder + '/' + this.id + '.csv');
        }
    }

    //helper function to shuffle 
    shuffle(array) {
        var currentIndex = array.length, temporaryValue, randomIndex;
        // While there remain elements to shuffle...
        while (0 !== currentIndex) {
            // Pick a remaining element...
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex -= 1;
            // And swap it with the current element.
            temporaryValue = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temporaryValue;
        }
        return array;
    }

    //make an array of nStep elements between startValue and stopValue,
    // repeat each step nRep times
    makeArr(startValue, stopValue, nStep, nRep) {
        var arr = [];
        var step = (stopValue - startValue) / (nStep - 1);
        for (var i = 0; i < nStep; i++) {
            var currValue = parseFloat((startValue + (step * i)).toFixed(4));
            for (var j = 0; j < nRep; j++) {
                arr.push(currValue);
            }
        }
        return arr;
    }

    // --------------------------------
    async initialize(sessionId) {

        console.log(this.Data)
        if (!this.Data.thisblock) {
            this.Data.thisblock = 1;
        }

        console.log("initialize! data.block " + this.Data.thisblock);

        //save intermediate questionnaires
        //Utils.writeQuestionnairesToCSV(
        //    this.QuestionnaireData['intermediate'],
        //    this.getFields('intermediate'),
        //    this.dataFolder + '/' + this.id + '_intermediate.csv', [],
        //    true
        //);

        // if (this.Data.thisblock > jnd.blockNumber) {
        //     Utils.writeQuestionnairesToCSV(
        //         this.QuestionnaireData['end'],
        //         this.getFields('end'),
        //         this.dataFolder + '/' + this.id + '_end.csv', [],
        //         true
        //     );
        // }

        this.id = sessionId;

        // open the datafile for this session (use 'a' for mode, so new data is appended)
        var fileName = this.dataFolder + '/' + sessionId + '.csv';
        var didExist = fs.existsSync(fileName);
        this.outFile = fs.openSync(fileName, 'a');
        // possibly add header
        if (!didExist) {
            // if there is some data from the forms, write it as a first line to the csv file
            // if (this.QuestionnaireData['initial']['default']) {
            //     var dataStr = JSON.stringify(this.QuestionnaireData['initial']['default']);
            //     this.writeToCSV(dataStr.substring(1, dataStr.length - 1) + "\n\n");
            // }
            //Utils.writeQuestionnairesToCSV(
            //    this.QuestionnaireData['intermediate'],
            //    this.getFields('intermediate'),
            //    this.dataFolder + '/' + this.id + '_intermediate.csv'
            //);
            //this.writeToCSV(Trial.getCSVHeader());
        }

        //create combinations of parameters in each block
        if (!this.Data.blocks) {
            // create all combinations of the following three parameters
            let combinations = Utils.createCombinations({
                color: ["BB", "RR", "RB"],
                blur: [false],
            });
            // shuffle the combinations
            combinations = Utils.shuffle(combinations);

            let combinationsBlur = Utils.createCombinations({
                color: ["BB", "RR", "RB"],
                blur: [true],
            });
            combinationsBlur = Utils.shuffle(combinationsBlur);
            combinations = combinations.concat(combinationsBlur);
            // prepend training
            combinations.unshift({
                color: "no",
                blur: false,
            })
            // save combinations
            this.Data.blocks = combinations;
            this.saveExperimentData();
            //save combinations on .csv fileName
            this.writeToCSV(JSON.stringify(combinations));
        }

        if (this.Data.thisblock <= this.myBlocks) {
            //settings for current block (from shuffled combinations)
            const trialSettings = Utils.getTrialFromBlocks(this.Data.blocks, this.Data.thisblock);
            console.log("Running trial with the following settings" + JSON.stringify(trialSettings));
            this.color = trialSettings.color;
            this.blur = trialSettings.blur;
        }
    }//initialize   

    // --------------------------------
    async start(trialNumber) {
        // set the color
        this.runOnClient(client => client.setBackgroundColor({ color: "rgb(0, 0, 0)" }));
        // show the cursor
        //this.Assets.cursor.setVisible(true);

        let question = "Links oder Rechts?";
        this.createText('prompt', question, { x: 0.45, y: -0.025 }, {
            color: 'white',
            fontSize: '25px',
            fontFamily: 'Arial',
            align: 'left',
            fixedWidth: this.WindowInfo.width,
            wordWrap: { width: 0.9 * this.WindowInfo.width }
        }).then(() => {
            this.Texts.prompt.set(question);
            this.Texts.prompt.setVisible(false);
        });

        //assign blur to block
        switch (this.color) {
            case "BB":
                this.currentReference = this.Assets.blue;
                this.currentTest = this.Assets.blue1;
                break;
            case "RR":
                this.currentReference = this.Assets.red;
                this.currentTest = this.Assets.red1;
                break;
            case "RB":
                this.currentReference = this.Assets.red;
                this.currentTest = this.Assets.blue;
                break;
            default:
                this.currentReference = this.Assets.white;
                this.currentTest = this.Assets.white;
                break;

        }

        if (this.blur) {
            this.currentReference.setScale(1, 1.5);
            this.currentTest.setScale(1, 1.5);
        } else {
            this.currentReference.setScale(0.5, 1.5);
            this.currentTest.setScale(0.5, 1.5);
        }


        if(this.blur){
            var maxDist = 0.05;
        }else{
            var maxDist = 0.05;
        }
        var nSteps = 6;
        var repetitions = 20;

        if (trialNumber < jnd.numTrials) {

            if (trialNumber <= jnd.trialsInTraining) {
                //during first training
                var trialCheck = trialNumber;
                var trialsInThisBlock = this.myTrialsTrain
            } else {
                //after training
                var trialCheck = trialNumber - this.myTrialsTrain;
                var trialsInThisBlock = this.myTrials
            }

            if (!this.Data.trial || trialCheck % trialsInThisBlock == 1) {
                this.currentTrialNumber = 1;
                await this.saveExperimentData();
                let distance = this.makeArr(-maxDist, maxDist, nSteps, repetitions);
                this.Data.distance = this.shuffle(distance);
                console.log("distance array: " + this.Data.distance);
            } else {
                this.currentTrialNumber = this.Data.trial;
            }

            //limit on x coordinate
            this.xlim = 0.3;

            //open new .csv file
            var fileName = this.dataFolder + '/' + this.id + '_data.csv';
            var didExist = fs.existsSync(fileName);
            this.outFile = fs.openSync(fileName, 'a');
            // possibly add header
            if (!didExist) {
                this.writeToCSV(TrialFactory.getCSVHeader());
            }

            // create a nice centered text
            let text = "Experiment fortsetzen";
            if (trialCheck % trialsInThisBlock == 1) {
                if (this.Data.thisblock == 1) {
                    text = ['Ihre Aufgabe besteht darin, bei zwei aufeinanderfolgenden visuellen Objekten', 'die relative Stellung des zweiten Objekts zum Ersten zu bestimmen.', '', 'In anderen Worten: ist das zweite Objekt weiter links oder rechts im Vergleich zum Vorherigen?', '', 'Bitte klicken Sie mit dem Zeigefinger Ihrer dominanten Hand auf die jeweilige Seite des Tablets, sobald die Frage „Links oder Rechts?“ erscheint.', '', 'Zu Beginn werden Sie einige Testdurchgänge bearbeiten.', '', 'Falls während der Durchführung Fragen aufkommen sollten, wenden Sie sich bitte an die Versuchsleitung.'];
                } else if (this.Data.thisblock == 2) {
                    text = ['Nun beginnt das tatsächliche Experiment.', '', 'Hierfür werden Sie eine zweifarbige Anaglyphenbrille tragen.', 'Diese wurde aus Hygieneschutzgründen vor und nach jeder Nutzung desinfiziert.', '', 'Bitte wenden Sie sich nun an die Versuchsleitung.'];
                } else if (this.Data.thisblock == 5) {
                    text = ['Nun beginnt der zweite Teil des Experiments.', '', 'Hierfür werden die farbigen Folien der Anaglyphenbrille gewechselt.', '', 'Bitte wenden Sie sich nun an die Versuchsleitung.']
                } else {
                    text = ['Ist das zweite Objekt weiter links oder rechts im Vergleich zum Vorherigen?','', 'Bitte klicken Sie auf die jeweilige Seite des Tablets, sobald die Frage „Links oder Rechts?“ erscheint.'];
                }
            }
            this.createText('centerText', text, { x: 0.05, y: -0.025 }, {
                color: 'white',
                fontSize: '22px',
                fontFamily: 'Arial',
                align: 'left',
                fixedWidth: this.WindowInfo.width,
                wordWrap: { width: 0.9 * this.WindowInfo.width }
            }).then(() => {
                this.Texts.centerText.set(text);
                // rotate it
                this.Texts.centerText.setRotation(0);
                this.Assets.arrow.moveTo({ x: 0.45, y: 0.35 });
                this.Assets.arrow.setVisible(true);
            });


        } else {
            this.createText('centerText', "Experiment abgeschlossen! Vielen Dank für Ihre Teilnahme!", { x: 0.05, y: 0 }, {
                color: '#5F9EA0',
                fontSize: '28px',
                fontFamily: 'Arial',
                align: 'left',
                fixedWidth: this.WindowInfo.width,
                wordWrap: { width: 0.9 * this.WindowInfo.width }
            }).then(() => {
                //run this at the end of the experiment
                this.runQuestionnaire('end')
                //save intermediate questionnaires
                Utils.writeQuestionnairesToCSV(
                    this.QuestionnaireData['end'],
                    this.getFields('end'),
                    this.dataFolder + '/' + this.id + '_end.csv'
                );
                this.finishExperiment();
            });
        }
    } //start

    // --------------------------------
    async onTrialFinished(tid) {
        console.log("this trial: " + this.currentTrialNumber);
        //update trial number within a block
        this.currentTrialNumber += 1;
        this.Data.trial = this.currentTrialNumber;

        //show intermediate questionnaire between blocks
        if ((this.currentTrialNumber == this.intermediateQuestionnaireTrial && this.Data.thisblock > 1)) {
            //update overall number of blocks
            this.Data.thisblock += 1;
            await this.saveExperimentData().then(() => {
                console.log("done saving")
                this.db.getExperimentData(this.internalData.id).then(data => console.log(data))
                const questionnaire = this.Data.thisblock > jnd.blockNumber ? 'end' : 'intermediate';
                this.runQuestionnaire(questionnaire, this.currentTrialNumber);
            });
        } else if (this.currentTrialNumber == this.intermediateQuestionnaireAfterTrain && this.Data.thisblock == 1) {
            this.Data.thisblock += 1;
            await this.saveExperimentData().then(() => {
                console.log("done saving")
                this.db.getExperimentData(this.internalData.id).then(data => console.log(data))
                const questionnaire = this.Data.thisblock > jnd.blockNumber ? 'end' : 'intermediate_train';
                this.runQuestionnaire(questionnaire, this.currentTrialNumber);
            });
        } else {
            //show a new target
            TrialFactory.showBlob(tid + 1, this, this.currentReference, this.currentTest, this.Texts.prompt);
            // make sure we don't forget to save
            await this.saveExperimentData();
        }
        // internally increase trial number
        this.notifyNextTrial();
    } //onTrialFinished

    // --------------------------------
    onClick(click) {
        if (!this.started && click.y > 0.3 && click.x > 0.4) {
            this.Assets.arrow.setVisible(false);
            //handle first trial
            this.started = true;
            // start first trial
            this.Texts.centerText.setVisible(false);
            TrialFactory.showBlob(this.currentTrialNumber, this, this.currentReference, this.currentTest, this.Texts.prompt);
        } else {
            // handle all other trials
            if (!click.isDown && this.currentTrial != null && (click.x > this.xlim || click.x < -this.xlim)) {
                this.currentTrial.handleClick(click);
            }
        }
    }

    // --------------------------------
    onDisconnect() {
        // close data file on disconnect
        if (this.outFile != null) {
            fs.closeSync(this.outFile);
        }
    } //onDisconnect
}
