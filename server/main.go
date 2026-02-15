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
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

type Message struct {
	Type    string      `json:"type"`
	Target  string      `json:"target"`
	From    string      `json:"from,omitempty"`
	Payload interface{} `json:"payload"`
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
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	log.Println("EmuX Relay Server starting on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing id", 400)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	client := &Client{conn: conn}

	mutex.Lock()
	if old, exists := clients[id]; exists {
		old.conn.Close()
	}
	clients[id] = client
	mutex.Unlock()

	log.Printf("Client %s connected", id)

	defer func() {
		mutex.Lock()
		delete(clients, id)
		mutex.Unlock()
		conn.Close()
		log.Printf("Client %s disconnected", id)
	}()

	for {
		_, p, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg Message
		if err := json.Unmarshal(p, &msg); err != nil {
			log.Printf("Unmarshal error from %s: %v", id, err)
			continue
		}

		msg.From = id

		mutex.RLock()
		target, exists := clients[msg.Target]
		mutex.RUnlock()

		if exists {
			target.mu.Lock()
			target.conn.WriteJSON(msg)
			target.mu.Unlock()
		} else {
			// Optional: Notify sender target not found
		}
	}
}
