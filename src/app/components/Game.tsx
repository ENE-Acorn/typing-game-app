import { useState, useEffect, useRef } from 'react';
import type { GameState, Player } from '../page';
import ResultScreen from './Result';


//CSSファイルをインポート
import './Game.model.css';
// styleオブジェクトの型定義のためにReactをインポート
import React from 'react';

interface GameScreenProps {
  gameState: GameState;
  myId: string;
  onUpdateProgress: (typedText: string, consecutiveCount: number) => void;
  onWordCompleted: (word: string) => void;
  onGameClear: (correctlyType: number, missType: number) => void;
  onReset: () => void;
}

export default function GameScreen({ gameState, myId, onUpdateProgress, onWordCompleted, onGameClear, onReset }: GameScreenProps) {

  const [typedText, setTypedText] = useState('');  //自分が正しく打てた文字数を記録
  const [missType, setMissType] = useState(0);  //自分が何回ミスをしたか記録
  const [correctlyType, setCorrectlyType] = useState(0);
  const hasReportedRef = useRef(false);//報告フラグ(ゲーム終了時のやつ)
  const consecutiveCount = useRef(0)
  const [bottypingSpeedMs, setBotTypingSpeedMs] = useState(200);
  const [botMistakeChance, setBotMistakeChance] = useState(0.05);

  //gameStateを分解
  const myPlayer = gameState.players[myId];
  const opponent = Object.values(gameState.players).find(p => p.id !== myId);
  const currentWordJP = gameState.currentWordJP; // 日本語のお題 (例: "こんにちは")
  const currentWordRomaji = gameState.currentWordRomaji; // ローマ字のお題 (例: "konnichiha")

  const botTypingIntervalRef = useRef<NodeJS.Timeout | null>(null); // setIntervalのID
    const difficulty: 'easy' | 'normal' | 'hard' | 'extra' = (gameState as any).difficulty ?? 'normal';

  // 外側で宣言してから条件で上書きする（スコープ問題を回避）
  let BOT_TYPING_SPEED_MS = 185;
  let BOT_MISTAKE_CHANCE = 0.025;

  console.log(difficulty);
  if (difficulty === "easy") {
    BOT_TYPING_SPEED_MS = 1000; // 1秒に1文字
    BOT_MISTAKE_CHANCE = 0.05;
  } else if (difficulty === "normal") {
    BOT_TYPING_SPEED_MS = 500; // 0.5秒に1文字
    BOT_MISTAKE_CHANCE = 0.025;
  } else if (difficulty === "hard") {
    BOT_TYPING_SPEED_MS = 170; // 0.17秒に1文字
    BOT_MISTAKE_CHANCE = 0.01;
  } else if (difficulty === "extra") {
    BOT_TYPING_SPEED_MS = 80; // 0.08秒に1文字
    BOT_MISTAKE_CHANCE = 0.005;
  }
  //同じお題が出た時にも更新するための処理
  const totalScore = Object.values(gameState.players).reduce((sum, player) => sum + player.score, 0);

  useEffect(() => {
    // このコンポーネント（StartScreen）が表示されたら
    // bodyタグのmarginを強制的に0にする
    document.body.style.margin = '0';
    // 表示中はスクロールバーが出ないようにする
    document.body.style.overflow = 'hidden';

    // このコンポーネントが非表示になるとき
    return () => {
      // bodyタグのmarginを元に戻す（他の画面に影響しないように）
      document.body.style.margin = '';
      document.body.style.overflow = '';
    };
  }, []);

  const handleOnReset = () => {
    onReset();//Gameの上司であるpageにゲームリセット処理を依頼
  }

  // お題が変わるたびに、自分の入力をリセットする係
  useEffect(() => {
    setTypedText('');
    botTypedRef.current = ''; // 次の単語に備えてリセット
  }, [totalScore]);


  //0.05秒ごとに、司令塔に進捗を電話報告する係
  useEffect(() => {

    // ゲームがプレイ中じゃなければ報告しない
    if (gameState.status !== 'playing') return;

    onUpdateProgress(
      typedText, consecutiveCount.current
    );
    if (consecutiveCount.current >= 50) {
      consecutiveCount.current = 0;
    }


  }, [typedText, missType]);


  useEffect(() => {
    // ゲームが終了し、かつまだ報告していない場合
    if (gameState.status === 'finished' && !hasReportedRef.current) {
      onGameClear(correctlyType, missType);//ゲームのクリアを報告する

      hasReportedRef.current = true; // 報告済みフラグを立てる
    }
  }, [gameState.status, onGameClear, correctlyType, missType]);

  const botTypedRef = useRef(''); // ← 永続的にBotのtypedTextを保持

  useEffect(() => {
    if (myPlayer?.isBot !== true || gameState.status !== 'playing') {
      if (botTypingIntervalRef.current) {
        clearInterval(botTypingIntervalRef.current);
        botTypingIntervalRef.current = null;
      }
      return;
    }

    if (botTypingIntervalRef.current) {
      clearInterval(botTypingIntervalRef.current);
    }

    const targetWord = currentWordRomaji;

    //タイピングを開始
    botTypingIntervalRef.current = setInterval(() => {

      // ミスする確率処理
      if (Math.random() < BOT_MISTAKE_CHANCE) {
        console.log("BOT MISSED");
        consecutiveCount.current = 0;
        setMissType(prev => prev + 1);
        return;
      }

      console.log(BOT_MISTAKE_CHANCE + BOT_TYPING_SPEED_MS);
      const nextCharIndex = botTypedRef.current.length;

      if (nextCharIndex < targetWord.length) {

        // 1文字進む
        botTypedRef.current += targetWord[nextCharIndex];

        // 正答カウント
        setCorrectlyType(prev => prev + 1);

        consecutiveCount.current++;

        // 表示を更新
        setTypedText(botTypedRef.current);

      } else {
        console.log("WORD COMPLETE");
        onWordCompleted(targetWord);
        botTypedRef.current = ''; // 次の単語に備えてリセット
      }

    }, BOT_TYPING_SPEED_MS); // 難易度に応じた速度でタイピング

    // クリーンアップ
    return () => {
      if (botTypingIntervalRef.current) {
        clearInterval(botTypingIntervalRef.current);
        botTypingIntervalRef.current = null;
      }
    };

  }, [
    myPlayer?.isBot,
    gameState.status,
    currentWordRomaji,
    onWordCompleted,
    gameState.difficulty
  ]);


  //キーボードが押されるたびに、瞬時に反応する係
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {

      if (myPlayer?.isBot === false && gameState.status === 'playing') {

        // ゲーム中じゃなかったり、Shiftキーなどの特殊キーが押されたら何もしない
        if (gameState.status !== 'playing' || !currentWordRomaji || e.key.length > 1) {
          return;
        }

        // 次に打つべき文字が、お題のどの文字かを確認
        const nextCharIndex = typedText.length;
        if (e.key === currentWordRomaji[nextCharIndex]) {
          // 【正解！】
          const newTypedText = typedText + e.key;
          console.log("ssss")
          setTypedText(newTypedText); // 正しく打てた文字を記憶

          setCorrectlyType(prev => prev + 1);

          consecutiveCount.current++;

          if (newTypedText === currentWordRomaji) {
            //ワードを打ち切った場合
            onWordCompleted(currentWordRomaji);//サーバに通信
          }
        } else {
          // 【不正解...】
          consecutiveCount.current = 0;
          setMissType(prev => prev + 1); // ミスカウンターを1増やす
        }
      };
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);//リスナーを削除
  }, [typedText, currentWordRomaji, gameState.status, onWordCompleted, missType]);

  if (gameState.status === 'finished') {//ゲームが終わっていたらリザルト画面へ
    return <ResultScreen gameState={gameState} myId={myId} onReset={handleOnReset} />;
  }

  // お題の文字を色分けして表示するための小さな部品
  const renderWord = (render) => {
    return currentWordRomaji.split('').map((char, index) => {
      let color = '#6c757d'; // 未入力の文字はグレー
      if (index < render.length) {
        color = '#46b963ff'; // 正しく入力された文字は白
      }
      return <span key={index} style={{ color, fontSize: '2.5rem', margin: '0 2px' }}>{char}</span>;
    });
  };

  const myInterference = myPlayer?.interferenceType || "null";

  const myPlayerBoxClasses = `
    playerBox 
    myPlayerBox 
    ${myInterference === 'bounce' ? 'is-bouncing' : ''}
    ${myInterference === 'smallText' ? 'is-small-text' : ''}
    ${myInterference === 'colorInvert' ? 'is-color-inverted' : ''}
  `;

  const mainContainerClasses = `
    container 
    ${myInterference === 'colorInvert' ? 'is-color-inverted' : ''}
    ${myInterference === 'invert' ? 'is-inverted' : ''}
  `;

  const TARGET_SCORE_TO_WIN = 10;

  const myProgressPercent = Math.min((myPlayer?.score || 0) / TARGET_SCORE_TO_WIN, 1) * 50;
  const opponentProgressPercent = Math.min((opponent?.score || 0) / TARGET_SCORE_TO_WIN, 1) * 50;

  return (
    <main className={mainContainerClasses}>

      <button className="back-button" onClick={handleOnReset}>
        ゲームをキャンセル
      </button>

      <div className="goal-progress-bar-container">
        <div className="goal-text">GOAL</div>
        <div className="goal-progress-bar">
          <div
            id="my-progress"
            className="player-progress-bar"
            style={{ width: `${myProgressPercent}%` }}
          ></div>
          <div className="goal-marker"></div>
          <div
            id="opponent-progress"
            className="player-progress-bar"
            style={{ width: `${opponentProgressPercent}%` }}
          ></div>
        </div>
      </div>

      <div className="questionWord">
        {currentWordJP}
      </div>

      <div className="playersContainer">

        <div className={myPlayerBoxClasses}>

          <div className="playerName">{myPlayer?.name || 'YOU'}</div>
          <div className="playerScore">{myPlayer?.score || 0}</div>

          <div className="typingArea">
            {renderWord(typedText)}
          </div>

          <div className="statsContainer">
            <p className="statText">正解数: {correctlyType}</p>
            <p className="statText">ミス数: {missType}</p>
          </div>
        </div>

        {/* 相手のエリア */}
        <div
          className="playerBox opponentPlayerBox" // ★ クラスは元のまま
          style={{ position: 'relative' }}      // 妨害マークの基準点
        >

          {/* ★ 妨害マーク (div の "内側" に配置) */}
          {opponent.interferenceType !== "null" && (
            <span style={{
              position: 'absolute', // 親要素を基準に絶対配置
              top: '15px',          // 親要素の上から15px
              left: '15px',         // 親要素の左から15px
              fontSize: '1.8rem',     // お好みのサイズに調整
              color: '#dc3545',      // 妨害マークの色（赤）
              zIndex: 10
            }}
            >
              ⚠️妨害中⚠️
            </span>
          )}

          {/* ★ 以下の要素もすべて div の "内側" に配置 */}
          <div className="playerName">{opponent?.name || 'OPPONENT'}</div>
          <div className="playerScore">{opponent?.score || 0}</div>
          <div className="typingArea">
            {opponent ? renderWord(opponent.typedText) : <span style={{ color: '#a0a0a0' }}>...</span>}
          </div>
          {myInterference === 'smoke' && (
            <div className="smoke-overlay">
              <p>妨害発動中！</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
