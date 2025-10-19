import type { GameState, Player } from '../page'

interface GameScreenProps {
  gameState: GameState;
  myId: string;
}

export default function Result({ gameState, myId }: GameScreenProps){

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
  return (
    <main>
      <p>自分の勝敗：</p>{gameState.winnerPlayerName == myPlayerInfo.name ? (
        <p>あなたの勝ちです</p>
      ) : (
        <p>あなたの負けです</p>
      )}
      <p>自分の名前：{myPlayerInfo.name}</p>
      <p>自分の正答率：{(myPlayerInfo.correctlyType / (myPlayerInfo.correctlyType + myPlayerInfo.missType)).toFixed(3)}%</p>
      <p>相手の平均キータイプ数：{(myPlayerInfo.correctlyType / totalTime).toFixed(3)}</p>
      <p>相手の名前：{opponentInfo.name}</p>
      <p>相手の正答率：{(opponentInfo.correctlyType / (opponentInfo.correctlyType + opponentInfo.missType)).toFixed(3)}%</p>
      <p>相手の平均キータイプ数:{(opponentInfo.correctlyType / totalTime).toFixed(3)}</p>
    </main>
  );
};
