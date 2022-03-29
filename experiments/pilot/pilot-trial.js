const randomNormal = require("random-normal");
const pilot = require("../joint_pilot-experiment");
const math = require('mathjs');
//language of the task. Default : German ('deu'), but it is possible also Italian ("ita") and English ("eng")


module.exports = class {
  //create header for data.csv
  static getCSVHeader() {
    return "sub,trial,cond,RT,correct";
  }
  //set trial variables
  id = undefined;
  experiment = undefined;
  led = undefined;

  constructor(id, experiment) {

    this.trialIdentifier = id;
    this.experiment = experiment;
    
    if(Math.random() < 0.5){
      this.trialCond = 'nogo';
      this.led = this.experiment.Assets.red;
    }else{
      this.trialCond = 'go';
      this.led = this.experiment.Assets.blue;
    }

    this.led.setScale(0.2, 0.2);
    //this.led.setVisible(false);
    this.ledTime = 500;
    

    // set longer timeout for first trial
    if (this.trialIdentifier == 1){
      console.log("exp id" + this.trialIdentifier);
      var tOut = 5000;
    }else{
      var tOut = 0;

    }

    //show objects (with a delay if needed)
    setTimeout(() => this.experiment.runOnClient(client => {
      this.startTime = Date.now();
      console.log("Start time: " + this.startTime);
      this.showSetting()
    }), tOut);
  }

  showSetting() {//show all stimuli on starting position
    // set positions
    var x = 0
    var y = 0;
    this.experiment.Data.posX = x;
    this.experiment.Data.posY = y;
    //reset starting position at the beginnign of the block or in alone condition - use most recent position otherwise


    this.experiment.runOnClient(client => {
      this.led.setVisible(true);
      this.startShow = Date.now();
      console.log("show: " + this.startShow);
      client.wait(this.ledTime);
      this.led.setVisible(false);
    });
    setTimeout(() => this.finish(), 2*this.ledTime + 2000)//*Math.random()


    //save starting positions on data.csv
    // this.experiment.writeToCSV(yStart + ',' + xHandle2 + ',' + xMarble + ',' + xHandle + ',')//HandleStart,xHandle2Start,marbleStart,xHandleStartBefore
  }

  //deal with click actions during trial 
  handleClick(click) {
    //set positions, limits around exact positions
    if (click.isDown){
      this.click = Date.now();
      this.reactionTime = this.click - this.startShow      
      console.log("click detected: " + this.click);
      if(this.trialCond == 'go'){
        this.isCorrect = true
      }else{
        this.isCorrect = false
      }
    }
  }

  finish() {
    if(!this.reactionTime){
      this.reactionTime = 'NA'
      if(this.trialCond == 'go'){
        this.isCorrect = false
      }else{
        this.isCorrect = true
      }
    }
    this.experiment.writeToCSV('\n' + this.experiment.id + ',' + this.trialIdentifier + ',' + this.trialCond + ',' + this.reactionTime + ',' + this.isCorrect);
    this.experiment.onTrialFinished();
  }
}