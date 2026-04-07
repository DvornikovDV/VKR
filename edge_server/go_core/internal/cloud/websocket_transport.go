package cloud

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type WebSocketTransportConfig struct {
	CloudURL       string
	Namespace      string
	ConnectTimeout time.Duration
	HTTPHeader     http.Header
}

type WebSocketTransport struct {
	endpointURL    string
	namespace      string
	connectTimeout time.Duration
	header         http.Header
	dialer         *websocket.Dialer

	mu               sync.RWMutex
	conn             *websocket.Conn
	onEdgeActivation func(any)
	onEdgeDisconnect func(any)
	onConnect        func() error
	onConnectError   func(error)
	onDisconnect     func(string)
	clientClosing    bool
}

func NewWebSocketTransport(cfg WebSocketTransportConfig) (*WebSocketTransport, error) {
	cloudURL := strings.TrimSpace(cfg.CloudURL)
	if cloudURL == "" {
		return nil, fmt.Errorf("cloud url is required")
	}

	namespace := normalizeNamespace(cfg.Namespace)
	endpointURL, err := buildSocketIOEndpointURL(cloudURL)
	if err != nil {
		return nil, err
	}

	connectTimeout := cfg.ConnectTimeout
	if connectTimeout <= 0 {
		connectTimeout = 5 * time.Second
	}

	return &WebSocketTransport{
		endpointURL:    endpointURL,
		namespace:      namespace,
		connectTimeout: connectTimeout,
		header:         cfg.HTTPHeader.Clone(),
		dialer:         websocket.DefaultDialer,
	}, nil
}

func (t *WebSocketTransport) Connect(ctx context.Context, auth HandshakeAuth) error {
	if err := auth.Validate(); err != nil {
		return err
	}

	dialCtx := ctx
	var cancel context.CancelFunc
	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		dialCtx, cancel = context.WithTimeout(ctx, t.connectTimeout)
		defer cancel()
	}

	conn, _, err := t.dialer.DialContext(dialCtx, t.endpointURL, t.header)
	if err != nil {
		return fmt.Errorf("dial socket.io endpoint: %w", err)
	}

	t.setConn(conn, false)

	if err := t.completeEngineHandshake(dialCtx, conn); err != nil {
		_ = conn.Close()
		t.clearConn(conn)
		return err
	}

	if err := t.writeNamespaceConnect(conn, auth); err != nil {
		_ = conn.Close()
		t.clearConn(conn)
		return err
	}

	if err := t.awaitNamespaceConnect(dialCtx, conn); err != nil {
		_ = conn.Close()
		t.clearConn(conn)
		return err
	}

	if handler := t.getOnConnect(); handler != nil {
		if err := handler(); err != nil {
			_ = conn.Close()
			t.clearConn(conn)
			return err
		}
	}

	go t.readLoop(conn)
	return nil
}

func (t *WebSocketTransport) Disconnect() error {
	conn := t.markClientClosing()
	if conn == nil {
		return nil
	}

	_ = conn.WriteMessage(websocket.TextMessage, []byte("41"+t.namespace+","))
	_ = conn.Close()
	t.clearConn(conn)

	if handler := t.getOnDisconnect(); handler != nil {
		handler("client_requested")
	}

	return nil
}

func (t *WebSocketTransport) Emit(event string, payload any) error {
	conn := t.currentConn()
	if conn == nil {
		return fmt.Errorf("transport is not connected")
	}

	message, err := encodeSocketIOEvent(t.namespace, event, payload)
	if err != nil {
		return err
	}

	if err := conn.WriteMessage(websocket.TextMessage, []byte(message)); err != nil {
		return fmt.Errorf("emit socket.io event: %w", err)
	}

	return nil
}

func (t *WebSocketTransport) OnEdgeActivation(handler func(any)) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.onEdgeActivation = handler
}

func (t *WebSocketTransport) OnEdgeDisconnect(handler func(any)) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.onEdgeDisconnect = handler
}

func (t *WebSocketTransport) OnConnect(handler func() error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.onConnect = handler
}

func (t *WebSocketTransport) OnConnectError(handler func(error)) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.onConnectError = handler
}

func (t *WebSocketTransport) OnDisconnect(handler func(string)) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.onDisconnect = handler
}

func (t *WebSocketTransport) completeEngineHandshake(ctx context.Context, conn *websocket.Conn) error {
	for {
		message, err := t.readTextMessage(ctx, conn)
		if err != nil {
			return err
		}

		switch {
		case strings.HasPrefix(message, "0"):
			return nil
		case message == "2":
			if err := conn.WriteMessage(websocket.TextMessage, []byte("3")); err != nil {
				return fmt.Errorf("send engine.io pong: %w", err)
			}
		}
	}
}

func (t *WebSocketTransport) writeNamespaceConnect(conn *websocket.Conn, auth HandshakeAuth) error {
	connectPayload, err := json.Marshal(map[string]any{
		"edgeId":           auth.EdgeID,
		"credentialMode":   auth.CredentialMode,
		"credentialSecret": auth.CredentialSecret,
	})
	if err != nil {
		return fmt.Errorf("encode namespace auth payload: %w", err)
	}

	packet := "40" + t.namespace + "," + string(connectPayload)
	if err := conn.WriteMessage(websocket.TextMessage, []byte(packet)); err != nil {
		return fmt.Errorf("write namespace connect packet: %w", err)
	}

	return nil
}

func (t *WebSocketTransport) awaitNamespaceConnect(ctx context.Context, conn *websocket.Conn) error {
	for {
		message, err := t.readTextMessage(ctx, conn)
		if err != nil {
			return err
		}

		switch {
		case message == "2":
			if err := conn.WriteMessage(websocket.TextMessage, []byte("3")); err != nil {
				return fmt.Errorf("send engine.io pong: %w", err)
			}
		case isNamespaceConnectAck(message, t.namespace):
			return nil
		case isNamespaceConnectError(message, t.namespace):
			connectErr := parseNamespaceConnectError(message, t.namespace)
			if handler := t.getOnConnectError(); handler != nil {
				handler(connectErr)
			}
			return connectErr
		case isNamespaceEvent(message, t.namespace):
			// Server should not emit business events before namespace CONNECT ack, but tolerate it.
			t.dispatchNamespaceEvent(message)
		}
	}
}

func (t *WebSocketTransport) readLoop(conn *websocket.Conn) {
	for {
		message, err := t.readTextMessage(context.Background(), conn)
		if err != nil {
			if t.wasClientClosing(conn) {
				return
			}

			t.clearConn(conn)
			if handler := t.getOnDisconnect(); handler != nil {
				handler(normalizeWebSocketDisconnectReason(err))
			}
			return
		}

		switch {
		case message == "2":
			_ = conn.WriteMessage(websocket.TextMessage, []byte("3"))
		case isNamespaceEvent(message, t.namespace):
			t.dispatchNamespaceEvent(message)
		case isNamespaceDisconnect(message, t.namespace):
			t.clearConn(conn)
			_ = conn.Close()
			if handler := t.getOnDisconnect(); handler != nil {
				handler("io server disconnect")
			}
			return
		}
	}
}

func (t *WebSocketTransport) dispatchNamespaceEvent(message string) {
	eventName, payload, err := parseNamespaceEvent(message, t.namespace)
	if err != nil {
		return
	}

	switch eventName {
	case "edge_activation":
		if handler := t.getOnEdgeActivation(); handler != nil {
			handler(payload)
		}
	case "edge_disconnect":
		if handler := t.getOnEdgeDisconnect(); handler != nil {
			handler(payload)
		}
	}
}

func (t *WebSocketTransport) readTextMessage(ctx context.Context, conn *websocket.Conn) (string, error) {
	deadline := time.Time{}
	if ctx != nil {
		if dl, ok := ctx.Deadline(); ok {
			deadline = dl
		}
	}
	if err := conn.SetReadDeadline(deadline); err != nil {
		return "", fmt.Errorf("set read deadline: %w", err)
	}

	messageType, payload, err := conn.ReadMessage()
	if err != nil {
		return "", err
	}
	if messageType != websocket.TextMessage {
		return "", fmt.Errorf("unexpected websocket message type %d", messageType)
	}

	return string(payload), nil
}

func (t *WebSocketTransport) setConn(conn *websocket.Conn, clientClosing bool) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.conn = conn
	t.clientClosing = clientClosing
}

func (t *WebSocketTransport) clearConn(conn *websocket.Conn) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.conn == conn {
		t.conn = nil
	}
	t.clientClosing = false
}

func (t *WebSocketTransport) currentConn() *websocket.Conn {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.conn
}

func (t *WebSocketTransport) markClientClosing() *websocket.Conn {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.conn == nil {
		return nil
	}
	t.clientClosing = true
	return t.conn
}

func (t *WebSocketTransport) wasClientClosing(conn *websocket.Conn) bool {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.conn == conn && t.clientClosing
}

func (t *WebSocketTransport) getOnEdgeActivation() func(any) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.onEdgeActivation
}

func (t *WebSocketTransport) getOnEdgeDisconnect() func(any) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.onEdgeDisconnect
}

func (t *WebSocketTransport) getOnConnect() func() error {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.onConnect
}

func (t *WebSocketTransport) getOnConnectError() func(error) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.onConnectError
}

func (t *WebSocketTransport) getOnDisconnect() func(string) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.onDisconnect
}

func buildSocketIOEndpointURL(cloudURL string) (string, error) {
	parsed, err := url.Parse(cloudURL)
	if err != nil {
		return "", fmt.Errorf("parse cloud url: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("cloud url scheme must be http or https")
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("cloud url host is required")
	}

	if parsed.Path == "" || parsed.Path == "/" {
		parsed.Path = "/socket.io/"
	} else {
		parsed.Path = strings.TrimRight(parsed.Path, "/") + "/socket.io/"
	}

	query := parsed.Query()
	query.Set("EIO", "4")
	query.Set("transport", "websocket")
	parsed.RawQuery = query.Encode()

	if parsed.Scheme == "http" {
		parsed.Scheme = "ws"
	} else {
		parsed.Scheme = "wss"
	}

	return parsed.String(), nil
}

func normalizeNamespace(namespace string) string {
	trimmed := strings.TrimSpace(namespace)
	if trimmed == "" || trimmed == "/" {
		return "/"
	}
	if strings.HasPrefix(trimmed, "/") {
		return trimmed
	}
	return "/" + trimmed
}

func encodeSocketIOEvent(namespace string, event string, payload any) (string, error) {
	encodedPayload, err := json.Marshal([]any{event, payload})
	if err != nil {
		return "", fmt.Errorf("encode socket.io event payload: %w", err)
	}

	return "42" + namespace + "," + string(encodedPayload), nil
}

func isNamespaceConnectAck(message string, namespace string) bool {
	return message == "40"+namespace || strings.HasPrefix(message, "40"+namespace+",")
}

func isNamespaceConnectError(message string, namespace string) bool {
	return strings.HasPrefix(message, "44"+namespace+",")
}

func isNamespaceDisconnect(message string, namespace string) bool {
	return strings.HasPrefix(message, "41"+namespace)
}

func isNamespaceEvent(message string, namespace string) bool {
	return strings.HasPrefix(message, "42"+namespace+",")
}

func parseNamespaceConnectError(message string, namespace string) error {
	payload := strings.TrimPrefix(message, "44"+namespace+",")
	var body struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal([]byte(payload), &body); err != nil {
		return fmt.Errorf("parse namespace connect_error payload: %w", err)
	}
	if strings.TrimSpace(body.Message) == "" {
		return fmt.Errorf("socket.io namespace connect_error is missing message")
	}

	return NewConnectError(body.Message)
}

func parseNamespaceEvent(message string, namespace string) (string, map[string]any, error) {
	payload := strings.TrimPrefix(message, "42"+namespace+",")

	var body []json.RawMessage
	if err := json.Unmarshal([]byte(payload), &body); err != nil {
		return "", nil, fmt.Errorf("parse namespace event payload: %w", err)
	}
	if len(body) < 2 {
		return "", nil, fmt.Errorf("socket.io namespace event payload must contain event name and data")
	}

	var eventName string
	if err := json.Unmarshal(body[0], &eventName); err != nil {
		return "", nil, fmt.Errorf("parse namespace event name: %w", err)
	}

	var eventPayload map[string]any
	if err := json.Unmarshal(body[1], &eventPayload); err != nil {
		return "", nil, fmt.Errorf("parse namespace event data: %w", err)
	}

	return eventName, eventPayload, nil
}

func normalizeWebSocketDisconnectReason(err error) string {
	if websocket.IsCloseError(err, websocket.CloseNormalClosure) {
		return "client namespace disconnect"
	}
	if websocket.IsCloseError(err, websocket.CloseGoingAway) {
		return "transport close"
	}
	if strings.Contains(strings.ToLower(err.Error()), "close") {
		return "transport close"
	}
	return "transport close"
}
