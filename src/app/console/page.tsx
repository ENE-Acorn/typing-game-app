"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { GameState, Player } from '../page';
import './Console.css';

// サーバから届くログ1行分のデータ
interface LogEntry {
    id: number;
    time: number;
    level: string;
    text: string;
}

// 4分割した各画面の識別子
type PanelId = 'streak' | 'match' | 'server' | 'pico';

// 画面に保持しておくログの最大件数（サーバ側のリングバッファと合わせる）
const MAX_LOG_ENTRIES = 300;
// 連続正解がこの数に達すると相手に妨害が発生する（server.jsの判定と同じ値）
const INTERFERENCE_THRESHOLD = 50;
// ゲームの勝利に必要なスコア（Game.tsxの表示と同じ値）
const TARGET_SCORE_TO_WIN = 10;

// コンソールは観戦専用なので ?role=console を付けて接続する
// (プレイヤー枠を消費せず、3人目以降でも状態とログを受け取れる)
function buildConsoleWsUrl(): string {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base = process.env.NEXT_PUBLIC_WS_URL || `${wsProtocol}//${window.location.host}/ws`;
    return `${base}${base.includes('?') ? '&' : '?'}role=console`;
}

function formatTime(time: number): string {
    const date = new Date(time);
    const pad = (value: number, digits = 2) => String(value).padStart(digits, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

const STATUS_LABEL: Record<GameState['status'], string> = {
    waiting: '待機中',
    countdown: 'カウントダウン',
    playing: '対戦中',
    finished: '決着',
};

export default function ConsolePage() {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [serverLogs, setServerLogs] = useState<LogEntry[]>([]);
    const [picoLogs, setPicoLogs] = useState<LogEntry[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isPicoConnected, setIsPicoConnected] = useState(false);
    const [maximized, setMaximized] = useState<PanelId | null>(null);

    // サーバへ接続する（切断されたら自動で繋ぎ直す）
    useEffect(() => {
        let ws: WebSocket | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let isUnmounted = false;

        const appendLog = (setter: React.Dispatch<React.SetStateAction<LogEntry[]>>, entry: LogEntry) => {
            setter((prev) => {
                const next = [...prev, entry];
                return next.length > MAX_LOG_ENTRIES ? next.slice(next.length - MAX_LOG_ENTRIES) : next;
            });
        };

        const connect = () => {
            ws = new WebSocket(buildConsoleWsUrl());

            ws.onopen = () => setIsConnected(true);

            ws.onmessage = (event) => {
                const received = JSON.parse(event.data);

                switch (received.type) {
                    case 'consoleInit':
                        // 接続時に、それまでのログと現在の状態をまとめて受け取る
                        setGameState(received.state ?? null);
                        setServerLogs(received.serverLogs ?? []);
                        setPicoLogs(received.picoLogs ?? []);
                        setIsPicoConnected(!!received.picoConnected);
                        break;
                    case 'log':
                        appendLog(received.source === 'pico' ? setPicoLogs : setServerLogs, received.entry);
                        break;
                    case 'updateState':
                        setGameState(received.state);
                        break;
                    case 'picoStatus':
                        setIsPicoConnected(!!received.connected);
                        break;
                }
            };

            ws.onclose = () => {
                setIsConnected(false);
                if (!isUnmounted) {
                    reconnectTimer = setTimeout(connect, 3000); // 3秒後に再接続を試みる
                }
            };

            ws.onerror = () => ws?.close();
        };

        connect();

        // 接続維持のためのハートビート（30秒ごとにpingを送信）
        const pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);

        return () => {
            isUnmounted = true;
            clearInterval(pingInterval);
            if (reconnectTimer) clearTimeout(reconnectTimer);
            ws?.close();
        };
    }, []);

    // Escキーで最大化を解除する
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMaximized(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        document.body.style.margin = '0';
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.margin = '';
            document.body.style.overflow = '';
        };
    }, []);

    // 左→右の順で並べて、表示位置が入れ替わらないようにする
    const players = useMemo<Player[]>(() => {
        const list = gameState ? Object.values(gameState.players) : [];
        const seatOrder = (player: Player) => (player.seat === 'left' ? 0 : player.seat === 'right' ? 1 : 2);
        return [...list].sort((a, b) => seatOrder(a) - seatOrder(b) || a.id.localeCompare(b.id));
    }, [gameState]);

    const toggleMaximize = (panel: PanelId) => {
        setMaximized((current) => (current === panel ? null : panel));
    };

    return (
        <div className="console-root">
            <header className="console-header">
                <h1 className="console-title">中央コンソール</h1>
                <span className="status-badge">
                    <span className={`status-dot ${isConnected ? 'is-on' : 'is-off'}`}></span>
                    サーバー: {isConnected ? '接続中' : '切断（再接続待ち）'}
                </span>
                <span className="status-badge">
                    <span className={`status-dot ${isPicoConnected ? 'is-on' : 'is-off'}`}></span>
                    ラズパイ: {isPicoConnected ? '接続中' : '未接続'}
                </span>
                <span className="status-badge">
                    状態: {gameState ? STATUS_LABEL[gameState.status] : '不明'}
                </span>
                <div className="console-header-spacer"></div>
                <Link href="/" className="console-back-link">ゲーム画面へ戻る</Link>
            </header>

            <div className={`console-grid ${maximized ? 'is-maximized' : ''}`}>
                <Panel id="streak" title="連続正解数" maximized={maximized} onToggle={toggleMaximize}>
                    <StreakView players={players} />
                </Panel>

                <Panel id="match" title="対戦中の画面" maximized={maximized} onToggle={toggleMaximize}>
                    <MatchView gameState={gameState} players={players} />
                </Panel>

                <Panel
                    id="server"
                    title="サーバーのログ"
                    maximized={maximized}
                    onToggle={toggleMaximize}
                    count={serverLogs.length}
                    bodyClassName="log-body"
                >
                    <LogView logs={serverLogs} emptyText="まだサーバーのログはありません。" />
                </Panel>

                <Panel
                    id="pico"
                    title="ラズパイからのログ"
                    maximized={maximized}
                    onToggle={toggleMaximize}
                    count={picoLogs.length}
                    bodyClassName="log-body"
                >
                    <LogView logs={picoLogs} emptyText="まだラズパイからのログはありません。" />
                </Panel>
            </div>
        </div>
    );
}

// 4分割した画面1枚分の枠。ヘッダーのボタンで最大化を切り替えられる
interface PanelProps {
    id: PanelId;
    title: string;
    maximized: PanelId | null;
    onToggle: (panel: PanelId) => void;
    count?: number;
    bodyClassName?: string;
    children: React.ReactNode;
}

function Panel({ id, title, maximized, onToggle, count, bodyClassName, children }: PanelProps) {
    const isMaximized = maximized === id;
    return (
        <section className={`panel ${isMaximized ? 'is-maximized' : ''}`}>
            <header className="panel-header" onDoubleClick={() => onToggle(id)}>
                <h2 className="panel-title">{title}</h2>
                {count !== undefined && <span className="panel-count">{count}件</span>}
                <div className="panel-header-spacer"></div>
                <button className="panel-button" onClick={() => onToggle(id)}>
                    {isMaximized ? '⤡ 元に戻す' : '⤢ 最大化'}
                </button>
            </header>
            <div className={`panel-body ${bodyClassName || ''}`}>{children}</div>
        </section>
    );
}

// 2人の連続正解数（何連続で正しく打てているか）を表示する
function StreakView({ players }: { players: Player[] }) {
    if (players.length === 0) {
        return <p className="console-empty">プレイヤーが接続していません。</p>;
    }

    return (
        <div className="streak-list">
            {players.map((player) => {
                const count = player.consecutiveCount || 0;
                const percent = Math.min(count / INTERFERENCE_THRESHOLD, 1) * 100;
                const rest = INTERFERENCE_THRESHOLD - count;
                return (
                    <div className="streak-card" key={player.id}>
                        <div className="streak-head">
                            <span className="streak-name">{player.name || '名無しさん'}</span>
                            <span className={`seat-badge seat-${player.seat || 'none'}`}>
                                {player.seat === 'left' ? '左' : player.seat === 'right' ? '右' : '席未選択'}
                            </span>
                            {player.isBot && <span className="seat-badge">CPU</span>}
                        </div>
                        <div className="streak-value">
                            <span className="streak-number">{count}</span>
                            <span className="streak-unit">連続正解</span>
                        </div>
                        <div className="streak-bar">
                            <div className="streak-bar-fill" style={{ width: `${percent}%` }}></div>
                        </div>
                        <p className={`streak-note ${rest <= 0 ? 'is-fired' : ''}`}>
                            {rest <= 0
                                ? `${INTERFERENCE_THRESHOLD}連続達成！相手へ妨害が発生します`
                                : `あと ${rest} 連続で相手に妨害が発生`}
                        </p>
                    </div>
                );
            })}
        </div>
    );
}

// 対戦中の画面（お題・入力状況・スコア）をそのまま映す
function MatchView({ gameState, players }: { gameState: GameState | null; players: Player[] }) {
    if (!gameState) {
        return <p className="console-empty">サーバーからの情報を待っています…</p>;
    }

    if (gameState.status === 'waiting') {
        return <p className="console-empty">まだ対戦は始まっていません（待機中）。</p>;
    }

    if (gameState.status === 'countdown') {
        return <div className="match-word">開始まで {gameState.countdown}</div>;
    }

    const romaji = gameState.currentWordRomaji || '';

    return (
        <div className="match-view">
            <div className="match-status">
                <span className="status-badge">{STATUS_LABEL[gameState.status]}</span>
                <span className="status-badge">難易度: {gameState.difficulty}</span>
            </div>

            <div className="match-word">{gameState.currentWordJP || '－'}</div>

            <div className="match-players">
                {players.map((player) => {
                    const typedLength = player.typedText ? player.typedText.length : 0;
                    const scorePercent = Math.min((player.score || 0) / TARGET_SCORE_TO_WIN, 1) * 100;
                    return (
                        <div className="match-card" key={player.id}>
                            <div className="match-card-head">
                                <span className="match-name">{player.name || '名無しさん'}</span>
                                <span className={`seat-badge seat-${player.seat || 'none'}`}>
                                    {player.seat === 'left' ? '左' : player.seat === 'right' ? '右' : '席未選択'}
                                </span>
                                <span className="match-score">{player.score || 0}</span>
                            </div>
                            <div className="match-romaji">
                                <span className="typed">{romaji.slice(0, typedLength)}</span>
                                <span className="untyped">{romaji.slice(typedLength)}</span>
                            </div>
                            <div className="match-progress">
                                <div className="match-progress-fill" style={{ width: `${scorePercent}%` }}></div>
                            </div>
                            {player.interferenceType && player.interferenceType !== 'null' && (
                                <p className="match-interference">⚠️ 妨害中: {player.interferenceType}</p>
                            )}
                        </div>
                    );
                })}
            </div>

            {gameState.status === 'finished' && (
                <div className="match-winner">🏆 勝者: {gameState.winnerPlayerName || '－'}</div>
            )}
        </div>
    );
}

// 常に一番下（最新のログ）が見えるように追従する。
// 利用者が過去のログを読もうと上へスクロールしている間だけ追従を止め、
// 一番下の近くまで戻したら再び追従を再開する。
function useFollowBottom(logs: LogEntry[]) {
    const anchorRef = useRef<HTMLDivElement | null>(null);
    // 自分で一番下へ動かしたときの位置。ここから動いていれば利用者が操作したと分かる
    const lastScrolledTopRef = useRef(-1);

    // 実際にスクロールする箱(.panel-body)を、目印の要素から辿って取得する
    const getContainer = () => (anchorRef.current?.closest('.panel-body') as HTMLElement | null) ?? null;

    // 利用者が過去のログを読もうと自分で上へスクロールしているかどうか。
    // スクロールイベントに頼らず位置の比較で判断するので、確実に動く。
    const isUserScrolledAway = (container: HTMLElement) => {
        const movedByUser =
            lastScrolledTopRef.current >= 0 && Math.abs(container.scrollTop - lastScrolledTopRef.current) > 8;
        const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        // 一番下の近くまで戻したら、また追従を再開する
        return movedByUser && distanceToBottom > 80;
    };

    const followBottom = () => {
        const container = getContainer();
        // 最大化で隠れている間(高さ0)に動かすと位置がずれるので何もしない
        if (!container || container.clientHeight === 0) return;
        if (isUserScrolledAway(container)) return;

        container.scrollTop = container.scrollHeight;
        lastScrolledTopRef.current = container.scrollTop; // 実際に落ち着いた位置を覚えておく
    };

    useEffect(() => {
        const container = getContainer();
        if (!container) return;

        // 最大化/元に戻すで表示サイズが変わったときも、一番下に合わせ直す
        const observer = new ResizeObserver(() => followBottom());
        observer.observe(container);

        followBottom();

        return () => observer.disconnect();
    }, []);

    // ログが増えるたびに一番下へ移動する
    useEffect(() => {
        followBottom();
        // 長い行の折り返しなどで高さが後から確定する場合に備えて、描画後にもう一度合わせる
        const frameId = requestAnimationFrame(followBottom);
        return () => cancelAnimationFrame(frameId);
    }, [logs]);

    return anchorRef;
}

// ログを時刻付きで並べる。新しい行が来たら自動で一番下までスクロールする
function LogView({ logs, emptyText }: { logs: LogEntry[]; emptyText: string }) {
    const anchorRef = useFollowBottom(logs);

    return (
        <div>
            {logs.length === 0 && <p className="log-empty">{emptyText}</p>}
            {logs.map((log) => (
                <div className={`log-line level-${log.level}`} key={log.id}>
                    <span className="log-time">{formatTime(log.time)}</span>
                    <span className="log-text">{log.text}</span>
                </div>
            ))}
            {/* 一番下の位置を知るための目印 */}
            <div ref={anchorRef}></div>
        </div>
    );
}
