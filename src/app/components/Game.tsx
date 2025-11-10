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
  onUpdateProgress: (typedText: string, lightLevel: number) => void;
  onWordCompleted: (word: string) => void;
  onGameClear: (correctlyType: number, missType: number) => void;
  onReset: () => void;
}

export default function GameScreen({ gameState, myId, onUpdateProgress, onWordCompleted, onGameClear, onReset }: GameScreenProps) {

  const [typedText, setTypedText] = useState('');  //自分が正しく打てた文字数を記録
  const [missType, setMissType] = useState(0);  //自分が何回ミスをしたか記録
  const [correctlyType, setCorrectlyType] = useState(0);
  const [lightLevel, setLightLevel] = useState(0);
  const hasReportedRef = useRef(false);//報告フラグ(ゲーム終了時のやつ)
  const consecutiveCount = useRef(0)

  //gameStateを分解
  const myPlayer = gameState.players[myId];
  const opponent = Object.values(gameState.players).find(p => p.id !== myId);
  const currentWordJP = gameState.currentWordJP; // 日本語のお題 (例: "こんにちは")
  const currentWordRomaji = gameState.currentWordRomaji; // ローマ字のお題 (例: "konnichiha")

  //同じお題が出た時にも更新するための処理
  const totalScore = Object.values(gameState.players).reduce((sum, player) => sum + player.score, 0);


  const handleOnReset = () => {
    onReset();//Gameの上司であるpageにゲームリセット処理を依頼
  }

  // お題が変わるたびに、自分の入力をリセットする係
  useEffect(() => {
    setTypedText('');
  }, [totalScore]); // currentWordRomajiが変化した時だけ、この仕事を実行


  //0.05秒ごとに、司令塔に進捗を電話報告する係
  useEffect(() => {
    const interval = setInterval(() => {
      // ゲームがプレイ中じゃなければ報告しない
      if (gameState.status !== 'playing') return;

      onUpdateProgress(
        typedText, lightLevel
      );
      
      if(lightLevel == 5){
        setLightLevel(0);
      }

    }, 50); // 0.05秒ごとに実行

    return () => clearInterval(interval); // この部品が不要になったら、電話をかけ続けるのをやめる
  }, [typedText, missType, currentWordRomaji, lightLevel, gameState.status, onUpdateProgress]);


  useEffect(() => {
    // ゲームが終了し、かつまだ報告していない場合
    if (gameState.status === 'finished' && !hasReportedRef.current) {
      onGameClear(correctlyType, missType);//ゲームのクリアを報告する

      hasReportedRef.current = true; // 報告済みフラグを立てる
    }
  }, [gameState.status, onGameClear, correctlyType, missType]);

  //キーボードが押されるたびに、瞬時に反応する係
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ゲーム中じゃなかったり、Shiftキーなどの特殊キーが押されたら何もしない
      if (gameState.status !== 'playing' || !currentWordRomaji || e.key.length > 1) {
        return;
      }

      // 次に打つべき文字が、お題のどの文字かを確認
      const nextCharIndex = typedText.length;
      if (e.key === currentWordRomaji[nextCharIndex]) {
        // 【正解！】
        const newTypedText = typedText + e.key;
        setTypedText(newTypedText); // 正しく打てた文字を記憶

        setCorrectlyType(prev => prev + 1);

        consecutiveCount.current++;

        setLightLevel(consecutiveCount.current / 10);
        if (consecutiveCount.current >= 50) {
          consecutiveCount.current = 0;
        }

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
      return <span key={index} style={{ color, fontSize: '3rem', margin: '0 2px' }}>{char}</span>;
    });
  };
  
  return (
    <main className="container"> 
      
      <div className="questionWord">
        {currentWordJP}
      </div>

      <div className="playersContainer">

        {/* 自分のエリア (妨害クラス指定を削除) */}
        <div className="playerBox myPlayerBox">
          
          <div className="playerName">{myPlayer?.name || 'YOU'}</div>
          <div className="playerScore">{myPlayer?.score || 0}</div>
          
          <div className="typingArea">
            {renderWord(typedText)}
          </div>
          
          {/* 妨害中テキストを削除 */}

          <div className="statsContainer">
            <p className="statText">Correct: {correctlyType}</p>
            <p className="statText">Miss: {missType}</p>
          </div>
        </div>

        {/* 相手のエリア */}
        <div className="playerBox opponentPlayerBox">
          <div className="playerName">{opponent?.name || 'OPPONENT'}</div>
          <div className="playerScore">{opponent?.score || 0}</div>
          <div className="typingArea">
            {opponent ? renderWord(opponent.typedText) : <span style={{ color: '#a0a0a0' }}>...</span>}
          </div>
        </div>

      </div>
    </main>
  );
}
