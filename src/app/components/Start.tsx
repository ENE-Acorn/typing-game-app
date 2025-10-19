"use client";
import { useState, useEffect } from 'react';
import type { GameState, Player } from '../page'

interface StartScreenProps {
    gameState: GameState;
    myId: string
    onReady: (name: string) => void;
    onNameChange: (name: string) => void;
}

export default function StartScreen({ gameState, myId, onReady, onNameChange, }: StartScreenProps) {
    const [myName, setMyName] = useState<string>('');

    let myPlayerInfo: Player | undefined;//ここで、もしプレイヤーがいなくても初期値が入るようにする
    let opponentInfo: Player | undefined;//同上

    if (gameState?.players) {
        // gameState.playersの中から、myIdと一致するidを持つプレイヤーが「自分」
        myPlayerInfo = gameState.players[myId];

        // gameState.playersの中から、myIdと"一致しない"idを持つプレイヤーを探して「相手」とする
        opponentInfo = Object.values(gameState.players).find(p => p.id !== myId);
    }
    useEffect(() => {

        // eventの型を KeyboardEvent と明記する
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code === 'Space') {
                event.preventDefault();
                if (myName != "") {
                    onReady(myName)//準備完了にして自分の名前を登録
                } else {
                    alert("名前を入力してください")//名前の入力を必須に
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            console.log('イベントリスナーを解除しました。');
        };
    }, [myName, onReady]);//依存関係

    return (
        <main style={{ padding: '20px' }}>
            <h1>すたあとがめん</h1>
            <h2>自分の名前</h2>
            <input type="text" value={myName} onChange={(e) => { setMyName(e.target.value); onNameChange(e.target.value); }} disabled={myPlayerInfo?.isReady} ></input>

            <p>スペースキーを押して準備を完了する</p>

            {myPlayerInfo?.isReady ? (
                <p style={{ backgroundColor: '#4caf50' }}>
                    準備完了！
                </p>
            ) : (
                <p style={{ backgroundColor: '#f44336' }}>
                    待機中...</p>
            )
            }

            <hr />
            <p>相手の名前</p>
            <p>{opponentInfo?.name || '???'}</p>
            {opponentInfo?.isReady ? (
                <p style={{ backgroundColor: '#4caf50' }}>
                    準備完了！
                </p>
            ) : (
                <p style={{ backgroundColor: '#f44336' }}>
                    待機中...
                </p>
            )
            }
        </main>
    );
}