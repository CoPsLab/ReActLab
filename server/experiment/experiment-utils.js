const fs = require('fs');

// Array Shuffle from https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
function shuffle(array) {
    var currentIndex = array.length,
        temporaryValue, randomIndex;

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

function getTrialFromBlocks(blocks, trialnumber) {
    trialnumber -= 1;
    let result = undefined;
    if (blocks) {
        Object.values(blocks).forEach(block => {
            const isArray = Array.isArray(block);
            const length = isArray ? block.length : 1;
            if (trialnumber >= length)
                trialnumber -= length;
            else if (trialnumber >= 0) {
                result = isArray ? block[trialnumber] : block;
                trialnumber = -1;
            }
        });
    }
    return result;
}

function createCombinations(elements) {
    const recurse = (kvs, rv) => {
        const front = kvs.shift();
        return !front ? rv : recurse(kvs, front[1].flatMap(value => {
            const toAdd = {
                [front[0]]: value
            };
            return rv.length == 0 ? [Object.assign({}, toAdd)] : rv.map(entry => Object.assign({}, entry, toAdd))
        }));
    }

    return recurse(Object.entries(elements), []);
}


function writeQuestionnairesToString(questionnaireData, fieldNames, keys = [], append = false) {
    // open file
    let retVal = "";
    // write header
    if (!append) {
        retVal += '"iteration"';
        fieldNames.forEach(f => retVal += ',"' + f + '"');
        retVal += '\n';
    }

    // write data (one line per questionnaire)
    if (questionnaireData) {
        // fix keys
        keys = typeof keys == 'object' ? keys.map(x => String(x)) : [String(keys)];
        // filter, sort and write
        Object.entries(questionnaireData)
            .filter(([key,]) => keys.length == 0 || keys.includes(key)).sort()
            .forEach(qData => {
                // write iteration
                retVal += qData[0];
                // write data
                fieldNames.forEach(f => retVal += ',' + (qData[1][f] || ''));
                // end line
                retVal += '\n';
            });
    }
    // close file
    return retVal;
}


function writeQuestionnairesToCSV(questionnaireData, fields, csvFileName, keys = [], append = false) {
    // open file
    const outFile = fs.openSync(csvFileName, append ? 'a' : 'w');
    // write data
    fs.writeFileSync(outFile, writeQuestionnairesToString(questionnaireData, fields.map(f => f.name), keys, append));
    // close file
    fs.closeSync(outFile);
}

module.exports = { shuffle, getTrialFromBlocks, createCombinations, writeQuestionnairesToCSV, writeQuestionnairesToString };