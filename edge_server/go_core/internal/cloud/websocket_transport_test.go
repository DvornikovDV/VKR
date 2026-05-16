package cloud

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestWebSocketTransportSerializesConcurrentEmitAndPongWrites(t *testing.T) {
	server := newWebSocketTransportTestServer(t)
	defer server.Close()

	transport, err := NewWebSocketTransport(WebSocketTransportConfig{
		CloudURL:  server.URL(),
		Namespace: "/edge",
	})
	if err != nil {
		t.Fatalf("create websocket transport: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := transport.Connect(ctx, HandshakeAuth{
		EdgeID:           "edge-1",
		CredentialSecret: "credential-secret",
	}); err != nil {
		t.Fatalf("connect websocket transport: %v", err)
	}
	defer transport.Disconnect()

	start := make(chan struct{})
	errs := make(chan error, 32)
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func(seq int) {
			defer wg.Done()
			<-start
			if err := transport.Emit("telemetry", map[string]any{"seq": seq}); err != nil {
				errs <- err
			}
		}(i)
	}

	close(start)
	server.SendPing()

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("concurrent emits did not complete")
	}
	close(errs)
	for err := range errs {
		t.Fatalf("emit failed: %v", err)
	}

	if err := server.WaitForMessage("3", 2*time.Second); err != nil {
		t.Fatalf("wait for engine.io pong: %v", err)
	}
}

type webSocketTransportTestServer struct {
	t         *testing.T
	server    *httptest.Server
	messages  chan string
	pings     chan struct{}
	closeOnce sync.Once
}

func newWebSocketTransportTestServer(t *testing.T) *webSocketTransportTestServer {
	t.Helper()

	srv := &webSocketTransportTestServer{
		t:        t,
		messages: make(chan string, 128),
		pings:    make(chan struct{}, 1),
	}

	upgrader := websocket.Upgrader{
		CheckOrigin: func(_ *http.Request) bool { return true },
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/socket.io/" {
			http.NotFound(w, r)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		if err := conn.WriteMessage(websocket.TextMessage, []byte(`0{"sid":"transport-test-sid","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}`)); err != nil {
			return
		}

		_, payload, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if !strings.HasPrefix(string(payload), "40/edge,") {
			srv.t.Errorf("expected namespace connect packet, got %q", string(payload))
			return
		}

		if err := conn.WriteMessage(websocket.TextMessage, []byte(`40/edge,{"sid":"edge-1"}`)); err != nil {
			return
		}

		go func() {
			for range srv.pings {
				_ = conn.SetWriteDeadline(time.Now().Add(time.Second))
				if err := conn.WriteMessage(websocket.TextMessage, []byte("2")); err != nil {
					return
				}
			}
		}()

		for {
			_, payload, err := conn.ReadMessage()
			if err != nil {
				return
			}
			srv.messages <- string(payload)
		}
	})

	srv.server = httptest.NewServer(handler)
	return srv
}

func (s *webSocketTransportTestServer) URL() string {
	return s.server.URL
}

func (s *webSocketTransportTestServer) Close() {
	s.closeOnce.Do(func() {
		close(s.pings)
		s.server.Close()
	})
}

func (s *webSocketTransportTestServer) SendPing() {
	s.pings <- struct{}{}
}

func (s *webSocketTransportTestServer) WaitForMessage(want string, timeout time.Duration) error {
	timer := time.NewTimer(timeout)
	defer timer.Stop()

	for {
		select {
		case got := <-s.messages:
			if got == want {
				return nil
			}
		case <-timer.C:
			return fmt.Errorf("message %q was not received", want)
		}
	}
}
