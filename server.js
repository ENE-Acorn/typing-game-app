require('dotenv').config();
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
const { SerialPort } = require('serialport');
const fs = require('fs');
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

let picoSerial = null;

function sendToPico(message) {
    if (picoSerial && picoSerial.isOpen) {
        picoSerial.write(JSON.stringify(message) + '\n');
    }
}

// PICO_SERIAL_PORTが未指定の場合、Raspberry Pi PicoのUSBベンダーID(2e8a)からポートを自動検出する
async function findPicoPortPath() {
    if (PICO_SERIAL_PORT) return PICO_SERIAL_PORT;
    const ports = await SerialPort.list();
    const pico = ports.find((p) => (p.vendorId || '').toLowerCase() === '2e8a');
    return pico ? pico.path : null;
}

async function connectPicoSerial() {
    if (picoSerial && picoSerial.isOpen) return;

    const path = await findPicoPortPath();
    if (!path) {
        console.log('Raspberry Pi Picoのシリアルポートが見つかりません。接続を待機します...');
        return;
    }

    const port = new SerialPort({ path, baudRate: PICO_SERIAL_BAUD }, (err) => {
        if (err) {
            console.log(`Picoシリアルポート(${path})のオープンに失敗しました: ${err.message}`);
        }
    });

    port.on('open', () => {
        console.log(`Raspberry Pi Picoにシリアル接続しました (${path})`);
        picoSerial = port;
    });

    port.on('close', () => {
        console.log('Picoとのシリアル接続が切断されました。');
        picoSerial = null;
    });

    port.on('error', (err) => {
        console.log(`Picoシリアル通信エラー: ${err.message}`);
        picoSerial = null;
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

app.prepare().then(() => {
    const server = createServer((req, res) => {
        const parsedUrl = parse(req.url, true);
        handle(req, res, parsedUrl);
    });


    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
        const { pathname } = parse(req.url, true);
        if (pathname === '/ws') {
            wss.handleUpgrade(req, socket, head, (ws) => {
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
        if (Object.keys(gameState.players).length < 2) {
            gameState.players[playerId] = {
                id: playerId,
                name: '名無しさん',
                isReady: false,
                progress: 0,
                score: 0,
                typedText: "",
                interferenceType: "null",
                isBot: false,
                seat : null
            };
            console.log(`${playerId} が接続しました。`);
        }


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