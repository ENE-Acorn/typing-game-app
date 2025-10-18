// GameScreen.js - 正しい形

// HomeコンポーネントからGameStateの型定義をimportするか、
// もしくは共通のtypes.tsのようなファイルから読み込む
import { GameState } from '../page'; // Home.jsからインポートする場合の例

// ① GameScreenが受け取るpropsの型を定義する
interface GameScreenProps {
  socket: WebSocket | null;
  gameState: GameState; // ← gameStateをここに追加！
}

// ② 定義した型をコンポーネントの引数に適用する
const GameScreen = ({ socket, gameState }: GameScreenProps) => {
  return (
    <div>
      <h1>ゲーム画面</h1>
      <p>現在の状態: {gameState.status}</p>
    </div>
  );
};

export default GameScreen;