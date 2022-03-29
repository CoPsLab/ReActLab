const Utils = require('../server/experiment/experiment-utils');
const TrialFactory = require('./sineoffset/sineoffset-trial.js');
const fs = require('fs');

module.exports = class sineOffset extends require('../server/experiment/experiment-base') {
    // static consentFormFile = 'sineoffset/consent-form.pug'; //'sineoffset/consent-form.pug';//'consent-form.pug';
    static welcomePage = 'sineoffset/welcome-form.pug'; //'welcome-form.pug';
    static mailTemplate = 'sineoffset/mail.pug';
    static questionnaires = {
        // use same form as initial form
        //initial: 'sineoffset/demographs-form1.pug', //'demographs-form1.pug',
        intermediate: 'sineoffset/intermediate-form.pug', //'intermediate-form.pug',
        welcome: 'welcome-form.pug',
        end: 'sineoffset/end-form.pug'
    }
    static mainScript = 'game.js'; // set main script, path is relative to 'public' folder
    static LoadAssets = { // select the Assets to be loaded
        //cursor: 'assets/circle.png', // example for showing a cursor. Path is relative to the public folder
        redKey: 'assets/red.png',
        greenKey: 'assets/green.png',
        background: 'assets/background.png',
        arrow: 'assets/arrow.png',
    };
    // --------------------------------


    currentTrial = null;
    outFile = null;
    started = false;
    //trialNumber = 0;
    // the current trial number (reset at the beginning of each block)
    currentTrialNumber = 1;

    // the number of trials in each block
    static trialsInBlock = 32; //in real experiment: 128
    myTrials = 128;
    // the number of blocks
    static blockNumber = 5;
    myBlocks = sineOffset.blockNumber;
    // the trial before which the intermediate questionnaire is shown (determines length of a block)
    intermediateQuestionnaireTrial = sineOffset.trialsInBlock + 1; //129
    //total number of trials (in *all* experiment)
    static numTrials = sineOffset.trialsInBlock * sineOffset.blockNumber;

    // helper function to make writing to a file more concise
    writeToCSV(textToWrite) {
        fs.writeFileSync(this.outFile, textToWrite);
    }

    async initialize(sessionId) {
            console.log(this.Data)
            if (!this.Data.thisblock) {
                this.Data.thisblock = 1;
            }

            console.log("initialize! data.block " + this.Data.thisblock);

            //save intermediate questionnaires
            Utils.writeQuestionnairesToCSV(
                this.QuestionnaireData['intermediate'],
                this.getFields('intermediate'),
                this.dataFolder + '/' + this.id + '_intermediate.csv', [],
                true
            );

            if (this.Data.thisblock > sineOffset.blockNumber) {
                Utils.writeQuestionnairesToCSV(
                    this.QuestionnaireData['end'],
                    this.getFields('end'),
                    this.dataFolder + '/' + this.id + '_end.csv', [],
                    true
                );
            }

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
                // Utils.writeQuestionnairesToCSV(
                //     this.QuestionnaireData['intermediate'],
                //     this.getFields('intermediate'),
                //     this.dataFolder + '/' + this.id + '_intermediate.csv'
                // );
                //this.writeToCSV(TrialFactory.getCSVHeader());
            }


            //create combinations of parameters in each block
            if (!this.Data.blocks) {
                // create all combinations of the following three parameters
                let combinations = Utils.createCombinations({
                    frequency: [1, 2, 4, 8],
                    split: [false],
                    orientation: ['landscape'],
                    targetvisible: [true],
                    //position: [{ x: 1, y: -1 }, { x: -1, y: 1 }]
                });

                // shuffle the combinations
                combinations = Utils.shuffle(combinations);

                // prepend training
                combinations.unshift({
                        frequency: 0,
                        split: false,
                        orientation: 'landscape',
                        targetvisible: true,
                        //position: { x: 0, y: 0 }
                    })
                    //append more combinations if necessary


                // save combinations
                this.Data.blocks = combinations;
                await this.saveExperimentData();

                //save combinations on .csv fileName
                this.writeToCSV(JSON.stringify(combinations));
            }

            if (this.Data.thisblock <= this.myBlocks) {
                //settings for current block (from shuffled combinations)
                const trialSettings = Utils.getTrialFromBlocks(this.Data.blocks, this.Data.thisblock);
                console.log("Running trial with the following settings" + JSON.stringify(trialSettings));
                this.frequency = trialSettings.frequency;
                this.split = trialSettings.split;
                this.orientation = trialSettings.orientation;
                this.targetVisible = trialSettings.targetvisible;
            }


        } //initialize

    // orientationChange(orientation) {
    //     //const trialSettings = Utils.getTrialFromBlocks(this.Data.blocks, this.currentTrialNumber);
    //     if (orientation != this.orientation) {
    //         console.log("participant switched to " + orientation + " which is not correct");
    //         //this.Texts.centerText.set("please switch to " + trialSettings.orientation + " orientation");
    //         this.Texts.centerText.set("you switched to " + orientation + " which is not correct. Please rotate the screen");
    //         this.Texts.centerText.setVisible(true);
    //         this.disableClicks = true;
    //     } else if (this.Texts.centerText) {
    //         this.Texts.centerText.setVisible(false);
    //         this.disableClicks = false;
    //     }
    // }



    async start(trialNumber) {

            //this.Assets.cursor.setVisible(true);

            //decide size of assets
            //this.Assets.cursor.setScale(0.5, 0.5);
            this.Assets.redKey.setScale(0.7, 0.7);
            this.Assets.greenKey.setScale(0.7, 0.7);

            console.log("trialNumber: " + trialNumber);

            if (trialNumber < sineOffset.numTrials) {

                if (!this.Data.trial || trialNumber % this.myTrials == 1) {
                    this.currentTrialNumber = 1;
                    // var blockNumber = Math.ceil(trialNumber / this.myTrials);
                    // this.Data.thisblock = blockNumber;
                    await this.saveExperimentData();

                } else {
                    this.currentTrialNumber = this.Data.trial;

                }


                //limit on y coordinate
                this.ylim = 0.4;
                // add background in lower half of the screen, change limit on y if necessary
                //if (this.split) {
                    this.Assets.background.moveTo({ x: 0, y: 0.4, z: -1 });
                    this.Assets.background.setScale(7, 0.05)
                    this.Assets.background.setVisible(true);
                    //limit on y coordinate (get click position from lower half if screen is split)
                    //this.ylim = 0;
                //}

                //open new .csv file
                //var fileName = this.dataFolder + '/' + this.id + '_frequency' + JSON.stringify(this.frequency) + '_split' + JSON.stringify(this.split) + '.csv';
                var fileName = this.dataFolder + '/' + this.id + '_data.csv';
                var didExist = fs.existsSync(fileName);
                this.outFile = fs.openSync(fileName, 'a');
                // possibly add header
                if (!didExist) {
                    this.writeToCSV(TrialFactory.getCSVHeader());
                }

                // create a nice centered text
                //'Nun die genauen Informationen, wie das Experiment ablaufen wird: Es gibt einen roten und einen grünen Punkt, die zu unterschiedlichen Zeiten auf einem schwarzen Hintergrund erscheinen. Ihr Ziel ist es, den Abstand zwischen den beiden Punkten so gering wie möglich zu halten, sodass der grüne und rote Punkt übereinanderliegen. Sie sehen zuerst für eine kurze Zeit den roten Punkt. Dann tippen Sie mit Ihrem Finger dort auf den Bildschirm, sodass der grüne und rote Punkt möglichst übereinstimmen. Der grüne Punkt wird angezeigt, sobald Sie den Bildschirm angetippt haben und Ihr Finger die Bildschirmoberfläche nicht mehr berührt. Also: roter Punkt - tippen - grüner Punkt. Nachdem der grüne Punkt wieder verschwunden ist, wiederholt sich der Vorgang und es erscheint erneut ein roter Punkt, Sie tippen wieder und es erscheint ein grüner Punkt. Ihre Aufgabe bleibt durchgehend dieselbe. Bitte wiederholen Sie dies bis Sie aufgefordert werden bei Bedarf eine kurze Pause einzulegen. Der erste Durchgang bis zur Pause ist dabei eine Trainingseinheit, sodass Sie sich mit dem Experiment vertraut machen können und zählt nicht zum Experiment. Danach folgen 8 weitere Durchgänge, bei denen Sie immer dasselbe Ziel verfolgen. Sollte zwischendurch "disconnecting" auf dem Bildschirm sichtbar werden, haben Sie bitte etwas Geduld bis das Tablet sich wieder mit Ihrem Internet verbindet ("reconnecting") und Sie das Experiment fortführen können. Am Ende des Experiments folgt ein letzter kurzer Fragebogen, danach ist die Studie abgeschlossen. Bitte versuchen Sie den Abstand zwischen dem roten und dem grünen Punkt so gering wie möglich zu halten. Handeln Sie dabei intuitiv und so schnell wie möglich. Tippen Sie nur mit dem Zeigefinger Ihrer dominanten Hand. Wenn Sie die Instruktionen verstanden haben und bereit sind mit dem Experiment zu starten, klicken Sie bitte in den unteren Bereich des Bildschirms.',
                let text = "Drücken Sie auf den orangenen Pfeil, um fortzufahren (ist dieser nicht direkt sichtbar, bitte zuerst einmal auf den schwarzen Bildschirm tippen)";
                if (trialNumber == 1)
                    text = ['Nun zum Experiment:','','Auf einem schwarzen Hintergrund sehen Sie nacheinander einen einzelnen roten Punkt und später denselben roten Punkt in Kombination mit einem grünen Punkt. Die Punkte erscheinen in der oberen Hälfte des Bildschirms. Zuerst sehen Sie für eine kurze Zeit den einzelnen roten Punkt. Tippen Sie dann dort am unteren Rand des Bildschirms unterhalb der grauen Linie, sodass der grüne Punkt möglichst nah an dem vorhergesehenen roten Punkt liegt und sich bestenfalls mit ihm überschneidet. Sobald Sie unterhalb der grauen Linie getippt haben und Ihr Finger die Bildschirmoberfläche nicht mehr berührt, erscheint der grüne Punkt in Kombination mit dem vorhergesehenen roten Punkt, um Ihnen den Abstand zwischen den beiden Punkten zu verdeutlichen. Ihr Ziel ist es durchgehend, den Abstand zwischen rotem und grünem Punkt so gering wie möglich zu halten, sodass bestenfalls der grüne Punkt über dem roten Punkt liegt.','', 'Nachdem der rote und grüne Punkt in Kombination wieder verschwunden sind, wird der Bildschirm kurz schwarz, bevor sich der Vorgang wiederholt. Es erscheint erneut ein einzelner roter Punkt, Sie tippen wieder dort unterhalb der grauen Linie, sodass der Abstand zwischen dem roten und grünen Punkt möglichst gering wird. Ihre Aufgabe bleibt durchgehend dieselbe. Bitte wiederholen Sie dies bis Sie aufgefordert werden bei Bedarf eine kurze Pause einzulegen.','', 'Der erste Durchgang bis zur Pause ist dabei eine Trainingseinheit, sodass Sie sich mit dem Experiment vertraut machen können und zählt nicht zum Experiment. Danach folgen 4 weitere Durchgänge, bei denen Sie immer dasselbe Ziel verfolgen (die Distanz zwischen rotem und grünem Punkt minimal zu halten). Sollte zwischendurch "disconnecting" auf dem Bildschirm sichtbar werden, haben Sie bitte etwas Geduld bis das Tablet sich wieder mit Ihrem Internet verbindet ("reconnecting") und Sie das Experiment fortführen können.','', 'Bitte versuchen Sie den Abstand zwischen dem roten und dem grünen Punkt so gering wie möglich zu halten. Handeln Sie dabei intuitiv und so schnell wie möglich. Tippen Sie nur mit dem Zeigefinger Ihrer dominanten Hand und tippen Sie nur unterhalb der grauen Linie im unteren Bereich des Bildschirms.', '', 'Wenn Sie die Instruktionen verstanden haben und bereit sind mit dem Experiment zu starten,', 'klicken Sie bitte auf den orangenen Pfeil.'] ;
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
                    //this.runQuestionnaire('end')
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


    async onTrialFinished(tid) {
            console.log("this trial: " + this.currentTrialNumber);
            //update trial number within a block
            this.currentTrialNumber += 1;
            this.Data.trial = this.currentTrialNumber;

            //show intermediate questionnaire between blocks
            if (this.currentTrialNumber == this.intermediateQuestionnaireTrial) {
                //update overall number of blocks
                this.Data.thisblock += 1;
                await this.saveExperimentData().then(() => {
                    console.log("done saving")
                    this.db.getExperimentData(this.internalData.id).then(data => console.log(data))
                    const questionnaire = this.Data.thisblock > sineOffset.blockNumber ? 'end' : 'intermediate';
                    this.runQuestionnaire(questionnaire, this.currentTrialNumber);
                });
            } else {
                //show a new target
                TrialFactory.showTarget(tid + 1, this, this.Assets.redKey, this.Assets.greenKey);
                // make sure we don't forget to save
                await this.saveExperimentData();
            }
            // internally increase trial number
            this.notifyNextTrial();
        } //onTrialFinished


    onClick(click) {
            if (click.isDown)
                return;

            //console.log("x: " + click.x + " y: " + click.y);
            if (!this.started && click.y > 0.3 && click.x > 0.4) {

                this.Assets.arrow.setVisible(false);

                //handle first trial
                this.started = true;
                //this.Texts.centerText.set(["Click to start"]);
                // start first trial
                this.Texts.centerText.setVisible(false);
                TrialFactory.showTarget(this.currentTrialNumber, this, this.Assets.redKey, this.Assets.greenKey);
            } else {
                // handle all other trials
                if (!click.isDown && this.currentTrial != null && click.y > this.ylim) {
                    this.currentTrial.handleClick(click);
                    //this.Texts.centerText.set([
                    //  "x: " + click.x.toFixed(2) + ", y: " + click.y.toFixed(2)
                    //]);
                }
            }
        } //onClick

    onDisconnect() {
            // close data file on disconnect
            if (this.outFile != null) {
                fs.closeSync(this.outFile);
            }
        } //onDisconnect
}
