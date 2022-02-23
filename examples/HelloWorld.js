/* Minimal SSL/non-SSL example */

const uWS = require('../dist/uws.js');
const port = 9001;

const app = uWS.SSLApp({
  key_file_name: 'privkey1.pem',
  cert_file_name: 'fullchain1.pem',
  passphrase: '1234'
}).
ws('/trades', {
  /* Options */
  compression: 0,
  maxPayloadLength: 16 * 1024 * 1024,
  idleTimeout: 10,
  /* Handlers */
  open: (ws) => {
    ws.isActive = true;
    /* Let this client listen to topic "broadcast" */
    //console.log(`A WebSocket connected in lieue of ${ws['user'].phoneNumber}`);
    ws.subscribe('broadcast-trades');
  },
  message: (ws, message, isBinary) => {
    const m = JSON.parse(new TextDecoder().decode(message));
    if (m && m.init) {
      binance.websockets.trades(tickerList, (trades) => {
        redisPublisher.publish("StopChannel", JSON.stringify({ symbol: trades.s, price: trades.p, date: new Date() }));
        ws.publish('broadcast-trades', new TextEncoder().encode(JSON.stringify(trades)), isBinary);
      }, error => {
        console.error(error)
      });
    }
  },
  drain: (ws) => {
  },
  close: (ws, code, message) => {
    //console.log('A WebSocket closed!');
    /* The library guarantees proper unsubscription at close */
  }
}).
get('/*', (res, req) => {
  res.end('Hello World!');
}).listen(port, (token) => {
  if (token) {
    console.log('Listening to port ' + port);
  } else {
    console.log('Failed to listen to port ' + port);
  }
});
