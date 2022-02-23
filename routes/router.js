const WebSocket = require('ws');
const {from, merge} =  require('rxjs');
const { map, tap, filter } = require('rxjs/operators');

const uWS = require('../dist/uws.js');
const port = 9001;

const app = uWS.SSLApp({
    key_file_name: 'privkey1.pem',
    cert_file_name: 'fullchain1.pem',
    passphrase: '1234'
}).
ws('/depth', {
    compression: uWS.SHARED_COMPRESSOR,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 10,
    open: (ws) => {
        ws.isAlive = true;

        const zmq = require("zeromq");
        const sock = zmq.socket("req");

        sock.connect("tcp://127.0.0.1:4000");
        console.log("Worker connected to port 4000");

        sock.on("message", function(m) {
            //console.log("work: %s", m.toString("utf-8"));
            if (ws.isAlive) {
                ws.send(m, false, true);
            }
       });

        const buyOrderBook = new Set();
        const sellOrderBook = new Set();
        const depthSocket = new WebSocket(`wss://stream.binance.com:9443/ws/btcusdt@depth@100ms`);


        depthSocket.onmessage = (event) => {
            const m = JSON.parse(event.data);
            merge(
                from(m.b).pipe(
                    filter(b => parseFloat(b[1]) > 0.0 || (parseFloat(b[1]) === 0.0 && buyOrderBook.has(parseFloat(b[0]) * 1000000000))),
                    map(b =>
                        ({
                            price: parseFloat(b[0]),
                            epochMilli: new Date().getTime(),
                            quantity: parseFloat(b[1]),
                            id: parseFloat(b[0]) * 1000000000,
                            ot: 0,
                            cud: parseFloat(b[1]) === 0.0 ? 2 : buyOrderBook.has(parseFloat(b[0]) * 1000000000) ? 1 : 0
                        })
                    ),
                    tap(
                        order => {
                            switch (order.cud) {
                                case 0:
                                case 1:
                                    buyOrderBook.add(order.id)
                                    break;
                                case 2:
                                    buyOrderBook.delete(order.id)
                                    break;
                                default:
                                    throw new Error();
                            }
                        }
                    ),
                ),
                from(m.a).pipe(
                    filter(a => parseFloat(a[1]) > 0.0 || (parseFloat(a[1]) === 0.0 && sellOrderBook.has(parseFloat(a[0]) * 1000000000))),
                    map(a =>
                        ({
                            price: parseFloat(a[0]),
                            epochMilli: new Date().getTime(),
                            quantity: parseFloat(a[1]),
                            id: parseFloat(a[0]) * 1000000000,
                            ot: 1,
                            cud: parseFloat(a[1]) === 0.0 ? 2 : sellOrderBook.has(parseFloat(a[0]) * 1000000000) ? 1 : 0
                        })
                    ),
                    tap(
                        order => {
                            switch (order.cud) {
                                case 0:
                                case 1:
                                    sellOrderBook.add(order.id)
                                    break;
                                case 2:
                                    sellOrderBook.delete(order.id)
                                    break;
                                default:
                                    throw new Error();
                            }
                        }
                    )
                )
            ).subscribe(
                x => {
                    let json = JSON.stringify([x])
                    //console.log(json)

                    sock.send(json)

                    console.log(`buy order book size: ${buyOrderBook.size}`);
                    console.log(`sell order book size: ${sellOrderBook.size}`);
                }
            );
        }
        depthSocket.onclose = (event) => {
            //console.log('broadcast-depth-cache socket closed.');
        };

        depthSocket.onerror = (event) => {
            // Comment out logging, too many errors logged to output.
            //console.error(event);
        };
    },
    message: (ws, message, isBinary) => {
    },
    drain: (ws) => {
    },
    close: (ws, code, message) => {
    }
}).
options('/*', (res, req) => {
    res.writeHeader('Access-Control-Allow-Origin', req.getHeader('origin'));
    res.writeHeader('Access-Control-Allow-Credentials', 'true');
    res.writeHeader('Access-Control-Allow-Method', 'POST,GET,OPTIONS');
    res.writeHeader("Access-Control-Allow-Headers", "Access-Control-Allow-Headers, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers, rejectUnauthorized, credentials, requestCert, x-auth");
    res.end();
}).listen(port, (token) => {
    if (token) {
        console.log('Listening to port ' + port);
    } else {
        console.log('Failed to listen to port ' + port);
    }
});



