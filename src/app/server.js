const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// ★★★ STEP 1: ゲームの「台本」となるgameStateを用意 ★★★
let gameState = {
    status: 'waiting',// ゲームの状態: 'waiting', 'playing', 'finished'
    players: {}      // プレイヤー情報をここに格納していく
};

// ★★★ STEP 2: 接続しているクライアント全員を管理するリスト ★★★
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

    // ★★★ STEP 5: 全員に最新のgameStateを送るための関数 ★★★
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

    // ★★★ STEP 6: 全員が準備完了したかチェックする関数 ★★★
    function checkIfBothPlayersAreReady() {
        const players = Object.values(gameState.players);
        // 条件: プレイヤーが2人いて、かつ全員のisReadyがtrue
        if (players.length === 2 && players.every(p => p.isReady)) {
            console.log("全員準備完了！ゲームを開始します。");
            gameState.status = 'playing';
            // 本来はここでお題を設定する
            // gameState.currentWord = getNextWord(); 
            broadcastGameState(); // 状態が変わったので全員に通知！
        }
    }

    // ★★★ STEP 3: 新しいプレイヤーが接続してきた時の処理 ★★★
    wss.on('connection', (ws) => {
        // 新しいクライアントをリストに追加
        clients.add(ws);

        // プレイヤーIDを割り振り、wsオブジェクトに記録
        const playerId = `player${nextPlayerId}`;
        ws.playerId = playerId;
        nextPlayerId++;

        ws.send(JSON.stringify({
            type: 'assignId',
            playerId: playerId
        }));

        // gameStateにプレイヤーの初期データを作成
        if (Object.keys(gameState.players).length < 2) {
            gameState.players[playerId] = {
                id: playerId,
                name: '名無しのごんべえ',
                isReady: false,
                progress: 0,
                score: 0
            };
            console.log(`${playerId} が接続しました。`);
        }

        // 接続してきた人に、現在のゲーム状況を送信
        broadcastGameState();

        // ★★★ STEP 4: プレイヤーからメッセージが届いた時の処理 ★★★
        ws.on('message', (message) => {
            const receivedMessage = JSON.parse(message.toString());

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
                case "updateName":
                    if (gameState.players[ws.playerId]) {
                        gameState.players[ws.playerId].name = receivedMessage.name;
                        broadcastGameState();
                    }
                    break;

                // 今後、ここに'updateProgress'などのcaseを追加していく
            }
        });

        ws.on('close', () => {
            clients.delete(ws);
            // プレイヤーが切断されたらgameStateから削除する処理も本当は必要
            console.log(`${ws.playerId} が切断しました。`);
        });
    });

    server.listen(3000, () => {
        console.log('> Ready on http://localhost:3000');
    });
});