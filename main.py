import machine, neopixel, time
import network
import time
import json
from machine import Pin
from websockets.client import connect

# --- あなたの環境に合わせて書き換えてください ---
WIFI_SSID = "typing-wifi"
WIFI_PASSWORD = "tridentwifi"
WEBSOCKET_URI = "ws://192.168.137.117:3000/ws"
# -------------------------------------------------

# --- 設定 ---
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

def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    wlan.connect(WIFI_SSID, WIFI_PASSWORD)
    print("Wi-Fiに接続中...")
    max_wait = 10
    while max_wait > 0:
        if wlan.isconnected() and wlan.status() >= 0:
            break
        max_wait -= 1
        time.sleep(1)
    if wlan.isconnected():
        print("Wi-Fi接続完了！ IP:", wlan.ifconfig()[0])
        return True
    else:
        print("Wi-Fi接続失敗")
        return False

# --- メイン処理 ---
led.on()
if connect_wifi():
    print("Wi-Fi接続成功。サーバー接続ループを開始します。")
    
    while True:
        try:
            print(f"サーバーに接続します: {WEBSOCKET_URI}")
            
            with connect(WEBSOCKET_URI) as websocket:
                print("サーバーに接続成功！")
                                
                # --- メッセージ受信ループ ---
                while True:
                    message_data = websocket.recv() 
                    
                    # (bytes で受信した場合の対策)
                    if isinstance(message_data, bytes):
                        message_str = message_data.decode('utf-8')
                    else:
                        message_str = message_data
                    
                    data = json.loads(message_str)
                    
                    if data.get("type") == "assignId":
                        print(f"サーバーからID {data.get('playerId')} を受信（処理スキップ）")
                        continue 
                    
                    if data.get("type") == "progressUpdate":
                        print("progressUpdateを受信")
                        lightOn(data.get("seat"), data.get("consecutiveCount"))
                    
                    if data.get("type") == "gameClear":
                        allLightOff()                      
                    
        except Exception as e:
            print(f"エラー発生: {e}")
            allLightOff()
            print("5秒後に再接続を試みます...")
            time.sleep(5)
else:
    print("Wi-Fiに接続できなかったため、処理を終了します。")
    led.off()