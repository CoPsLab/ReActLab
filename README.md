# Phaser-Base

This is a template project for experiments that should be run in a browser. It builds on the nodejs framework and uses additional modules. 

Rendering in the browser is performed using the [phaser 3 framework](https://phaser.io).

## Contents

* [Features](#features)
* [Usage](#usage)
* [Designing your own experiment](#designing-your-own-experiment)
   * [Experiment Structure](#experiment-structure)
   * [Experiment Callbacks](#experiment-callbacks)
   * [Experiment Functions](#experiment-functions)
      * [Server-side Functions](#server-side-functions)
      * [Client-side Functions](#client-side-functions)
      * [Example Code](#example-code)
   * [Questionnaires](#questionnaires)
      * [Initial Questionnaire](#initial-questionnaire)
      * [Intermediate Questionnaires](#intermediate-questionnaires)
   
* [Experiment Template](#experiment-template)
* [Concepts](#concepts)
* [Folder Structure](#folder-structure)

## Features

The following features are implemented for now:

* Invitation via eMail
* Running online experiments (yay!)
* QR Codes for scanning from tablets
* Existing experiment overview, including access to QR codes
* Downloading experiment results


## Usage

### Prerequisites

Only [nodejs](https://nodejs.org/en/download/) and the included package manager npm are required. 

### (initial) installation of dependencies
To run the server on the local computer open a terminal and navigate to the project folder. There run the command `npm install`, which will download and install all the required nodejs modules. This should be done after every update, since additional dependencies might have been added. If you forget to do it, you will receive an error message telling you that there are modules missing. 

### running the server
Afterwards, to start the server on your local machine, run the `node .` command in a terminal in the project folder and navigate to http://localhost:58080/ 

#### Configuration options

For developing, the easiest way to set some other than the defailt option is to create a file named `.env` in the project directory. Currently, the following options can be configured either using that file or prepending them to the ` node .` command:

Option | DefaultValue | Notes  
-------|------------- | -----
PORT | 58080  | the port at which your experiments are available
INTERFACE | '0.0.0.0' | the network interface to listen at ('0.0.0.0' means all interfaces)
DATA_DIR | '/data' | the folder in which experiment data and sqlite databases are stored
PUBLIC_DIR | '/public' | the folder containing the publicly accessible files (css, js, ...)
BASE_URL | '/' | allows you to specify a sub-url at which your experiments are available
SERVER | INTERFACE | The server url used in QR codes
MAIL_ENABLED | false | set to true to enable invitation mails
MAIL_HOST | localhost | the smtp server for sending mails
MAIL_PORT | 25 | the port of the smtp server
MAIL_USER | undefined | the username for the smtp server (if authentication is required)
MAIL_PASSWORD | undefined | the password to be used for the smtp server

For example, the `.env` file which configures the setup to listen on the loopback interface on port 12345 and stores experimentData in the folder /recordedData would look like this (the public folder is unchanged from the default in this example):

```javascript
PORT=12345
INTERFACE='127.0.0.1'
DATA_DIR='/recordedData'
```


## Designing your own experiment

To create your own experiment you have to create a file ending with `-experiment.js` in the experiments folder. Probably the best way to start is to copy the `template-experiment.js` file and rename it to something else. When you start the server, your experiment will be available at http://localhost:58080/template (where template is the name of your file, just without the trailing `-experiment.js`).

### Experiment Structure

In principle, you can use as many files as you want, to structure your code. The only requirement it the above-mentioned `-experiment.js` file, which is used as the entry point to your experiment. 

#### Experiment class

The experiment is meant to be represented by a class that extends the `IExperiment` class and is exported as a nodejs module. Hence, the basic structure of the experiment file is as follows:

```javascript
module.exports = class extends require('./experiment-base') {
   /// your code here   
```

#### Required settings

Moreover, the experiment has to specify some basic information using the following static members:

```javascript 
// required
static mainScript = 'game.js';         // the main script in the /public/js/ folder
static numTrials = 5;                  // the number of trials 
static LoadAssets = {                  // assets to be loaded for later usage in the experiment (can be empty)
   cursor: 'assets/circle.png',        // example: an asset called cursor is loaded from the /public/assets folder
};
// optional 
static questionnaires = {
   initial: 'example-form.pug',        // the form to be used as an initial questionnaire (optional)
   intermediate: 'another-form.pug'    // more questionnaires that you can use
}
```

While the first two parameters are self explanatory, the effect of `LoadAssets` is [discussed below](#using-assets).

### Questionnaires

#### Initial Questionnaire

Probably you want to ask some questions about the participant in the beginning. At least you could let the participant generate a personal code. For this purpose you can set the `formFile` variable in your experiment. It should point to a form in the experiments folder (or a subfolder). By default, this value is set to `null` and no form will be shown. 

#### Basic Form

The form is a [pug](https://pugjs.org/api/getting-started.html) template,  which will be parsed for mandatory and optional input fields. It has to extend the `/form-head` template to work. 

The minimal form, including one input field looks as follows:

```js
//- this always has to be extended:
extends /form-head

//- your form data here
block prepend form 
   input(type="text", name="code")
```

The form introduces a text field, that will be accessible via the name _code_ via the participantData field in your class. In this example, you could access it as follows: `var pCode = this.participantData.code;`

#### Table format

It is suggested to use a [html table](https://www.w3schools.com/html/html_tables.asp) to align elements. 
A simple example that adds a label in front of the input field and also adds a second field for entering a favourite color could look like this:

```js
//...
block prepend form 
   table
      tr.mandatory
         td 
            label enter your code here: 
         td
            input(type="text", name="code", value=code)
      tr.optional
         td 
            label enter your code favourite color here: 
         td
            input(type="text", name="favColor", value=favColor)
```

There are some additional features introduced with this example:
* the `value` parameter (which should always be the same as the name parameter, but without the quotation marks) allows to automatically fill the fields with values that were entered before. For example, if the participant missed to enter data and clicked on the start experiment button, he/she would not have to enter all the data again. 
* the `mandatory`/`optional` parameters that were added with a . to the table rows (`tr`). For optional parameters no value has to be provided, mandatory parameters require an inpit. By default, each parameter is considered mandatory. This means that the experiment will not be started if these parameters are not given. However, the specific `.mandatory` parameter will make the label appear in red. 

#### Intermediate Questionnaires

In order to run questionnaires in between trials, you can use the `runQuestionnaire(questionnaire, number)` function in your experiment. This will cause the browser to reload the page and show the questionnaire. After the participant filled in the questionnaire the browser will continue the experiment. 

The `questionnaire` parameter is one of the names of the questionnaires that you specified in your experiment (e.g., 'intermediate' in the [example above](#required-settings)). The parameter `number` is optional (defaults to 1) and identifies the run of the questionnaire. _Important:_ Make sure to increase this number each time you run the questionnaire.

The data that was entered is available in the `participantData` field of your experiment class as soon as the experiment continues.

_Note:_ Running an intermediate questionnaire will cause an invocation of the `disconnect` function of your experiment and a call to the `start` function with the number of the next trial.

#### Extensions

If you want to style your form on your own, you can add css files, java script files, or include css code by extending the head block as follows:

```js
//- optional, if yo want to specify more css, load scripts, etc.
block append head
    style.
        body {
            width:300px;
        } 
```

### Experiment callbacks

The experiment class can implement the following functions (callbacks) to react on events in the browser, which are described below: 

* [`initialize(sessionId)`](#initialize(sessionid))
* [`start(initialTrialNumber)`](#start(initialtrialnumber))
* [`onClick(click)`](#onclick(click))
* [`onKey(key)`](#onkey(key))
* [`onDisconnect()`](#ondisconnect())

##### `initialize(sessionId)` 

This function is called when a participant connects to the server. The parameter `sessionId` is the name of the session, which can be used for storing information (e.g., as a file name).

##### `start(initialTrialNumber)`

The start function is called each time a participant starts the experiment. This can happen more than once, since the page in the browser might have been (accidentally) reloaded. The `initialTrialNumber` parameter contains the trial number where the experiment should start. This means it is 0 for a new experiment, but may be higher when the page was reloaded.

##### `onClick(click)`

The onClick function is called when the participant clicked/touched the screen. The parameter `click` contains the following information:

```javascript
{   
   timeStamp: float  // the time in seconds since the page was loaded
   x: float          // normalized x-coordinate of the click (between -0.5 and 0.5)
   y: float          // normalized y-coordinate of the click (between -0.5 and 0.5)
   isDown: bool      // true if the button was pressed, false if it was released
   button: int       // the number of the pressed/released button (1: left, 2: middle, 3: right)
}
```

##### `onKey(key)` 

The onKey function is called when the participant pressed/released a button. The `key` parameter contains the following information:

```javascript
{
   timeStamp: float  // the time in seconds since the page was loaded
   keyCode: int      // the key code of the pressed key
   isDown: bool      // true if the button was pressed, false if it was released
}
```

##### `onDisconnect()`

The onDisconnect function is called when the client disconnected from the webpage. This also happens, when the page is reloaded. Probably you either want to close the file into which experiment data is written here or you want to delete it (if reloading is not ok and the data is unusable). 




### Experiment functions

For now there are three variables that are available for the experiment: 

```javascript
dataFolder : string  // the folder where you should store your data (e.g., csv files)
numTrials : int      // the number of trials (in case you want to modify it)
WindowInfo : {       // resolution of the screen
   height: int
   width: int   
}
```

In order to interact with the browser in the experiment class there are some functions implemented:

#### Using assets

Assets are not really a function, but rather objects that are visualized on the screen. They can be used by looking them up from the `this.Assets` object in an experiment. For example, to access the `cursor` asset that was specified [above](#required-settings), anywhere in your experiment you could write `this.Assets.cursor`. Assets support the following functions:

* `setVisible(bool)` shows or hides the Asset
* `moveTo(pos)` moves the asset to the given position which is `{x: float, y: float}` in [normalized coordinates](#normalized-coordinates)
* `doIn(time, func, param, cb)` allows to start a timer. This means, that after `time` milliseconds the function `func` is called (for now this can be only one of the above, i.e. `moveTo` and `setVisible`) with the parameter `param`. The parameter `cb` is an optional function, which is called after the function was called. This is useful sometimes, since only one timer can be active for each asset and this way you can make sure that is has finished before you set a new one.

For example, writing 
```javascript
   this.Assets.cursor.doIn(1000, 'setVisible', 'false', () => console.log('hidden'))
```
would cause the `cursor` Asset specified [above](#required-settings) to become invisible after 1 second and the string 'hidden' would be written to the console afterwards.

##### Server-Side Functions

##### `createText(name, text, pos, settings)`

Creates a new text element in the browser. The parameter `name` is the identifier which is used to access the text using `this.Texts[name]` or `this.Texts.name`.  
The parameter `text` is the initial text. It can be a simple string or an array of strings (each representing one line).
`pos` is a tuple `{x: float, y: float}` which specifies the position on the screen in [normalized coordinates](#normalized-coordinates). `settings` is directly sent to the phaser function that creates text and thus has the type [TextStyle](https://photonstorm.github.io/phaser3-docs/Phaser.Types.GameObjects.Text.html#.TextStyle) (click on the link for possible values). 

Currently, a text object supports the following functions:

* `set(text)` updates the text (set to `''` to make it invisible) 

##### `notifyNextTrial()`

The notifyNextTrial function is used to increment the internal trial counter. You should call this after each trial, if you want to allow the experiment to be continued after a page reload.

##### `finishExperiment()`

For now this function only removes the experiment cookie from the browser, but it might do more in the future. 


##### Client-Side Functions

In order to ensure timing guarantees, a list of functions that is executed one after the other can be sent to the client. For this reason, you can create a `runOnClient` block in your experiment:

```js
this.runOnClient(client => {
   // client code here
}).then(response => {
   // Code that is executed on the server after
   // the client finished the above code here
})
```

Inside this block you can access the `this.Assets` and `this.Texts` objects and call their functions as you do on the client. In addition, you can call the `wait` function (see [below](#wait(timeInMillis))), in order to cause the client to wait for the given amount of time (in milliseconds) before continuing with the next line of code. 

All functions of assets and texts are thenable. In the context of the runOnClient function, the code that is passed to the `then` function is still executed on the server. This code is called with one parameter, for now only containing the time (in the above example you would access it via `response.time`) at which the code was finished on the client. This means that it is a client timestamp, which is not in sync with the server timestamps.  This way, for example, logging can happen on the server while the client is maintaining the timing requirement as good as possible.

Using a `doIn` function of an asset or text will ignore the waiting time. More specifically, the `doIn` function runs in parallel to all other functions (including the wait function). This means, that the function invoked by `doIn` could also run during a wait passage or between any two lines of code after the `doIn` timer expired.

The `then` block is optional. The `response` parameter is - as with every timestamp from a thenable - recording the client time (in `response.time`). The code inside is executed after the client has signaled that it is done executing all the code specified in the runOnClient block.

##### `wait(timeInMillis)`

This is a function provided with the `client` parameter in the `runOnClient` funtion. Its parameter is the time in milliseconds that the client will wait until it executes the next function. The wait function is thenable, i.e. a `.then(t => {/* code */})` block can be added, where `t` is an object (for now) containing one entry `time`, which is the time on the client at which the wait function has finished waiting. 


##### Example Code 

Assuming `exp` is the variable in which the experiment is stored (i.e. `this` in the experiment class), the consider the following code:

```js
const timeBeforeSending = Date.now();
exp.runOnClient( client => {
   exp.Assets.redDot.moveTo({x: 0, y: 0});                     // move red dot to center      
   exp.Assets.redDot.setVisible(true)                          // move red dot to center
      .then(t => console.log('hiding done at ' + t.time))      // output timing info (on server)
   client.wait(1000)                                           // wait for 1 second
      .then(t => console.log('waiting finished at ' + t.time));// output timing info (on server)
   expAssets.redDot.setVisible(false)                          // hide dot again
      .then(t => console.log('showing done at ' + t.time);     // output timing info (on server)
}).then( t => {
   // this is done on the server, as soon as the client has sent the 'showing done at' message
   console.log('client done at ' + t.time + '.\nOn server ' + (Date.now() - timeBeforeSending) + 'ms passed');
});
```

Output could look like this:

```
hiding done at 4527
waiting finished at 5526
showing done at 5526
client done at 5526.
On server 1005ms passed
```

As you can see, timing is not perfect, and might even be better if you would block in the server code and send the next command afterwards. 

**BUT:** If you are not sure about the internet connection of the participant, it is probably much safer to run such code on the client.


## Experiment Template

Putting all the information from above together the experiment template in `experiment-template.js` should be understandable (I agree that there could be more example code to show all functions, but it would get too messy here - see the [phaser-base-experiment.js](experiments/phaser-base-experiment.js) file which also uses another file to define trials):

```javascript
module.exports = class extends require('./experiment-base') {
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
```

1. the required settings are specified on top
2. the `startTrial` function sets the cursor asset visible and displays a nice text
3. the `onClick` function extends the text from 2. by the click coordinates



## Concepts

### Normalized Coordinates

To abstract from the screen resolution, coordinates are meant to be stored in normalized coordinates.
This means, that the range of coordinates is from -0.5 to 0.5 for each axis, (0,0) being the center of the screen.

## Folder Structure

Currently, the structure of the project is as follows:

```
<project dir>
 - server.js        // the main js file used by node, also including route settings etc.
 - package.json     // package information for node js 

 + data             // general data folder
    + db            // folder for sqlite database files   

 + experiments      // folder including experiment files.  
    + ...           // filenames of experiments to be loaded have to end with -experiment.js

 + public           // folder that is accessible via the browser (so take care what you put in here!)
    + js            // javascript files used in the browser
        - game.js   // the main include for the client 
        - client.js // communication settings between server and client (using socket.io)
        - ...
    + css           // css files used in the browser
    + assets        // all assets used in the browser (images etc.)

 + server           // javascript files used on the server
    - auth.js       // authentication settings
    - db.js         // database settings (using sequelize.js + sqlite3)
    - setupio.js    // server side communication settings (socket.io)
    ...             // more files 

 + views            // folder containing .pug files for different views

 + sessions         // a folder created and used by the 'express-session' module
```

