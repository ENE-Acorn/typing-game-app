"use client";
import { useState, useEffect } from 'react';
import type { GameState, Player } from '../page'


interface StartScreenProps {
    gameState: GameState;
    myId: string
    onReady: (name: string) => void;
    onNameChange: (name: string) => void;
    onCpuGameStart: (name: string) => void;
    onReadyCansel: (name: string) => void;
    onRightPlayer: () => void;
    onLeftPlayer: () => void;
}

export default function StartScreen({ gameState, myId, onReady, onNameChange, onCpuGameStart, onReadyCansel, onRightPlayer, onLeftPlayer }: StartScreenProps) {
    const [myName, setMyName] = useState<string>('');
    const [seat, setSeat] = useState<'left' | 'right' | null>(null);
    const [readyLocal, setReadyLocal] = useState<boolean>(false); // ローカルで準備状態を保持

    let myPlayerInfo: Player | undefined;//ここで、もしプレイヤーがいなくても初期値が入るようにする
    let opponentInfo: Player | undefined;//同上

    if (gameState?.players) {
        // gameState.playersの中から、myIdと一致するidを持つプレイヤーが「自分」
        myPlayerInfo = gameState.players[myId];

        // gameState.playersの中から、myIdと"一致しない"idを持つプレイヤーを探して「相手」とする
        opponentInfo = Object.values(gameState.players).find(p => p.id !== myId);
    }
    useEffect(() => {
        // このコンポーネント（StartScreen）が表示されたら
        // bodyタグのmarginを強制的に0にする
        document.body.style.margin = '0';

        // このコンポーネントが非表示になるとき
        return () => {
            // bodyタグのmarginを元に戻す（他の画面に影響しないように）
            document.body.style.margin = '';
        };
    }, []);
    useEffect(() => {

        // eventの型を KeyboardEvent と明記する
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code === 'Space') {
                    event.preventDefault();
                    if (!seat) {
                        alert('座っている方向を選択してください');
                        return;
                    }
                    // 相手と同じ席を選んでいないかチェック
                    if (opponentInfo?.seat === seat) {
                        alert('相手と同じ席が選択されています。別の席を選んでください。');
                        return;
                    }
                    if (myName != "") {
                        setReadyLocal(true); // 先にローカルで無効化
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
    }, [myName, onReady, seat]);//依存関係

    const handleCpuGameStart = () => {
        if (myName === "") {
            alert("名前を入力してください")//名前の入力を必須に
            return;
        }
        if (myName.trim()) {
            setReadyLocal(true);
            onCpuGameStart(myName.trim())
        }
    }
    const handleReadyCansel = () => {
        setReadyLocal(false);
        onReadyCansel(myName)
    }

    const handleRightPlayer = () => {
        if (readyLocal || myPlayerInfo?.isReady) return; // 準備済みなら無効
        setSeat('right');
        onRightPlayer();
    }

    const handleLeftPlayer = () => {
        if (readyLocal || myPlayerInfo?.isReady) return; // 準備済みなら無効
        setSeat('left');
        onLeftPlayer();
    }

    // サーバ側の isReady とローカル状態を同期
    useEffect(() => {
        setReadyLocal(!!myPlayerInfo?.isReady);
    }, [myPlayerInfo?.isReady]);

    return (
        <main style={{ position: 'relative', padding: '20px', width: '100%', backgroundColor: '#d8e8ed', minHeight: '100vh', boxSizing: 'border-box' }}>
            <h1>すたあとがめん</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                <p style={{ margin: 0 }}>スペースキーを押して準備を完了する</p>
            </div>

            {/* 上部中央に座席選択ラベル（上）とボタン群（下） */}
            <div style={{ position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 70, background: 'transparent', padding: '6px 10px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <p style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: '#0f172a' }}>座っている方向を選択</p>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <button
                            onClick={handleLeftPlayer}
                            disabled={readyLocal || !!myPlayerInfo?.isReady}
                            style={{
                                backgroundColor: seat === 'left' ? '#14532d' : '#f59e0b',
                                color: '#ffffff',
                                padding: '12px 18px',
                                fontSize: '1.05rem',
                                borderRadius: '8px',
                                border: 'none',
                                boxShadow: seat === 'left' ? '0 6px 14px rgba(20,83,45,0.25)' : 'none'
                            }}
                        >
                            左
                        </button>
                        <button
                            onClick={handleRightPlayer}
                            disabled={readyLocal || !!myPlayerInfo?.isReady}
                            style={{
                                backgroundColor: seat === 'right' ? '#14532d' : '#16a34a',
                                color: '#ffffff',
                                padding: '12px 18px',
                                fontSize: '1.05rem',
                                borderRadius: '8px',
                                border: 'none',
                                boxShadow: seat === 'right' ? '0 6px 14px rgba(20,83,45,0.25)' : 'none'
                            }}
                        >
                            右
                        </button>
                    </div>
                </div>
            </div>

            {/* Flexコンテナで左右に分割 */}
            <div style={{
                display: 'flex',
                justifyContent: 'center', // ← 'space-between' から変更
                gap: '80px', // ← カード間の隙間を 40px に固定（お好みで調整）
                width: '100%',
                margin: '20px auto 0 auto'
            }}>

                {/* 左側：自分の情報 */}
                <div style={{
                    width: '500px',
                    border: '2px solid #3b82f6',
                    padding: '25px',
                    borderRadius: '8px',
                    backgroundColor: 'white',
                    boxSizing: 'border-box'
                }}>
                    <h2 style={{ fontSize: '2.5rem', marginTop: '0', marginBottom: '15px' }}>自分の名前</h2>
                    <div style={{ minHeight: '50px', marginBottom: '10px' }}>
                        <input
                            type="text"
                            value={myName}
                            onChange={(e) => { setMyName(e.target.value); onNameChange(e.target.value); }}
                            maxLength={17}
                            disabled={myPlayerInfo?.isReady}
                            style={{ width: '94%', padding: '12px', fontSize: '1.5rem' }} // inputのスタイル調整
                        />
                    </div>

                    {myPlayerInfo?.isReady ? (
                        <p style={{ backgroundColor: '#4caf50', color: 'white', padding: '12px', borderRadius: '5px', fontSize: '1.1rem' }}>
                            準備完了！
                        </p>
                    ) : (
                        <p style={{ backgroundColor: '#f44336', color: 'white', padding: '12px', borderRadius: '5px', fontSize: '1.1rem' }}>
                            待機中...
                        </p>
                    )}
                </div>

                {/* 右側：相手の情報 */}
                <div style={{
                    width: '500px',
                    border: '2px solid #f87171',
                    padding: '25px',
                    borderRadius: '8px',
                    backgroundColor: 'white',
                    boxSizing: 'border-box'
                }}>
                    <h2 style={{ fontSize: '2.5rem', marginTop: '0', marginBottom: '15px' }}>相手の名前</h2>
                    <div style={{ minHeight: '50px', marginBottom: '10px' }}>
                        <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                            {opponentInfo?.name || '???'}
                        </p>
                    </div>
                    {opponentInfo?.isReady ? (
                        <p style={{ backgroundColor: '#4caf50', color: 'white', padding: '12px', borderRadius: '5px', fontSize: '1.1rem' }}>
                            準備完了！
                        </p>
                    ) : (
                        <p style={{ backgroundColor: '#f44336', color: 'white', padding: '12px', borderRadius: '5px', fontSize: '1.1rem' }}>
                            待機中...
                        </p>
                    )}
                </div>
            </div>
            <button
                onClick={handleCpuGameStart}
                style={{ backgroundColor: '#34495E', color: '#ffffff' }} // 色を変える
            >
                CPUと対戦
            </button>
            <br /><br />
            <button
                onClick={handleReadyCansel}
                style={{ backgroundColor: '#34495E', color: '#ffffff' }} // 色を変える
            >
                準備完了を取り消す
            </button>
        </main>
    );
}