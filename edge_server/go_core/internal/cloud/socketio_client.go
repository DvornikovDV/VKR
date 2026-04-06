package cloud

import (
	"context"
	"fmt"
	"strings"
	"sync"
)

type SocketIOClientConfig struct {
	ExpectedEdgeID string
	Transport      Transport
}

type LifecycleHandlers struct {
	OnActivation    func(EdgeActivation)
	OnDisconnect    func(EdgeDisconnect)
	OnConnectError  func(ConnectErrorCode)
	OnProtocolError func(ProtocolError)
}

type ProtocolError struct {
	Event string
	Err   error
}

type SocketIOClient struct {
	expectedEdgeID string
	transport      Transport
	handlers       LifecycleHandlers
	mu             sync.Mutex
	pendingEdgeDis *EdgeDisconnect
}

func NewSocketIOClient(cfg SocketIOClientConfig) (*SocketIOClient, error) {
	if cfg.Transport == nil {
		return nil, fmt.Errorf("socket transport is required")
	}
	if strings.TrimSpace(cfg.ExpectedEdgeID) == "" {
		return nil, fmt.Errorf("expected edgeId is required")
	}

	return &SocketIOClient{
		expectedEdgeID: strings.TrimSpace(cfg.ExpectedEdgeID),
		transport:      cfg.Transport,
	}, nil
}

func (c *SocketIOClient) RegisterLifecycleHandlers(handlers LifecycleHandlers) error {
	if handlers.OnActivation == nil &&
		handlers.OnDisconnect == nil &&
		handlers.OnConnectError == nil &&
		handlers.OnProtocolError == nil {
		return fmt.Errorf("at least one lifecycle handler is required")
	}

	c.handlers = handlers
	c.transport.OnEdgeActivation(func(payload any) {
		event, err := ParseEdgeActivation(payload, c.expectedEdgeID)
		if err != nil {
			c.reportProtocolError("edge_activation", err)
			return
		}
		if c.handlers.OnActivation == nil {
			return
		}
		c.handlers.OnActivation(event)
	})
	c.transport.OnEdgeDisconnect(func(payload any) {
		event, err := ParseEdgeDisconnect(payload, c.expectedEdgeID)
		if err != nil {
			c.reportProtocolError("edge_disconnect", err)
			return
		}
		c.setPendingEdgeDisconnect(event)
		if c.handlers.OnDisconnect == nil {
			return
		}
		c.handlers.OnDisconnect(event)
	})
	c.transport.OnConnectError(func(err error) {
		if c.handlers.OnConnectError == nil {
			return
		}
		c.handlers.OnConnectError(NormalizeConnectError(err))
	})
	c.transport.OnDisconnect(func(reason string) {
		if c.handlers.OnDisconnect == nil {
			return
		}

		c.handlers.OnDisconnect(c.normalizeOrdinaryDisconnect(reason))
	})

	return nil
}

func (c *SocketIOClient) reportProtocolError(event string, err error) {
	if c.handlers.OnProtocolError == nil {
		return
	}

	c.handlers.OnProtocolError(ProtocolError{
		Event: event,
		Err:   err,
	})
}

func (c *SocketIOClient) Connect(ctx context.Context, auth HandshakeAuth) error {
	if err := auth.Validate(); err != nil {
		return err
	}
	if auth.EdgeID != c.expectedEdgeID {
		return fmt.Errorf("handshake edgeId %q does not match expected edgeId %q", auth.EdgeID, c.expectedEdgeID)
	}
	c.clearPendingEdgeDisconnect()

	return c.transport.Connect(ctx, auth)
}

func (c *SocketIOClient) Disconnect() error {
	c.clearPendingEdgeDisconnect()
	return c.transport.Disconnect()
}

func (c *SocketIOClient) EmitTelemetry(payload map[string]any) error {
	return c.transport.Emit("telemetry", payload)
}

func (c *SocketIOClient) setPendingEdgeDisconnect(event EdgeDisconnect) {
	c.mu.Lock()
	defer c.mu.Unlock()

	copy := event
	c.pendingEdgeDis = &copy
}

func (c *SocketIOClient) clearPendingEdgeDisconnect() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.pendingEdgeDis = nil
}

func (c *SocketIOClient) normalizeOrdinaryDisconnect(reason string) EdgeDisconnect {
	normalized := NormalizeSocketDisconnect(reason, c.expectedEdgeID)

	c.mu.Lock()
	defer c.mu.Unlock()

	if normalized.Reason == DisconnectReasonForced && c.pendingEdgeDis != nil {
		normalized.EdgeID = c.pendingEdgeDis.EdgeID
		normalized.Reason = c.pendingEdgeDis.Reason
	}

	c.pendingEdgeDis = nil
	return normalized
}
