module.exports = {
    getCSVHeader: function() {
        return "sub,trial,target,split,frequency,targetX,targetY,mouseX,mouseY,offsetX,offsetY,feedbackX,feedbackY,timetarget,timestamp,clickTime,feedbackVisible\n";
    },

    showTarget: function(id, experiment, targetKey, feedbackKey) {
        var targetX = (Math.random() - 0.5) * 0.75;
        var targetY = -0.35;//(Math.random() - 0.5) * 0.8; //targets appear on any y coordinate
        if(experiment.split){
          var targetY = (Math.random() + 0.1) * (-0.3); //targets appear only in upper half
        }

        experiment.runOnClient(client => {
            client.wait(350);
            targetKey.moveTo({ x: targetX, y: targetY });
            targetKey.setVisible(true);
            // write on file (timetarget)
            experiment.targetPresentation = Date.now();
            targetKey.doIn(200, 'setVisible', false).then(function() { module.exports.startTrial(id, experiment, feedbackKey, targetKey) });
        });
        //write on file (sub,trial,split,frequency,targetX,targetY)
        experiment.writeToCSV(experiment.id + ',' + experiment.currentTrialNumber + ',' + JSON.stringify(experiment.targetVisible) + ',' + JSON.stringify(experiment.split) + ',' + experiment.frequency + ',' + targetX + ',' + targetY + ',');
    },


    startTrial: function(id, experiment, feedbackKey, targetKey) {
        experiment.currentTrial = {
            trialIdentifier: id,
            clickReceived: false,

            handleClick: function(click) {
                // a link to this, since it cannot be used in sub-functions
                const self = this;

                // handle a new click
                this.clickReceived = true;
                var clickTime = Date.now();
                var freq = experiment.frequency;
                var offsetX = -0.1 * Math.sin(2 * Math.PI * freq / experiment.myTrials * (this.trialIdentifier - 1));
                var offsetY = -0.35; // feedback close to your finger
                console.log("offset: " + offsetX + ", trialsInBlock" + experiment.myTrials);

                if(experiment.split){
                  var offsetY = -0.5; // feedback shifted on top of screen
                }

                var modifiedX = click.x + offsetX;
                var modifiedY = offsetY; //feedback appears where you pointed + offset
                //var modifiedY = targetY; // feedback appears next to target

                // store as shortcut
                experiment.runOnClient(client => {
                  client.wait(300);   // lag between target and feedback
                  feedbackKey.moveTo({ x: modifiedX, y: modifiedY });
                  // show now and then hide again
                  feedbackKey.setVisible(true);

                  if(experiment.targetVisible){
                    targetKey.setVisible(true);
                  }

                  //if(this.targetVisible)
                  //targetKey.setVisible(true);

                  feedbackKey.doIn(350, 'setVisible', false).then(function() { self.finish(); });
                });
                //targetKey.doIn(0, 'setVisible', false);
                var feedbackVisible = Date.now();
                // write coordinates to csv file
                experiment.writeToCSV(click.x + ',' + click.y + ',' + offsetX + ',' + offsetY + ',' + modifiedX + ',' + modifiedY + ',');
                // write temporal events to csv file
                experiment.writeToCSV(experiment.targetPresentation + ',' + click.timeStamp + ',' + clickTime + ',' + feedbackVisible + '\n');
                experiment.currentTrial = null;
            },

            finish: function() {
                targetKey.setVisible(false);
                experiment.currentTrial = null;
                experiment.onTrialFinished(this.trialIdentifier);
            },

        }; //experiment.currentTrial
        return experiment.currentTrial;

    }, //startTrial: function(id, experiment, redKey)
}
