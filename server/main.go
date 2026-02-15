package main

import (
	"encoding/json"
	"log"
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
	http.HandleFunc("/ws", handleWebSocket)
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("OK"))
	})
	log.Println("EmuX Debug Relay (v5.1) starting on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
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
		if err != nil {
			log.Printf("Read error from %s: %v", id, err)
			break
		}

		log.Printf("Msg from %s: type=%d, len=%d", id, messageType, len(p))

		if messageType == websocket.TextMessage {
			log.Printf("Text from %s: %s", id, string(p))
			var msg map[string]interface{}
			if err := json.Unmarshal(p, &msg); err == nil {
				targetID, ok := msg["target"].(string)
				if !ok {
					log.Printf("Signal Fail: Missing target in JSON from %s", id)
					continue
				}

				msg["from"] = id
				mutex.RLock()
				target, exists := clients[targetID]
				mutex.RUnlock()

				if exists {
					log.Printf("Relaying Signal: %s -> %s (%v)", id, targetID, msg["type"])
					target.mu.Lock()
					target.conn.WriteJSON(msg)
					target.mu.Unlock()
				} else {
					log.Printf("Relay Fail: Target %s not found for source %s", targetID, id)
					client.mu.Lock()
					client.conn.WriteJSON(map[string]string{
						"type": "error",
						"msg":  "PEER_NOT_FOUND",
					})
					client.mu.Unlock()
				}
			} else {
				log.Printf("JSON Unmarshal error from %s: %v", id, err)
			}
		} else if messageType == websocket.BinaryMessage {
			if len(p) < 4 {
				log.Printf("Binary too short from %s", id)
				continue
			}
			targetID := string(p[:4])
			mutex.RLock()
			target, exists := clients[targetID]
			mutex.RUnlock()

			if exists {
				target.mu.Lock()
				resp := make([]byte, 4+len(p[4:]))
				copy(resp[0:4], []byte(id))
				copy(resp[4:], p[4:])
				target.conn.WriteMessage(websocket.BinaryMessage, resp)
				target.mu.Unlock()
			} else {
				log.Printf("Binary Relay Fail: Target %s not found for %s", targetID, id)
			}
		}
	}
}
