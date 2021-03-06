const yargs = require('yargs');

const argv = yargs.
    command('feed', 'Feed matching engine with binance depth stream.',
        {
            feed: {
                description: 'Feed matching engine with binance depth stream. Matching engine is on the receiving end of ZeroMQ request socket',
                alias: 'feed',
                builder: {
                    zmqReqUri: {
                        describe: 'the ZeroMQ request socket to connect to',
                        demandOption: true,
                        type: 'string'
                    },
                    zmqReqPort: {
                        describe: 'the ZeroMQ request socket port to connect to',
                        demandOption: true,
                        type: 'number'
                    },
                    uWebSocketBroadCastUri: {
                        describe: 'asks, bids, order matches and matching engine state is broadcasted through this socket uri',
                        demandOption: true,
                        type: 'string'
                    },
                    uWebSocketBroadCastPort: {
                        describe: 'Second Number',
                        demandOption: true,
                        type: 'number'
                    },
                    binanceDepthSocketUri: {
                        describe: 'the binance socket through which depth is intended to be consumed',
                        demandOption: true,
                        type: 'string'
                    },
                    maxBoardSize: {
                        describe: 'Maximum number of bids or asks to be held on bid and ask boards until they are flushed',
                        demandOption: true,
                        type: 'number'
                    },
                    orderPair: {
                        describe: 'the order pair to be fed into the order matching engine',
                        demandOption: true,
                        type: 'string'
                    },

                }
            }}
        ).argv;

const WebSocket = require('ws');
const {from, merge} =  require('rxjs');
const { map, tap, filter, groupBy,mergeMap,toArray,reduce } = require('rxjs/operators');


const uWS = require('../dist/uws.js');
const zmq = require("zeromq");
const sock = zmq.socket("req");

var initialized = false;

const app = uWS.SSLApp({
    key_file_name: 'privkey1.pem',
    cert_file_name: 'fullchain1.pem',
    passphrase: '1234'
}).
ws(`/depth/${argv.orderPair}`, {
    compression: uWS.SHARED_COMPRESSOR,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 8,
    open: (ws) => {
        ws.isAlive = true;
        /* Let this client listen to topic "broadcast" */
        //console.log(`A WebSocket connected in lieue of ${ws['user'].phoneNumber}`);
        sock.connect(`${argv.zmqReqUri}:${argv.zmqReqPort}`);
        console.log(`socket connected to ${argv.zmqReqUri}:${argv.zmqReqPort}`);

        //sock.connect("tcp://127.0.0.1:4000");
        //console.log("Worker connected to port 4000");

        ws.subscribe('broadcast-depth');
    },
    message: (ws, message, isBinary) => {

        const m = JSON.parse(new TextDecoder().decode(message));

        if (m && m.init && !initialized) {
            initialized = true;
            sock.on("message", function(m) {
                const es =  JSON.parse(m);  //console.log("work: %s", m.toString("utf-8"));

                if(sellOrderBook.size > argv.maxBoardSize){
                    sellOrderBook.clear();
                }

                if(buyOrderBook.size > argv.maxBoardSize) {
                    buyOrderBook.clear();
                }

                if (ws.isAlive) {
                    ws.publish('broadcast-depth', m, isBinary);
                }
            });

            const buyOrderBook = new Set();
            const sellOrderBook = new Set();
            const depthSocket = new WebSocket(`${argv.binanceDepthSocketUri}`);
            console.log(`binance depth stream ${argv.binanceDepthSocketUri}`);

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
                ).
                subscribe(
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
        }
        if (m && m.unsubscribe) {
            ws.unsubscribe('broadcast-depth');
        }

        if (m && m.subscribe) {
            ws.subscribe('broadcast-depth');
        }


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
}).listen(argv.uWebSocketBroadCastPort, (token) => {
    if (token) {
        console.log('Listening to port ' + argv.uWebSocketBroadCastPort);
    } else {
        console.log('Failed to listen to port ' + argv.uWebSocketBroadCastPort);
    }
});

const url = `${argv.uWebSocketBroadCastUri}:${argv.uWebSocketBroadCastPort}`

const connOrderBookDepth = new WebSocket(`${url}/depth/${argv.orderPair}`, {
    protocolVersion: 8,
    origin: `${url}/depth/${argv.orderPair}`,
    rejectUnauthorized: false
});

connOrderBookDepth.onopen = () => {
    connOrderBookDepth.send(JSON.stringify({ init: true }));
}