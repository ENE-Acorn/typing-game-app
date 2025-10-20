const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
const fs = require('fs');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
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
    winnerPlayerName: ""
};

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
            client.send(messageString);
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
                name: 'unknownさん',
                isReady: false,
                progress: 0,
                score: 0,
                typedText: ""
            };
            console.log(`${playerId} が接続しました。`);
        }

        // 接続してきた人に、現在のゲーム状況を送信
        broadcastGameState();

        //プレイヤーからメッセージが届いた時の処理
        ws.on('message', (message) => {
            const receivedMessage = JSON.parse(message.toString());

            const player = gameState.players[ws.playerId];
            if (!player) return;

            // メッセージの種類に応じて処理を振り分け
            switch (receivedMessage.type) {
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
                case "updateName"://プレイヤーの名前が変わった時
                    if (gameState.players[ws.playerId]) {
                        gameState.players[ws.playerId].name = receivedMessage.name;
                        broadcastGameState();
                    }
                    break;
                case "updateProgress"://ゲーム中のどこまで打ったか定期で更新

                    player.typedText = receivedMessage.typedText;

                    broadcastGameState();
                    break;

                case "wordCompleted"://ワードが全て打ち切られた時
                    if (gameState.status === 'finished' || receivedMessage.word !== gameState.currentWordRomaji) {
                        break;
                    }//先に接続してきたプレイヤーをそのセットの勝者とする
                    const winner = player;

                    console.log(`${winner.name}がラウンド勝利！`);

                    for (const pId in gameState.players) {
                        const p = gameState.players[pId];
                        p.typedText = "";//サーバに上がってるtypedTextを初期化
                    }

                    winner.score += 1;//スコアを加算
                    if (winner.score >= 100) {//スコアを10個獲得した時(ゲーム終了)
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
                    player.correctlyType = receivedMessage.correctlyType;
                    player.missType = receivedMessage.missType;
                    broadcastGameState();
                    break;
                case "gameReset":
                    for (const playerId in gameState.players) {//ゲームに関係する値を初期化
                        const player = gameState.players[playerId];

                        player.correctlyType = 0;
                        player.missType = 0;
                        player.score = 0;
                        player.name = "";
                        player.isReady = false;
                        player.typedText = "";
                    }
                    gameState.startTime = 0,
                    gameState.finishTime = 0,
                    gameState.winnerPlayerName = "";
                    gameState.countdown = 3;

                    gameState.status = "waiting";

                    broadcastGameState();
                    break;

            }
        });

        ws.on('close', () => {
            clients.delete(ws);
            // プレイヤーが切断されたらgameStateから削除する処理も本当は必要
            console.log(`${ws.playerId} が切断しました。`);
        });
    });

    server.listen(3000, '0.0.0.0', () => {
        console.log('> Ready on http://localhost:3000');
    });
});