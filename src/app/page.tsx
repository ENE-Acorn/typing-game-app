"use client";
import { useState, useEffect } from 'react';

// これから作成する3つの画面コンポーネントを読み込む
import StartScreen from './components/Start';
import GameScreen from './components/Game';
import ResultScreen from './components/Result';

// プレイヤー1人分のデータの型を定義
export interface Player {
  id: string;
  name: string;
  isReady: boolean;
  progress: number;
  score: number;
}

// GameStateの設計図を修正
export interface GameState {
  status: 'waiting' | 'playing' | 'countdown' | 'finished';
  // playersは、キーが文字列で、中身がPlayer型のオブジェクトであることを指定
  players: {
    [key: string]: Player;
  };
  countdown: number;
}

export default function Home() {
  // サーバーから受け取った最新のゲーム状態を記憶する

const [gameState, setGameState] = useState<GameState | null>(null);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [myId, setMyId] = useState<string>(''); 

  
  useEffect(() => {
    // サーバーに接続
    const ws = new WebSocket('ws://localhost:3000/ws');
    setSocket(ws);

    
    // サーバーからメッセージが来たら、gameStateを更新する
    ws.onmessage = (event) => {
      const receivedData = JSON.parse(event.data);

            console.log("サーバーからメッセージ受信:", receivedData);

            
      if (receivedData.type === 'assignId') {
        setMyId(receivedData.playerId);
      } 

      if (receivedData.type === 'updateState') {
        setGameState(receivedData.state);
      }
    };
    // ...
  }, []);

  const handleNameChange = (name: string) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'updateName',
        name: name
      }))
    }
  }
  const handlePlayerReady = (name: string) => {
        console.log(`handlePlayerReadyが呼ばれました。名前: ${name}`);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'playerReady',
        name: name
      }));
        console.log("サーバーにplayerReadyメッセージを送信しました。");
    } else {
    // ★★★ このelseブロックを追加 ★★★
    console.error("メッセージを送信できませんでした。socketの状態:", socket?.readyState);
  }
}

  // gameStateがまだ無い場合はローディング表示
  if (!gameState) {
    return <div>Connecting to server...</div>;
  }

  // gameState.statusの値に応じて、表示するコンポーネントを切り替える
  if (gameState.status === 'waiting') {
    return <StartScreen gameState={gameState} onReady={handlePlayerReady} myId={myId} onNameChange={handleNameChange}/>;
  }

  if (gameState.status === 'playing') {
    return <GameScreen socket={socket} gameState={gameState} />;
  }

  if (gameState.status === 'finished') {
    return <ResultScreen socket={socket} gameState={gameState} />;
  }
}
