import initializeClient from './client.js'
import * as util from './util.js'

// game with basic configuration
const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'phaser-canvas',
    backgroundColor: '0x000000',
    fps: {
        target: 60,
        forceSetTimeOut: true
    },
    scene: {
        preload: preload,
        create: create,
        update: update,
    },
    scale: {
        // we'll handle scaling on our own
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.NO_CENTER,
        // make it have the same resolution as the screen
        width: util.screenWidth(),
        height: util.screenHeight()
    }
});

// initialize connection 
const Client = initializeClient(game);
const Assets = Client.registry;

// preload some images
function preload() {
    Client.phaser = this;
    Reflect.ownKeys(preloadAssets).forEach(key => {
        this.load.image(key, preloadAssets[key]);
    });
}

function create() {
    // some initial changes regarding the view
    document.body.style.backgroundColor = "black";
    document.body.style.margin = 0;
    util.fixViewport(game);

    // disable context menus and cursur visualization
    this.input.mouse.disableContextMenu();
    this.input.setDefaultCursor("none");

    this.game.scale.on('orientationchange', orientation => {
        Client.socket.emit('orientationchange', orientation);
    });

    this.game.scale.on('resize', handleResize);

    // if any mouse button was pressed, the game should go to fullscreen mode 
    // and inform the server about the click position
    this.input.keyboard.on('keydown', function (event) {
        Client.sendKey(event.keyCode, game.getTime(), true);
    })

    this.input.keyboard.on('keyup', function (event) {
        Client.sendKey(event.keyCode, game.getTime(), false);
    })

    this.input.on('pointerdown', function (pointer) {
        // go to fullscreen initially
        if (!game.scale.isFullscreen && !game.experimentIsFinished)
            game.scale.startFullscreen();
        if (!game.experimentIsFinished)
            Client.sendClick(pointer.worldX, pointer.worldY, game.getTime(), true, pointer.button);
    });

    this.input.on('pointerup', function (pointer) {
        // react on mouse button up events
        if (!game.experimentIsFinished)
            Client.sendClick(pointer.worldX, pointer.worldY, game.getTime(), false, pointer.button);
    });

    // initial position is center of screen
    const initialPosition = { x: game.scale.width / 2, y: game.scale.height / 2 };
    const interactableParams = Reflect.ownKeys(preloadAssets).map(key => {
        return { name: key, pos: initialPosition }
    });

    // send information to start the experiment
    Client.start(interactableParams);
}

// update text and pointer visualization in here
function update() {
    const pointer = this.input.activePointer;
    const xy = util.toNormSpace({ x: pointer.worldX, y: pointer.worldY });

    // update cursor
    if (Assets.cursor != null) {
        Assets.cursor.moveTo(xy);
        if (!Assets.cursor.sprite.visible)
            Assets.cursor.setVisible(true);
    }

    // handle client crossbox
    Client.handleMousePos(xy, pointer.isDown);

    // update text
    if (Assets.textTopLeft != null)
        Assets.textTopLeft.set([
            'x: ' + xy.x.toFixed(2) + ' (' + pointer.worldX + ')',
            'y: ' + xy.y.toFixed(2) + ' (' + pointer.worldY + ')',
            'isDown: ' + pointer.isDown
        ]);

    // finally run update of Client
    Client.update(game.getTime());
}

function handleResize() {
    setTimeout(() => util.fixViewport(game), 100);
}

// install resize handler
if (game.scale.scaleMode == Phaser.Scale.NONE) {
    window.onresize = handleResize;
}