import type { GameState } from '../page'
import { motion } from 'framer-motion';//アニメーションのため

// propsの型を定義
interface CountdownScreenProps {
  gameState: GameState;
}
//gameState.countdownが3,2,1と自動で減っていくのでそれに応じて表示
export default function CountdownScreen({ gameState }: CountdownScreenProps) {

  const countdown = gameState?.countdown;

  if (countdown == null) {
    return (
      <main style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column'
      }}>
        <h1 style={{ fontSize: '10rem', color: '#ccc' }} >
          ロード中...
        </h1>
      </main>
    );
  }
  return (
    <main style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      flexDirection: 'column'
    }}>
      <motion.h1
        key={countdown} // ← 数字が変わるたびにアニメーションを再トリガー
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          fontSize: countdown > 0 ? '15rem' : '12rem',
          color: countdown > 0 ? '#ffc107' : '#28a745'
        }}
      >
        {countdown > 0 ? countdown : 'GO!'}
      </motion.h1>
    </main>
  );
}