"use client";
import { useState, useEffect } from 'react';

// これから作成する3つの画面コンポーネントを読み込む
import StartScreen from './components/Start';
import GameScreen from './components/Game';
import CountdownScreen from './components/Countdown';

// プレイヤー1人分のデータの型を定義
export interface Player {
  id: string;
  name: string;
  isReady: boolean;
  score: number;
  missType: number;
  correctlyType: number;
  typedText: string;
  interferenceType: string;
  isBot: boolean;
}

// GameStateの設計図
export interface GameState {
  status: 'waiting' | 'playing' | 'countdown' | 'finished';
  // playersは、キーが文字列で、中身がPlayer型のオブジェクトであることを指定
  players: {
    [key: string]: Player;
  };
  countdown: 3,
  startTime: 0,
  finishTime: 0,
  currentWordJP: '',
  currentWordRomaji: '',
  winnerPlayerName: ""
}

export default function Home() {
  // サーバーから受け取った最新のゲーム状態を記憶する

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [myId, setMyId] = useState<string>('');


  useEffect(() => {
    // サーバーに接続

    const ws = new WebSocket('ws://10.33.73.221:3000/ws');
    setSocket(ws);


    // サーバーからメッセージを送信された場合の処理
    ws.onmessage = (event) => {
      const receivedData = JSON.parse(event.data);

      //サーバに接続した場合、割り振られた自分のＩＤをもらう処理
      if (receivedData.type === 'assignId') {
        setMyId(receivedData.playerId);
      }

      //state(ゲーム全体の情報)が更新された場合の処理
      if (receivedData.type === 'updateState') {
        setGameState(receivedData.state);
      }
    };
    // 接続維持のためのハートビート（30秒ごとにpingを送信）
    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'ping',
        }));
      }

    }, 30000); // 30秒ごと
  }
    , []);


  //プレイヤーの名前が変わった場合の通信
  const handleNameChange = (name: string) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'updateName',
        name: name
      }))
    }
  }

  //プレイヤーが準備完了になった場合のデータ送信
  const handlePlayerReady = (name: string) => {
    console.log(`handlePlayerReadyが呼ばれました。名前: ${name}`);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'playerReady',
        name: name
      }));
    }
  }

  const handleReadyCansel = (name: string) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'readyCansel',
        name: name
      }))
    }
  }


  //ゲーム中に１００ミリ秒ごとに定期的に送られる進捗などのデータ送信
  const handleUpdateProgress = (typedText: string, consecutiveCount: number) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'updateProgress',
        typedText: typedText,
        consecutiveCount: consecutiveCount
      }))
    }
  }

  //プレイヤーがお題をクリアした場合のデータ送信
  const handleWordCompleted = (word: string) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'wordCompleted',
        word: word
      }))
    }
  }

  //ゲームが終了した場合に、プレイヤーの成績をサーバに送信
  const handleGameClear = (correctlyType: number, missType: number) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'gameClear',
        correctlyType: correctlyType,
        missType: missType
      }))
    }
  }

  const handleOnReset = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'gameReset'
      }))
    }
  }

  const handleCpuGameStart = (name) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'cpuGameStart',
        name: name
      }))
    }
  }

  // gameStateがまだ無い場合はローディング表示
  if (!gameState) {
    return <div>Connecting to server...</div>;
  }

  // gameState.statusの値に応じて、表示するコンポーネントを切り替える
  if (gameState.status === 'waiting') {
    return <StartScreen gameState={gameState} onReady={handlePlayerReady} onNameChange={handleNameChange} onCpuGameStart={handleCpuGameStart} onReadyCansel={handleReadyCansel} myId={myId} />;
  }

  if (gameState.status === 'countdown') {
    return <CountdownScreen gameState={gameState} />;
  }

  if (gameState.status === 'playing' || gameState.status === 'finished') {
    return <GameScreen gameState={gameState} myId={myId} onUpdateProgress={handleUpdateProgress} onWordCompleted={handleWordCompleted} onGameClear={handleGameClear} onReset={handleOnReset} />;
  }
}
