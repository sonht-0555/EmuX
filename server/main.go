package main

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Client struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

var (
	clients = make(map[string]*Client)
	mutex   sync.RWMutex
)

func main() {
	// 1. Khởi động UDP Sniffer (Experimental)
	go startUDPSniffer()

	http.HandleFunc("/ws", handleWebSocket)
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("OK"))
	})

	log.Println("EmuX v6.0 Ultra (Zero-TURN) starting on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}

func startUDPSniffer() {
	addr, _ := net.ResolveUDPAddr("udp", ":8080")
	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		log.Fatal("UDP Listen Error:", err)
	}
	defer conn.Close()

	buf := make([]byte, 1500)
	for {
		n, remoteAddr, err := conn.ReadFromUDP(buf)
		if err != nil { continue }

		// STUN packet header is 20 bytes. 
		// Magic Cookie is at byte 4-7: 0x2112A442
		if n >= 20 && buf[4] == 0x21 && buf[5] == 0x12 && buf[6] == 0xA4 && buf[7] == 0x42 {
			// Đây là một gói tin STUN thật sự!
			// Ta tìm thuộc tính USERNAME (0x0006) bên trong
			pos := 20
			for pos+4 <= n {
				attrType := uint16(buf[pos])<<8 | uint16(buf[pos+1])
				attrLen := uint16(buf[pos+2])<<8 | uint16(buf[pos+3])
				pos += 4
				if attrType == 0x0006 { // USERNAME attribute
					ufrag := string(buf[pos : pos+int(attrLen)])
					// ufrag trong STUN thường là "localUfrag:remoteUfrag" hoặc chỉ "localUfrag"
					// Chúng ta chỉ cần lấy phần ID của mình
					id := ufrag
					if len(ufrag) > 4 { id = ufrag[:4] }
					
					log.Printf("🎯 STUN caught ID %s from %s", id, remoteAddr.String())

					mutex.RLock()
					client, exists := clients[id]
					mutex.RUnlock()

					if exists {
						client.mu.Lock()
						client.conn.WriteJSON(map[string]interface{}{
							"type": "sniffed_cand",
							"ip":   remoteAddr.IP.String(),
							"port": remoteAddr.Port,
						})
						client.mu.Unlock()
					}
					break
				}
				pos += int((attrLen + 3) &^ 3) // STUN padding 4-byte
			}
		}
	}
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" { return }

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil { return }
	
	client := &Client{conn: conn}
	mutex.Lock()
	clients[id] = client
	log.Printf("Node %s connected", id)
	mutex.Unlock()

	defer func() {
		mutex.Lock()
		delete(clients, id)
		log.Printf("Node %s disconnected", id)
		mutex.Unlock()
		conn.Close()
	}()

	for {
		messageType, p, err := conn.ReadMessage()
		if err != nil { break }

		if messageType == websocket.TextMessage {
			var msg map[string]interface{}
			if err := json.Unmarshal(p, &msg); err == nil {
				targetID, ok := msg["target"].(string)
				if !ok { continue }

				msg["from"] = id
				mutex.RLock()
				target, exists := clients[targetID]
				mutex.RUnlock()

				if exists {
					target.mu.Lock()
					target.conn.WriteJSON(msg)
					target.mu.Unlock()
				}
			}
		}
	}
}
