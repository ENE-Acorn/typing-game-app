import type { GameState } from '../page'

// propsの型を定義
interface CountdownScreenProps {
  gameState: GameState;
}

export default function CountdownScreen({ gameState }: CountdownScreenProps) {
  return (
    <main style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      flexDirection: 'column'
    }}>
      {gameState.countdown > 0 ? (
        // カウントダウン中の数字を表示
        <h1 style={{ fontSize: '15rem', color: '#ffc107' }}>
          {gameState.countdown}
        </h1>
      ) : (
        // カウントが0になったらGO!を表示
        <h1 style={{ fontSize: '12rem', color: '#28a745' }}>
          GO!
        </h1>
      )}
    </main>
  );
}