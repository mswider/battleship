import express from 'express';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import morgan from 'morgan';
import crypto from 'crypto';

const app = express();
app.use(express.json());
app.use(morgan('dev'));

function log() {
    console.log(new Date().toLocaleString() + ' -', ...arguments);
}
function safeCompare(userInput, secret) {
    const userInputLength = Buffer.byteLength(userInput);
    const secretLength = Buffer.byteLength(secret);

    const userInputBuffer = Buffer.alloc(userInputLength, 0, 'utf8');
    userInputBuffer.write(userInput);
    const secretBuffer = Buffer.alloc(userInputLength, 0, 'utf8');
    secretBuffer.write(secret);

    return !!(crypto.timingSafeEqual(userInputBuffer, secretBuffer) & userInputLength === secretLength);
}
function generatePassword() {
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const length = 12;
    return [...Array(length)].map(_ => {
        let umax = Math.pow(2, 32), r = new Uint32Array(1), max = umax - (umax % chars.length);
        do { crypto.webcrypto.getRandomValues(r); } while(r[0] > max);
        return chars[r[0] % chars.length];
    }).join('');
}

const argv = yargs(hideBin(process.argv))
  .option('port', {
    alias: 'p',
    default: 3000,
    describe: 'Configures the port used for the web server'
  }).option('code', {
    alias: 'c',
    default: 6,
    describe: 'Sets the length of game codes'
  }).option('timeout', {
    alias: 't',
    default: 90,
    describe: 'Deletes inactive games after this many seconds'
  }).option('secret', {
    alias: 's',
    string: true,
    describe: 'Sets the password for protected routes'
  }).argv;

const port = argv.port;
const codeLength = argv.code;
const timeout = argv.timeout;
const webSecret = argv.secret || generatePassword();
const webSecretEncoded = `Basic ${Buffer.from(`admin:${webSecret}`).toString('base64')}`;
const maxGames = 10 ** codeLength;

function authenticate(req, res, next) {
    const b64auth = req.headers.authorization || '';
    if (safeCompare(b64auth, webSecretEncoded)) return next();
    res.set('WWW-Authenticate', 'Basic realm="battleship-admin"');
    res.status(401).send(req.headers.authorization ? 'Forbidden' : 'Unauthorized');
}

const home = `
<!DOCTYPE html>
<html>
  <head>
    <title>Battleship Server</title>
  </head>
  <body style="font-family: monospace">
    <h1>Battleship</h1>
    <p>This is a server for hosting battleship games</p>
    <a href="https://github.com/mswider/battleship">https://github.com/mswider/battleship</a>
  </body>
</html>
`;
const startMsg = `

                        ┌──────────────────────────────────────┐
                        │                                      │
                        │   Battleship started on port ${port.toString().padEnd(5)}   │
                        │                                      │
                        └──────────────────────────────────────┘

                                         |__
                                         |\\/
                                         ---
                                         / | [
                                  !      | |||
                                _/|     _/|-++'
                            +  +--|    |--|--|_ |-
                         { /|__|  |/\\__|  |--- |||__/
                        +---------------___[}-_===_.'____                 /\\
                    ____\`-' ||___-{]_| _[}-  |     |_[___\\==--            \\/   _
     __..._____--==/___]_|__|_____________________________[___\\==--____,------' .7
    |                                                                     BB-61/
     \\_________________________________________________________________________|

                            Game code length: ${codeLength}
                            Maximum ongoing games: ${maxGames.toLocaleString()}
                            Security Code: ${webSecret}
`;

const games = new Map();
const playerIndex = new Map();

class Game {
    id;
    lastPing;
    players;
    mode;

    constructor(gameID) {
        this.id = gameID;
        this.lastPing = Date.now();

        this.players = [...[,,]].map(_ => Game.generatePlayer());
        this.players.map(player => playerIndex.set(player, gameID));

        this.mode = Game.modes.WAIT;

        log(`new game with id ${gameID}`);
    }

    ping() {
        this.lastPing = Date.now();
    }
    remove() {
        this.players.map(player => playerIndex.delete(player));
    }

    static modes = {
        WAIT:       1,
        LAYOUT:     2,
        PLAYER0:    3,
        PLAYER1:    4,
        END:        5
    }
    static generateID(length) {
        return [...Array(length)].map(_ => Math.random() * 10 | 0).join('');
    }
    static generatePlayer() {
        let player = crypto.randomUUID();
        while (playerIndex.has(player)) {
            player = crypto.randomUUID();
        }
        return player;
    }
}

app.get('/', (req, res) => {
    res.send(home);
});

app.post('/api/new', (req, res, next) => {
    if (games.size == maxGames) {
        res.sendStatus(503);
    } else {
        next();
    }
}, (req, res) => {
    let gameID = Game.generateID(codeLength);
    while (games.has(gameID)) {
        gameID = Game.generateID(codeLength);
    }

    const game = new Game(gameID);
    const [userID] = game.players;
    games.set(gameID, game);

    res.json({ gameID, userID });
});
app.post('/api/join/:id', (req, res) => {
    if (games.has(req.params.id) && games.get(req.params.id).mode == Game.modes.WAIT) {
        const game = games.get(req.params.id)
        const [_, userID] = game.players;
        game.ping();
        game.mode = Game.modes.LAYOUT;
        log(`Player connected to game ${req.params.id}, game starting...`);
        res.json({ userID });
    } else {
        res.status(404).send('Game not found');
    }
});

const api = express.Router();
app.use('/api/:id', (req, res, next) => {
    const valid = playerIndex.has(req.params.id);
    if (valid) {
        req.user = {
            game: playerIndex.get(req.params.id),
            id: games.get(playerIndex.get(req.params.id)).players.indexOf(req.params.id)
        };
        next();
    } else {
        res.sendStatus(401);
    }
});

api.get('/info', (req, res) => {
    res.send(`User ID is: ${req.user.id}; Game ID: ${req.user.game}`);
});

const admin = express.Router();

admin.get('/gamestate/:id', (req, res) => {
    if (games.has(req.params.id)) {
        res.json(games.get(req.params.id));
    } else {
        res.status(404).send('Game not found');
    }
});
admin.get('/games', (req, res) => {
    res.json([...games.keys()]);
});

app.use('/api/:id', api);
app.use('/admin', authenticate, admin);
app.listen(port, console.log(startMsg));