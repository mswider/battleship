import express from 'express';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import morgan from 'morgan';

const app = express();
app.use(express.json());
app.use(morgan('dev'));

const argv = yargs(hideBin(process.argv))
  .option('port', {
    alias: 'p',
    default: 3000,
    describe: 'Configures the port used for the web server'
  }).argv;

const port = argv.port;

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


`;

app.get('/', (req, res) => {
    res.send(home);
});

app.listen(port, console.log(startMsg));