const fs = require('fs');

module.exports = class Trial {
    // since we write stuff to the csv in here, we also define the header here 
    static getCSVHeader() {
        return "servertime,timestamp,mouseX,mouseY\n";
    }

    // initialize some values
    constructor(id, experiment, redDot, trialSettings) {
        console.log('starting trial with the following settings: ' + JSON.stringify(trialSettings));
        this.trialSettings = trialSettings;
        this.experiment = experiment;
        this.clickCounter = 0;
        this.redDot = redDot;
        this.id = id;
    }

    handleClick(click) {
        // count clicks
        this.clickCounter += 1;

        // if there was more than one click for this trial, we don't do anything but only 
        // increase the counter and  tell the participant to stay calm
        if (this.clickCounter > 1) {
            this.experiment.runOnClient(client => {
                this.experiment.Texts.centerText.setVisible(true);
                this.experiment.Texts.centerText.set(["be patient!"]);
                client.wait(1000);
            }).then(() => {
                // reduce click counter 
                this.clickCounter -= 1;
                // if we reached zero, hide the text and finish the trial
                if (this.clickCounter == 0) {
                    this.experiment.Texts.centerText.setVisible(false);
                    this.finish();
                }
            });
        }
        // the else part only happens for the first click
        else {
            // handle a new click
            this.clickReceived = true;
            var modifiedX = click.x + 0.1 * (Math.random() - 0.5);
            var modifiedY = click.y + 0.1 * (Math.random() - 0.5);

            // the following chain of events should run on the client, to make sure timing is fine
            this.experiment.runOnClient(client => {
                // move red dot
                this.redDot.moveTo({ x: modifiedX, y: modifiedY });
                // show now ...
                this.redDot.setVisible(true);
                // ... wait a second ...
                client.wait(1000);
                // ... hide it again
                this.redDot.setVisible(false);
            }).then(() => {
                this.clickCounter -= 1;
                if (this.clickCounter == 0) {
                    this.finish()
                }
            });

            // write new line to csv file
            fs.writeFileSync(this.experiment.outFile, Date.now() + ',' + click.timeStamp + ',' + click.x + ',' + click.y + '\n');
        }
    }

    finish() {
        this.isFinished = true;
        this.experiment.currentTrial = null;
        this.experiment.onTrialFinished(this.id);
    }
}