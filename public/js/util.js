// helper functions to convert between normalized coordinates (norm space)
// and pixel coordinates (screen space)

var _pixelRatio = undefined;

function toNormSpace(xy) {
    return {
        x: xy.x / screenWidth() - 0.5,
        y: xy.y / screenHeight() - 0.5
    }
}

function toScreenSpace(xy) {
    return {
        x: (xy.x + 0.5) * screenWidth(),
        y: (xy.y + 0.5) * screenHeight()
    }
}

function getPixelRatio(){
    return _pixelRatio || (_pixelRatio = navigator.platform.includes("Mac") ? 1 : window.devicePixelRatio);
}

function screenWidth(){
    return window.screen.width;// * getPixelRatio();
}

function screenHeight(){
    return window.screen.height;// * getPixelRatio();
}

function fixViewport(game) {
    const width = screenWidth();
    const height = screenHeight();
    if (game.scale.width != width || game.scale.height != height) {
        let viewport = document.querySelector("meta[name=viewport]");
        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = 'viewport';
            document.head.appendChild(viewport);
        }
        viewport.setAttribute('content', 'width=' + width + ', initial-scale=1.0, maximum-scale=1.0');
        game.scale.resize(width, height);
    }
}


// some cookie access functions
function getCookie(name) {
    let retVal = null;
    document.cookie.split(';').forEach(element => {
        const kv = element.split('=');
        if (kv[0].trim() == name)
            retVal = kv[1];
    });
    return retVal;
}

function setCookie(cname, cvalue, exdays) {
    const d = new Date();
    d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
    document.cookie = cname + "=" + cvalue + ";" + "expires=" + d.toUTCString() + ";path=/";
}

function removeCookie(cname) {
    setCookie(cname, '', -1);
}

export default toNormSpace;
export { toNormSpace, toScreenSpace, getCookie, setCookie, removeCookie, fixViewport, screenHeight, screenWidth }
