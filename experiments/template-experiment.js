module.exports = class extends require('../server/experiment/experiment-base') {
    // --------------------------------
    // settings for experiment go here:
    static mainScript = 'game.js'; // set main script, path is relative to 'public' folder
    static numTrials = 5; // set number of trials
    static LoadAssets = { // select the Assets to be loaded
        cursor: 'assets/circle.png', // example for showing a cursor. Path is relative to the public folder
    };
    // --------------------------------

    start(trialNumber) {
        // show the cursor
        this.Assets.cursor.setVisible(true);
        // create a nice centered text
        this.createText('centerText', 'This is a template project', { x: -0.5, y: -0.25 }, {
            color: '#00AFFF',
            fontSize: '100px',
            align: 'center',
            fontStyle: 'bold',
            fixedWidth: this.WindowInfo.width,
            wordWrap: { width: 0.9 * this.WindowInfo.width }
        });
    }

    onClick(click) {
        this.Texts.centerText.set([
            "This is a template project",
            "x: " + click.x.toFixed(2) + ", y: " + click.y.toFixed(2)
        ]);
    }
}