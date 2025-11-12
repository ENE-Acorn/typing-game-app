import styles from './Result.module.css';
import type { GameState, Player } from '../page'
interface ResultScreenProps {
  gameState: GameState;
  myId: string;
  onReset: () => void;
}

export default function Result({ gameState, myId, onReset}: ResultScreenProps) {

  let myPlayerInfo: Player | undefined;//ここで、もしプレイヤーがいなくても初期値が入るようにする
  let opponentInfo: Player | undefined;//同上

  if (gameState?.players) {
    // gameState.playersの中から、myIdと一致するidを持つプレイヤーが「自分」
    myPlayerInfo = gameState.players[myId];

    // gameState.playersの中から、myIdと"一致しない"idを持つプレイヤーを探して「相手」とする
    opponentInfo = Object.values(gameState.players).find(p => p.id !== myId);
  }
  const totalTime = (gameState.finishTime - gameState.startTime) / 1000;//試合時間
  //メモ：toFixedは切り上げですよ

  const handleClick = () => {
      onReset();//まずはResultの上司であるGameにゲームリセット処理を依頼
    }

  return (
    // <main className={styles.container}>
    //   <p>自分の勝敗：</p>{gameState.winnerPlayerName == myPlayerInfo.name ? (
    //     <p>あなたの勝ちです</p>
    //   ) : (
    //     <p>あなたの負けです</p>
    //   )}
    //   <p>自分の名前：{myPlayerInfo.name}</p>
    //   <p>自分の正答率：{(((myPlayerInfo.correctlyType / (myPlayerInfo.correctlyType + myPlayerInfo.missType))) * 100).toFixed(3)}%</p>
    //   <p>自分の平均キータイプ数：１秒あたり{(myPlayerInfo.correctlyType / totalTime).toFixed(3)}打</p>
    //   <p>相手の名前：{opponentInfo.name}</p>
    //   <p>相手の正答率：{(((opponentInfo.correctlyType / (opponentInfo.correctlyType + opponentInfo.missType))) * 100).toFixed(3)}%</p>
    //   <p>相手の平均キータイプ数:{(opponentInfo.correctlyType / totalTime).toFixed(3)}打</p>
    //   <button
    //     onClick={handleClick}
    //     className="p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
    //   >
    //     スタートに戻る
    //   </button>  </main>
    <main className={styles.container}>
  <p>自分の勝敗：</p>
  {gameState.winnerPlayerName == myPlayerInfo?.name ? (
    <p>あなたの勝ちです</p>
  ) : (
    <p>あなたの負けです</p>
  )}
  <div className={styles.resultRow}>
    <div className={`${styles.card} ${styles.myCard}`}>
      <p>自分の名前：{myPlayerInfo?.name ?? "未参加"}</p>
      <p>正答率：{myPlayerInfo ? (((myPlayerInfo.correctlyType / (myPlayerInfo.correctlyType + myPlayerInfo.missType))) * 100).toFixed(3) : "-"}%</p>
      <p>平均キータイプ数：{myPlayerInfo ? (myPlayerInfo.correctlyType / totalTime).toFixed(3) : "-"}打/秒</p>
    </div>
    <div className={`${styles.card} ${styles.opponentCard}`}>
      <p>相手の名前：{opponentInfo?.name ?? "未参加"}</p>
      <p>正答率：{opponentInfo ? (((opponentInfo.correctlyType / (opponentInfo.correctlyType + opponentInfo.missType))) * 100).toFixed(3) : "-"}%</p>
      <p>平均キータイプ数：{opponentInfo ? (opponentInfo.correctlyType / totalTime).toFixed(3) : "-"}打/秒</p>
    </div>
  </div>
  <button
    onClick={handleClick}
    className="p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
  >
    スタートに戻る
  </button>
</main>
  );
};
