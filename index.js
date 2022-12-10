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
  }).argv;

const port = argv.port;
const codeLength = argv.code;
const timeout = argv.timeout;
const maxGames = 10 ** codeLength;

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
`;

const games = new Map();
const playerIndex = new Map();

class Game {
    id;
    lastPing;
    players;

    constructor(gameID) {
        this.id = gameID;
        this.lastPing = Date.now();

        this.players = [...[,,]].map(_ => Game.generatePlayer());
        this.players.map(player => playerIndex.set(player, gameID));

        log(`new game with id ${gameID}`);
    }

    ping() {
        this.lastPing = Date.now();
    }
    remove() {
        this.players.map(player => playerIndex.delete(player));
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
    const [hostID] = game.players;
    games.set(gameID, game);

    res.json({ gameID, hostID });
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

app.use('/api/:id', api);
app.listen(port, console.log(startMsg));