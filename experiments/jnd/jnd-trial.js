module.exports = {
    getCSVHeader: function () {
        return "sub,trial,color,blur,distance,xTest,xReference,referenceFirst,yPos,response,timePresent,timeResponses";
    },

    showBlob: function (id, experiment, reference, test, prompt) {
        // set positions
        var xReference = (Math.random() - 0.5) * 0.4; //uniform distribution
        var distance = experiment.Data.distance[experiment.currentTrialNumber - 1];
        var xTest = xReference + distance;
        var yPos = -0.3;
        console.log("array element " + distance + " trial: " + experiment.currentTrialNumber);

        var referenceFirst = Math.random() < 0.5;

        experiment.runOnClient(client => {
            client.wait(500);
            // show reference stimulus in random position (500 ms)
            reference.moveTo({ x: xReference, y: yPos });
            test.moveTo({ x: xTest, y: yPos });
            if(referenceFirst){
                first = reference
                second = test
                
            }else{
                first = test
                second = reference
            }

            first.setVisible(true);
            first.doIn(500, 'setVisible', false);//show second stimulus (500 ms)
            client.wait(1000); // 500 ms for reference - 500 ms  inter-stimulus interval (like in Matlab)
            second.setVisible(true);
            second.doIn(500, 'setVisible', false)//show second stimulus (500 ms)
            client.wait(800); // 500+300 ms
            //ask perceptual judgement
            prompt.setVisible(true).then(function () { module.exports.startTrial(id, experiment, prompt) });
        });
        //write on file (sub,trial,blob,distance,xTest,xReference,yPos)        
        // write on file (timetarget)
        experiment.timePresentation = Date.now();
        experiment.writeToCSV('\n' + experiment.id + ',' + experiment.currentTrialNumber + ',' + experiment.color + ',' + JSON.stringify(experiment.blur) + ',' + distance + ',' + xTest + ',' + xReference + ',' + referenceFirst + ',' + yPos + ',');
    },


    startTrial: function (id, experiment, prompt) {
        experiment.currentTrial = {
            trialIdentifier: id,
            clickReceived: false,

            handleClick: function (click) {
                // a link to this, since it cannot be used in sub-functions
                const self = this;

                if (click.x < 0) {
                    var response = "left"
                } else[
                    response = 'right'
                ]

                // handle a new click
                this.clickReceived = true;
                var clickTime = Date.now();

                console.log("trialsInBlock" + experiment.myTrials);

                // store as shortcut
                experiment.runOnClient(client => {
                    client.wait(250);   // lag between target and feedback  
                    prompt.setVisible(false).then(function () { self.finish(); });
                });

                // write response to CSV file
                experiment.writeToCSV(response + ',');
                // write temporal events to csv file 
                experiment.writeToCSV(experiment.timePresentation + ',' + clickTime);
                experiment.currentTrial = null;
            },

            finish: function () {
                //prompt.setVisible(false);
                experiment.currentTrial = null;
                experiment.onTrialFinished(this.trialIdentifier);
            },

        }; //experiment.currentTrial
        return experiment.currentTrial;

    }, //startTrial: function(id, experiment, prompt)
}
