import machine, neopixel, time
import sys
import select
import json
from machine import Pin

# --- 設定 ---
# サーバー(Windows PC)とはUSBケーブル経由のシリアル通信（USB CDC）でやり取りします。
# Windows側はデバイスマネージャーで確認できるCOMポート番号(.envのPICO_SERIAL_PORT)を、
# このPico側では特別な設定は不要です（USB接続するだけで自動的に認識されます）。
PIN_NUM = 14      # GP15 (物理ピン20)
LED_COUNT = 10   # LEDの数
PIN_NUM2 = 15
# --- 設定おわり ---

# # ピンの番号とLEDの数でNeoPixcelを設定
np = neopixel.NeoPixel(machine.Pin(PIN_NUM), LED_COUNT)
np2 = neopixel.NeoPixel(machine.Pin(PIN_NUM2), LED_COUNT)
led = machine.Pin("LED", Pin.OUT)

def lightOn(seat, consecutiveCount):
    num_to_light = 0
    print(f"lightOn実行 - Player ID: {seat}, consecutiveCount: {consecutiveCount}")
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
    np.fill((0, 0, 0))
    np.write()

    np2.fill((0, 0, 0))
    np2.write()

def handle_message(data):
    msg_type = data.get("type")
    if msg_type == "progressUpdate":
        lightOn(data.get("seat"), data.get("consecutiveCount"))
    elif msg_type == "gameClear":
        allLightOff()

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
led.on()
print("USBシリアル接続待機中... サーバーからのメッセージを待っています。")

while True:
    try:
        process_available_input()
    except Exception as e:
        print(f"エラー発生: {e}")
        allLightOff()
    time.sleep_ms(10)
