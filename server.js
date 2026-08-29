require('dotenv').config();
const { createServer } = require('http');
const next = require('next');
const { WebSocketServer } = require('ws');
const { SerialPort, ReadlineParser } = require('serialport');
const fs = require('fs');
const util = require('util');
const { a } = require('framer-motion/client');
const { diff } = require('util');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 3000;

// Raspberry Pi PicoとはUSBシリアル接続でやり取りする（WindowsのCOMポート名を.envで指定）
const PICO_SERIAL_PORT = process.env.PICO_SERIAL_PORT || '';
const PICO_SERIAL_BAUD = Number(process.env.PICO_SERIAL_BAUD) || 115200;
const PICO_RECONNECT_INTERVAL_MS = 5000;

// .envで DEBUG=true を指定すると、Picoとのシリアル通信の中身を全てコンソールに表示する（テスト用）
const DEBUG = String(process.env.DEBUG || '').toLowerCase() === 'true';

function debugLog(...args) {
    if (DEBUG) console.log(...args);
}

// ===== 中央コンソール(/console)用のログ管理 =====
// サーバのログとRaspberry Pi Picoからのログを直近分だけリングバッファに保持し、
// 接続中のコンソール画面へリアルタイムに配信する。
const MAX_LOG_ENTRIES = 300;
const serverLogs = [];
const picoLogs = [];
const consoleClients = new Set(); // コンソール画面(観戦専用)のWebSocket
let logSeq = 0;
let isBroadcastingLog = false;

// console.log等を差し替えるため、元の関数を退避しておく
// (差し替え後の関数から実際のターミナル出力に使う)
const rawConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
};

function broadcastToConsoles(message) {
    if (consoleClients.size === 0) return;
    const text = JSON.stringify(message);
    for (const client of consoleClients) {
        if (client.readyState === 1) {
            // 送信失敗をログに出すと再帰する可能性があるため、ここでは握りつぶす
            try { client.send(text); } catch (e) { /* 無視 */ }
        }
    }
}

function pushLog(source, level, text) {
    const buffer = source === 'pico' ? picoLogs : serverLogs;
    const entry = { id: ++logSeq, time: Date.now(), level, text };
    buffer.push(entry);
    if (buffer.length > MAX_LOG_ENTRIES) buffer.shift();

    // 配信処理の途中で更にログが出ても無限ループしないようにガードする
    if (isBroadcastingLog) return;
    isBroadcastingLog = true;
    try {
        broadcastToConsoles({ type: 'log', source, entry });
    } finally {
        isBroadcastingLog = false;
    }
}

// サーバ側のconsole出力を、ターミナルとコンソール画面の両方へ流す
for (const level of ['log', 'info', 'warn', 'error']) {
    console[level] = (...args) => {
        rawConsole[level](...args);
        pushLog('server', level, util.format(...args));
    };
}

// Picoからのログは DEBUG の設定に関わらず常に表示・配信する
function picoLog(text) {
    rawConsole.log(`[Picoログ] ${text}`);
    pushLog('pico', 'log', text);
}

// 接続状態などPicoに関するお知らせは、サーバログとPicoログの両方に残す
function picoNotice(text) {
    console.log(text);
    pushLog('pico', 'info', text);
}

let picoSerial = null;

function isPicoConnected() {
    return !!(picoSerial && picoSerial.isOpen);
}

function notifyPicoStatus() {
    broadcastToConsoles({ type: 'picoStatus', connected: isPicoConnected() });
}

function sendToPico(message) {
    if (picoSerial && picoSerial.isOpen) {
        const line = JSON.stringify(message);
        picoSerial.write(line + '\n');
        debugLog(`[Pico送信] ${line}`);
    } else {
        debugLog('[Pico送信] シリアル未接続のため送信できません:', JSON.stringify(message));
    }
}

// PICO_SERIAL_PORTが未指定の場合、Raspberry Pi PicoのUSBベンダーID(2e8a)からポートを自動検出する
async function findPicoPortPath() {
    if (PICO_SERIAL_PORT) return PICO_SERIAL_PORT;
    const ports = await SerialPort.list();
    debugLog(
        '[Pico検出] 認識中のシリアルポート:',
        ports.map((p) => `${p.path}(vendorId=${p.vendorId || '不明'})`).join(', ') || 'なし'
    );
    const pico = ports.find((p) => (p.vendorId || '').toLowerCase() === '2e8a');
    return pico ? pico.path : null;
}

async function connectPicoSerial() {
    if (picoSerial && picoSerial.isOpen) return;

    const path = await findPicoPortPath();
    if (!path) {
        picoNotice('Raspberry Pi Picoのシリアルポートが見つかりません。接続を待機します...');
        return;
    }

    const port = new SerialPort({ path, baudRate: PICO_SERIAL_BAUD }, (err) => {
        if (err) {
            console.log(`Picoシリアルポート(${path})のオープンに失敗しました: ${err.message}`);
        }
    });

    // Pico側の print() 出力(USBシリアルのログ)を1行ずつ受け取る。
    // 中央コンソールで常に確認できるよう、DEBUGの設定に関わらず全て出力する。
    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
    parser.on('data', (line) => {
        const text = line.replace(/\r$/, '').trim();
        if (text) picoLog(text);
    });

    port.on('open', () => {
        picoSerial = port;
        picoNotice(`Raspberry Pi Picoにシリアル接続しました (${path})`);
        notifyPicoStatus();
    });

    port.on('close', () => {
        picoSerial = null;
        picoNotice('Picoとのシリアル接続が切断されました。');
        notifyPicoStatus();
    });

    port.on('error', (err) => {
        picoSerial = null;
        picoNotice(`Picoシリアル通信エラー: ${err.message}`);
        notifyPicoStatus();
    });
}

connectPicoSerial();
setInterval(connectPicoSerial, PICO_RECONNECT_INTERVAL_MS);
const wordsData = fs.readFileSync('./src/app/words.json', 'utf8');
const words = JSON.parse(wordsData);//wods.jsonから読み取る

function getRandomWord() {
    return words[Math.floor(Math.random() * words.length)];
}//ランダムにワードを読み込んでくる

//gameStateを用意
let gameState = {
    status: 'waiting',// ゲームの状態: 'waiting', 'countdown', 'playing', 'finished'
    players: {},      // プレイヤー情報をここに格納していく
    countdown: 3,
    startTime: 0,
    finishTime: 0,
    currentWordJP: '',
    currentWordRomaji: '',
    winnerPlayerName: "",
    difficulty: "normal"
};
const interferenceList = [
    'smallText', // 文字を小さく
    'bounce',    // 文字を上下に
    'smoke',     // 霧がかかる（CSSクラス名は 'smoke' と仮定）
    'invert',    // 画面反転
    'colorInvert'// 色反転
];
//接続しているクライアント全員を管理するリスト
const clients = new Set();
let nextPlayerId = 1; // 次に接続してくるプレイヤーの番号

// リクエストURLを解析する。
// url.parse()はNode.jsで非推奨(DEP0169)のため、WHATWG URL APIで
// Next.jsのhandle()が期待する形（pathname/query/search）に組み立てる。
function parseRequestUrl(req) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // 同じキーが複数ある場合はquerystring.parse()と同様に配列にする
    const query = {};
    for (const [key, value] of url.searchParams) {
        if (query[key] === undefined) {
            query[key] = value;
        } else if (Array.isArray(query[key])) {
            query[key].push(value);
        } else {
            query[key] = [query[key], value];
        }
    }

    // url.parse(相対URL)と同じ形（protocol/hostはnull、hrefはパスのみ）で返す。
    // 絶対URLの情報を含めるとNext.jsが正規化用のリダイレクトを返してしまうため。
    const search = url.search || null;
    const hash = url.hash || null;

    return {
        protocol: null,
        slashes: null,
        auth: null,
        host: null,
        port: null,
        hostname: null,
        hash,
        search,
        query,
        pathname: url.pathname,
        path: url.pathname + (search || ''),
        href: url.pathname + (search || '') + (hash || ''),
    };
}

app.prepare().then(() => {
    const server = createServer((req, res) => {
        const parsedUrl = parseRequestUrl(req);
        handle(req, res, parsedUrl);
    });


    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
        const { pathname, query } = parseRequestUrl(req);
        if (pathname === '/ws') {
            wss.handleUpgrade(req, socket, head, (ws) => {
                // /ws?role=console で接続してきたものは中央コンソール(観戦専用)として扱い、
                // プレイヤー枠を消費しないようにする
                ws.isConsole = query.role === 'console';
                wss.emit('connection', ws, req);
            });
        } else {
            socket.destroy();
        }
    });

    //全員に最新のgameStateを送るための関数
    function broadcastGameState() {
        const message = {
            type: 'updateState',
            state: gameState
        };
        const messageString = JSON.stringify(message);
        for (const client of clients) {
            if (client.readyState === 1) {
                client.send(messageString);
            }
        }
        // 中央コンソールにも同じ状態を配信する
        for (const client of consoleClients) {
            if (client.readyState === 1) {
                client.send(messageString);
            }
        }
    }

    //
    function checkIfBothPlayersAreReady() {//全員OKかチェックして、Okならゲームスタート
        const players = Object.values(gameState.players);
        // 条件: プレイヤーが2人いて、かつ全員のisReadyがtrue
        if (players.length === 2 && players.every(p => p.isReady)) {
            console.log("全員準備完了！ゲームを開始します。");
            gameState.status = 'countdown';//まずはカウントダウン
            gameState.countdown = 3;
            broadcastGameState(); // 状態が変わったので全員に通知！
            gameStart();
        }
    }

    function gameStart() {
        let countdownInterval = setInterval(() => {
            gameState.countdown -= 1; // 1秒ごとにカウントを減らす
            broadcastGameState(); // 減らしたことを全員に通知

            if (gameState.countdown <= 0) {
                clearInterval(countdownInterval); // タイマー停止
                gameState.status = 'playing';     // ゲーム状態を 'playing' に変更
                console.log("ゲーム開始！");
                gameState.startTime = Date.now();//ゲームスタート時の時刻

                word = getRandomWord();

                gameState.currentWordJP = word.jp
                gameState.currentWordRomaji = word.romaji//最初のお題を読み取る

                broadcastGameState(); // ゲームが始まったことを全員に通知
            }
        }, 1000);
    }

    //新しいプレイヤーが接続してきた時の処理
    wss.on('connection', (ws) => {
        // 中央コンソール(観戦専用)はプレイヤーとして登録せず、
        // 現在の状態と貯めておいたログを渡してから配信対象に加える
        if (ws.isConsole) {
            consoleClients.add(ws);
            ws.send(JSON.stringify({
                type: 'consoleInit',
                state: gameState,
                serverLogs: serverLogs,
                picoLogs: picoLogs,
                picoConnected: isPicoConnected()
            }));
            console.log('中央コンソールが接続しました。');

            ws.on('message', (message) => {
                try {
                    const received = JSON.parse(message.toString('utf8'));
                    // 接続維持用のping以外は受け付けない（コンソールからゲームは操作できない）
                    if (received.type === 'ping') {
                        ws.send(JSON.stringify({ type: 'ping' }));
                    }
                } catch (e) {
                    console.log(`コンソールからの不正なメッセージを無視しました: ${e.message}`);
                }
            });

            ws.on('close', () => {
                consoleClients.delete(ws);
                console.log('中央コンソールが切断しました。');
            });
            return;
        }

        // このゲームは2人プレイ専用のため、既に2人埋まっている場合は
        // 満員である旨を伝えて接続を切る(中途半端な「何も反映されない」状態を防ぐ)
        if (Object.keys(gameState.players).length >= 2) {
            ws.send(JSON.stringify({ type: 'full' }));
            console.log('満員のため接続を拒否しました。');
            ws.close();
            return;
        }

        // 新しいクライアントをリストに追加
        clients.add(ws);

        // プレイヤーIDを割り振り、wsオブジェクトに記録
        const playerId = `player${nextPlayerId}`;
        ws.playerId = playerId;
        nextPlayerId++;

        ws.send(JSON.stringify({
            type: 'assignId',//接続してきた人にIDを渡す
            playerId: playerId
        }));

        // gameStateにプレイヤーの初期データを作成
        gameState.players[playerId] = {
            id: playerId,
            name: '名無しさん',
            isReady: false,
            progress: 0,
            score: 0,
            typedText: "",
            interferenceType: "null",
            isBot: false,
            seat : null,
            consecutiveCount: 0 // 連続で正解できている文字数（中央コンソールでの表示用）
        };
        console.log(`${playerId} が接続しました。`);


        // 接続してきた人に、現在のゲーム状況を送信
        broadcastGameState();

        //プレイヤーからメッセージが届いた時の処理
        ws.on('message', (message) => {
            const receivedMessage = JSON.parse(message.toString('utf8'));

            const player = gameState.players[ws.playerId];
            if (!player) return;

            const opponent = Object.values(gameState.players).find(p => p.id !== player.id);

            // メッセージの種類に応じて処理を振り分け
            switch (receivedMessage.type) {

                case "ping":
                    // クライアントからのpingに応答する
                    ws.send(JSON.stringify({ type: 'ping' }));
                    console.log("pcからpingを受信")
                    for (const client of clients) {
                        if (client.readyState === 1) {
                            client.send(JSON.stringify({
                                type: "Pong",
                            }));
                        }
                    }
                    break;

                case "picoping":
                    console.log("Picoからpingを受信");
                    break;

                case "playerReady":
                    // 送信元のプレイヤーのisReadyをtrueにする
                    if (gameState.players[ws.playerId]) {
                        gameState.players[ws.playerId].isReady = true;
                        gameState.players[ws.playerId].name = receivedMessage.name;
                        console.log(`${ws.playerId} の準備が完了しました。`);

                        broadcastGameState();

                        // 状態が変わったので、全員の準備がOKかチェック
                        checkIfBothPlayersAreReady();
                    }
                    break;

                case "readyCansel":
                    //送信元のプレイヤーのisReadyをfalseにする
                    broadcastGameState();
                    if (gameState.players[ws.playerId]) {
                        gameState.players[ws.playerId].isReady = false;
                        gameState.players[ws.playerId].name = receivedMessage.name;
                        console.log(`${ws.playerId} の準備完了が取り消されました。`);

                        broadcastGameState();
                    }

                    break;
                case "updateName"://プレイヤーの名前が変わった時
                    if (gameState.players[ws.playerId]) {
                        gameState.players[ws.playerId].name = receivedMessage.name;
                        broadcastGameState();
                    }
                    break;

                case "rightPlayer"://pcを正面に見て右側にいるプレイヤーがこのメッセージを送ってきた時
                    if (gameState.players[ws.playerId]) {
                        gameState.players[ws.playerId].seat = "right";
                        broadcastGameState();
                    }
                    break;

                case "leftPlayer"://pcを正面に見て左側にいるプレイヤーがこのメッセージを送ってきた時
                    if (gameState.players[ws.playerId]) {
                        gameState.players[ws.playerId].seat = "left";
                        broadcastGameState();
                    }
                    break;
                case "updateProgress"://ゲーム中のどこまで打ったか定期で更新

                    player.typedText = receivedMessage.typedText;
                    // 中央コンソールで2人の連続正解数を表示できるように保持しておく
                    player.consecutiveCount = receivedMessage.consecutiveCount || 0;

                    sendToPico({
                        type: "progressUpdate",//定期でプレイヤーのライトをどこまで点灯させるか送信
                        seat: player.seat,
                        consecutiveCount: receivedMessage.consecutiveCount
                    });

                    if (opponent && receivedMessage.consecutiveCount == 50 && opponent.interferenceType == "null") {

                        opponent.interferenceType = interferenceList[Math.floor(Math.random() * interferenceList.length)];

                        console.log(opponent.interferenceType + "が発生中");
                        setTimeout(() => {
                            opponent.interferenceType = "null";
                            console.log("妨害終了");
                            broadcastGameState();
                        }, 5000)
                    }


                    broadcastGameState();
                    break;

                case "wordCompleted"://ワードが全て打ち切られた時
                    if (gameState.status === 'finished' || receivedMessage.word !== gameState.currentWordRomaji) {
                        break;
                    }//先に接続してきたプレイヤーをそのセットの勝者とする
                    const winner = player;

                    console.log(`${winner.name}が１ワード先取！`);

                    for (const pId in gameState.players) {
                        const p = gameState.players[pId];
                        p.typedText = "";//サーバに上がってるtypedTextを初期化
                    }

                    winner.score += 1;//スコアを加算
                    if (winner.score >= 10) {//スコアを10個獲得した時(ゲーム終了)
                        gameState.finishTime = Date.now();//ゲーム終了時刻
                        gameState.winnerPlayerName = winner.name;//勝者の名前
                        gameState.status = 'finished';//リザルト画面へ移行
                        console.log(`${winner.name} が勝利しました！`);
                    } else {
                        const newWord = getRandomWord();
                        gameState.currentWordJP = newWord.jp;//新しいワードを送信
                        gameState.currentWordRomaji = newWord.romaji;
                    }
                    broadcastGameState();
                    break;

                case "gameClear"://ゲーム終了時にプレイヤーの成績をサーバに送信してきた時の処理
                    console.log("ゲームクリアが実行されました")
                    player.correctlyType = receivedMessage.correctlyType;
                    player.missType = receivedMessage.missType;

                    sendToPico({
                        type: "gameClear",//ゲームが終わった時にライトを消灯させる処理
                    });

                    broadcastGameState();
                    break;

                case "gameReset":
                    console.log("ゲームリセットが実行されました")
                    for (const playerId in gameState.players) {//ゲームに関係する値を初期化
                        const player = gameState.players[playerId];

                        player.correctlyType = 0;
                        player.missType = 0;
                        player.score = 0;
                        player.name = "";
                        player.isReady = false;
                        player.typedText = "";
                        player.isBot = false;
                        player.consecutiveCount = 0;
                    }
                    gameState.startTime = 0,
                        gameState.finishTime = 0,
                        gameState.winnerPlayerName = "";
                    gameState.countdown = 3;

                    sendToPico({
                        type: "gameClear",//ゲームが終わった時にライトを消灯させる処理
                    });

                    gameState.status = "waiting";

                    broadcastGameState();
                    break;

                case "cpuGameStart":

                    gameState.difficulty = receivedMessage.difficulty;
                    player.name = receivedMessage.name;
                    player.isReady = true;
                    player.isBot = false;

                    console.log(`がCPU戦を開始しましたyo`);
                    if (opponent) {

                        opponent.name = "CPU";
                        opponent.isReady = true;
                        opponent.isBot = true;
                        if(player.seat == "right"){
                            opponent.seat = "left";
                        } else if(player.seat == "left"){
                            opponent.seat = "right";
                        }
                    } else {
                        console.log("相手がいません");
                        player.isReady = false;
                        broadcastGameState();
                        return;
                    }
                    console.log("BOT戦スタート")

                    gameState.status = 'countdown';//まずはカウントダウン
                    gameState.countdown = 3;
                    gameStart();

                    broadcastGameState();
                    break;
            }
        });

        ws.on('close', () => {
            clients.delete(ws);
            console.log(`${ws.playerId} が切断しました。`);

            if (gameState.players[ws.playerId]) {
                delete gameState.players[ws.playerId];

                // ゲーム中に片方が切断した場合は、残ったプレイヤーが操作不能にならないよう待機状態に戻す
                if (gameState.status !== 'waiting') {
                    gameState.status = 'waiting';
                    gameState.countdown = 3;
                    gameState.startTime = 0;
                    gameState.finishTime = 0;
                    gameState.winnerPlayerName = '';
                    gameState.currentWordJP = '';
                    gameState.currentWordRomaji = '';

                    for (const pId in gameState.players) {
                        const p = gameState.players[pId];
                        p.isReady = false;
                        p.score = 0;
                        p.typedText = '';
                        p.interferenceType = 'null';
                        p.consecutiveCount = 0;
                    }

                    sendToPico({ type: 'gameClear' });
                }

                broadcastGameState();
            }
        });
    });

    server.listen(PORT, HOST, () => {
        console.log(`> Ready on http://${HOST}:${PORT}`);
    });
});