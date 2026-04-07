package runtime

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"edge_server/go_core/internal/cloud"
)

type Runner struct {
	state             *RuntimeState
	mu                sync.RWMutex
	bootstrap         *BootstrapSession
	transport         cloud.Transport
	authRetryInterval time.Duration
}

func New() *Runner {
	return &Runner{
		state:             NewRuntimeState(),
		transport:         newInProcessTransport(),
		authRetryInterval: 100 * time.Millisecond,
	}
}

func (r *Runner) StateSnapshot() SessionStateSnapshot {
	return r.state.Snapshot()
}

func (r *Runner) ActivateTrustedSession(edgeID string, persistentSecret string) error {
	return r.state.ActivateTrustedSession(edgeID, persistentSecret)
}

func (r *Runner) MarkDisconnected(reason string) {
	r.state.MarkDisconnected(reason)
}

func (r *Runner) MarkUntrusted(reason string, clearCredential bool) {
	r.state.MarkUntrusted(reason, clearCredential)
}

func (r *Runner) TelemetryAllowed() bool {
	return r.state.TelemetryAllowed()
}

func (r *Runner) SetCloudTransport(transport cloud.Transport) {
	if r == nil || transport == nil {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	r.transport = transport
}

func (r *Runner) attachBootstrapSession(session *BootstrapSession) {
	if r == nil {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	r.bootstrap = session
}

func (r *Runner) currentBootstrapSession() *BootstrapSession {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return r.bootstrap
}

func (r *Runner) currentTransport() cloud.Transport {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if r.transport == nil {
		return newInProcessTransport()
	}
	return r.transport
}

func (r *Runner) Run(ctx context.Context) error {
	if ctx == nil {
		return errors.New("runtime context is required")
	}

	bootstrap := r.currentBootstrapSession()
	if bootstrap == nil {
		<-ctx.Done()
		return nil
	}

	transport := r.currentTransport()
	reconnectRequested := make(chan struct{}, 1)

	var (
		client       *cloud.SocketIOClient
		expectedEdge string
	)

	for {
		select {
		case <-ctx.Done():
			if client != nil {
				_ = client.Disconnect()
			}
			return nil
		default:
		}

		auth, err := bootstrap.BuildHandshakeAuth()
		if err != nil {
			if errors.Is(err, ErrAuthPathUnavailable) {
				if err := waitForRetry(ctx, r.authRetryInterval); err != nil {
					if client != nil {
						_ = client.Disconnect()
					}
					return nil
				}
				continue
			}

			return fmt.Errorf("build runtime handshake auth: %w", err)
		}

		if client == nil || expectedEdge != auth.EdgeID {
			client, err = cloud.NewSocketIOClient(cloud.SocketIOClientConfig{
				ExpectedEdgeID: auth.EdgeID,
				Transport:      transport,
			})
			if err != nil {
				return fmt.Errorf("create cloud socket client: %w", err)
			}
			expectedEdge = auth.EdgeID

			if err := client.RegisterLifecycleHandlers(cloud.LifecycleHandlers{
				OnActivation: func(event cloud.EdgeActivation) {
					if err := bootstrap.HandleEdgeActivation(event); err != nil {
						r.MarkUntrusted("activation_rejected", true)
						signalReconnect(reconnectRequested)
					}
				},
				OnDisconnect: func(event cloud.EdgeDisconnect) {
					reason := string(event.Reason)

					if event.RequiresCredentialReset() {
						r.MarkUntrusted(reason, true)
					} else {
						r.MarkDisconnected(reason)
					}

					if event.AllowsReconnectAttempt() {
						signalReconnect(reconnectRequested)
					}
				},
				OnConnectError: func(code cloud.ConnectErrorCode) {
					r.MarkUntrusted(string(code), true)
					signalReconnect(reconnectRequested)
				},
				OnProtocolError: func(protocolErr cloud.ProtocolError) {
					r.MarkUntrusted(protocolErr.Event, true)
					signalReconnect(reconnectRequested)
				},
			}); err != nil {
				return fmt.Errorf("register lifecycle handlers: %w", err)
			}
		}

		drainSignal(reconnectRequested)
		if err := client.Connect(ctx, auth); err != nil {
			r.MarkUntrusted(string(cloud.NormalizeConnectError(err)), true)
			if err := waitForRetry(ctx, r.authRetryInterval); err != nil {
				_ = client.Disconnect()
				return nil
			}
			continue
		}

		select {
		case <-ctx.Done():
			_ = client.Disconnect()
			return nil
		case <-reconnectRequested:
		}
	}
}

func waitForRetry(ctx context.Context, retryInterval time.Duration) error {
	if retryInterval <= 0 {
		retryInterval = 100 * time.Millisecond
	}

	timer := time.NewTimer(retryInterval)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func signalReconnect(ch chan struct{}) {
	select {
	case ch <- struct{}{}:
	default:
	}
}

func drainSignal(ch chan struct{}) {
	for {
		select {
		case <-ch:
		default:
			return
		}
	}
}

type inProcessTransport struct {
	mu               sync.RWMutex
	onEdgeActivation func(any)
	onEdgeDisconnect func(any)
	onConnect        func() error
	onConnectError   func(error)
	onDisconnect     func(string)
}

func newInProcessTransport() *inProcessTransport {
	return &inProcessTransport{}
}

func (t *inProcessTransport) Connect(_ context.Context, _ cloud.HandshakeAuth) error {
	t.mu.RLock()
	handler := t.onConnect
	t.mu.RUnlock()

	if handler != nil {
		return handler()
	}

	return nil
}

func (t *inProcessTransport) Disconnect() error {
	t.mu.RLock()
	handler := t.onDisconnect
	t.mu.RUnlock()

	if handler != nil {
		handler("client_requested")
	}

	return nil
}

func (t *inProcessTransport) Emit(_ string, _ any) error {
	return nil
}

func (t *inProcessTransport) OnEdgeActivation(handler func(any)) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.onEdgeActivation = handler
}

func (t *inProcessTransport) OnEdgeDisconnect(handler func(any)) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.onEdgeDisconnect = handler
}

func (t *inProcessTransport) OnConnect(handler func() error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.onConnect = handler
}

func (t *inProcessTransport) OnConnectError(handler func(error)) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.onConnectError = handler
}

func (t *inProcessTransport) OnDisconnect(handler func(string)) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.onDisconnect = handler
}
