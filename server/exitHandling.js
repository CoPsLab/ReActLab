const Process = require('process');

var exitHandlers = [];

function mainExitFunction() {
    Promise.all(exitHandlers.map(async h => await h())).then(() => Process.exit(0));
};

module.exports = {
    addHandler(handler) {
        exitHandlers.push(handler);

        // if this was the first handler, install main signal handler
        if (exitHandlers.length == 1) {
            Process.on('exit', mainExitFunction);
            Process.on('SIGINT', mainExitFunction);
        }
    }
}