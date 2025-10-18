"use client";
import { useState, useEffect } from 'react';

import type { GameState, Player } from '../page'

// ① propsの型を定義
interface StartScreenProps {
    gameState: GameState;
    myId: string
    onReady: (name: string) => void;
    onNameChange: (name: string) => void;
}

// ② 定義した型をコンポーネントの引数に適用する
export default function StartScreen({ gameState, myId,onReady, onNameChange,}: StartScreenProps) {
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
                    onReady(myName)
                } else {
                    alert("名前を入力してください")
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            console.log('イベントリスナーを解除しました。');
        };
        // ③ useEffectの依存配列に socket を追加
    }, [myName, onReady],);

    return (
        <main style={{ padding: '20px' }}>
            <h1>すたあとがめん</h1>
            <h2>自分の名前</h2>
            <input type="text" value={myName} onChange={(e) => { setMyName(e.target.value); onNameChange(e.target.value); }} disabled={myPlayerInfo?.isReady} ></input>
            <p>{myPlayerInfo?.isReady ? '準備完了！' : 'スペースキーを押して準備を完了する'}</p>
            <hr />
            <p>相手の名前</p>
            <p>{opponentInfo?.name || '???'}</p>
            <p>{opponentInfo?.isReady ? '準備完了!' : '待機中...'}</p>
        </main>
    );
}