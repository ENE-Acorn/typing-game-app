import machine, neopixel, time
import sys
import select
import json
from machine import Pin

# --- 設定 ---
# サーバー(Windows PC)とはUSBケーブル経由のシリアル通信（USB CDC）でやり取りします。
# Windows側はデバイスマネージャーで確認できるCOMポート番号(.envのPICO_SERIAL_PORT)を、
# このPico側では特別な設定は不要です（USB接続するだけで自動的に認識されます）。
PIN_NUM = 14      # GP14 (物理ピン19)
LED_COUNT = 10   # LEDの数
PIN_NUM2 = 15    # GP15 (物理ピン20)
# 動作確認用に、一定間隔で「動いている」ことをサーバへ知らせる間隔(ミリ秒)
HEARTBEAT_INTERVAL_MS = 5000
# --- 設定おわり ---

# 初期化に失敗しても main.py 自体が止まらないようにする。
# (ここで例外が出るとスクリプトごと停止し、サーバ側からは「繋がるが何も返ってこない」状態に見えるため)
init_error = None

# # ピンの番号とLEDの数でNeoPixcelを設定
try:
    np = neopixel.NeoPixel(machine.Pin(PIN_NUM), LED_COUNT)
    np2 = neopixel.NeoPixel(machine.Pin(PIN_NUM2), LED_COUNT)
except Exception as e:
    np = None
    np2 = None
    init_error = f"NeoPixel初期化エラー(GP{PIN_NUM}/GP{PIN_NUM2}): {e}"

# 本体の緑LEDは「main.pyが動いている」ことの目印。ボードによっては "LED" 指定が使えないため、
# 失敗しても続行する
try:
    led = machine.Pin("LED", Pin.OUT)
except Exception as e:
    led = None
    print(f"本体LEDの初期化に失敗しました(処理は続行します): {e}")

def lightOn(seat, consecutiveCount):
    num_to_light = 0
    print(f"lightOn実行 - Player ID: {seat}, consecutiveCount: {consecutiveCount}")
    if np is None or np2 is None:
        print(f"LEDを操作できません: {init_error}")
        return
    if seat not in ("right", "left"):
        print(f"seatが不正なため点灯しません: {seat}")
        return
    if seat == "right":
        if consecutiveCount >= 50:
            num_to_light = 10
        elif consecutiveCount >= 40:
            num_to_light = 8
        elif consecutiveCount >= 30:
            num_to_light = 6
        elif consecutiveCount >= 20:
            num_to_light = 4
        elif consecutiveCount >= 10:
            num_to_light = 2

         # すべてのLEDを消灯（リセット）
        np.fill((0, 0, 0))

        # 必要な数のLEDを点灯
        for i in range(num_to_light):
            np[i] = (255,0,0)

        np.write()

    elif seat == "left":
        if consecutiveCount >= 50:
            num_to_light = 10
        elif consecutiveCount >= 40:
            num_to_light = 8
        elif consecutiveCount >= 30:
            num_to_light = 6
        elif consecutiveCount >= 20:
            num_to_light = 4
        elif consecutiveCount >= 10:
            num_to_light = 2

        # すべてのLEDを消灯（リセット）
        np2.fill((0, 0, 0))

        # 必要な数のLEDを点灯
        for i in range(num_to_light):
            np2[i] = (255,0,0)

        np2.write()

def allLightOff():
    print("lightOff実行")
    if np is None or np2 is None:
        print(f"LEDを操作できません: {init_error}")
        return
    np.fill((0, 0, 0))
    np.write()

    np2.fill((0, 0, 0))
    np2.write()

def handle_message(data):
    msg_type = data.get("type")
    print(f"受信: {msg_type}")
    if msg_type == "progressUpdate":
        lightOn(data.get("seat"), data.get("consecutiveCount"))
    elif msg_type == "gameClear":
        allLightOff()
    else:
        print(f"未知のメッセージのため無視します: {msg_type}")

# USBシリアル(stdin)から1行分のJSONメッセージを読み取る。
# select.poll()でデータの到着を確認しながら1文字ずつ読むことで、
# 行の途中でブロッキングしてLED制御が止まってしまうのを防ぐ。
poll = select.poll()
poll.register(sys.stdin, select.POLLIN)
line_buffer = ""

def process_available_input():
    global line_buffer
    while poll.poll(0):
        ch = sys.stdin.read(1)
        if not ch:
            break
        if ch == "\n":
            line = line_buffer.strip()
            line_buffer = ""
            if not line:
                continue
            try:
                data = json.loads(line)
            except ValueError:
                print("JSON解析エラー:", line)
                continue
            handle_message(data)
        else:
            line_buffer += ch

# --- メイン処理 ---
if led is not None:
    led.on()
print("USBシリアル接続待機中... サーバーからのメッセージを待っています。")
if init_error:
    print(init_error)

# 起動時のメッセージはサーバが接続する前に流れてしまうため、
# 一定間隔で動作中であることを出力する（サーバ側は DEBUG=true で [Picoログ] として表示される）
last_heartbeat = time.ticks_ms()

while True:
    try:
        process_available_input()

        if time.ticks_diff(time.ticks_ms(), last_heartbeat) >= HEARTBEAT_INTERVAL_MS:
            last_heartbeat = time.ticks_ms()
            print("Pico動作中" if not init_error else f"Pico動作中 / {init_error}")
    except Exception as e:
        print(f"エラー発生: {e}")
        allLightOff()
    time.sleep_ms(10)
