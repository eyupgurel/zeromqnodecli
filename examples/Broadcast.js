/* Simple pub/sub broadcasting example */

const uWS = require('../dist/uws.js');
const port = 9001;

const app = uWS.SSLApp({
  key_file_name: 'privkey1.pem',
  cert_file_name: 'fullchain1.pem',
  passphrase: '1234'
}).ws('/broadcast', {
  /* Options */
  compression: 0,
  maxPayloadLength: 16 * 1024 * 1024,
  idleTimeout: 10,

  /* Handlers */
  open: (ws) => {
    /* Let this client listen to topic "broadcast" */
    ws.subscribe('broadcast');
  },
  message: (ws, message, isBinary) => {
    /* Broadcast this message */
    ws.publish('broadcast', message, isBinary);
  },
  drain: (ws) => {

  },
  close: (ws, code, message) => {
    /* The library guarantees proper unsubscription at close */
  }
}).any('/*', (res, req) => {
  res.end('Nothing to see here!');
}).listen(port, (token) => {
  if (token) {
    console.log('Listening to port ' + port);
  } else {
    console.log('Failed to listen to port ' + port);
  }
});
