package runtime

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/source"
)

type Runner struct {
	state     *RuntimeState
	mu        sync.RWMutex
	bootstrap *BootstrapSession
	transport cloud.Transport
	telemetry *TelemetryPipeline
}

func New() *Runner {
	return &Runner{
		state: NewRuntimeState(),
	}
}

func NewWithTransport(transport cloud.Transport) *Runner {
	runner := New()
	runner.transport = transport
	return runner
}

var ErrCloudTransportUnavailable = errors.New("cloud transport is not configured")

func NewMissingAuthPathError(lastReason *string) error {
	if lastReason != nil && strings.TrimSpace(*lastReason) != "" {
		return fmt.Errorf(
			"runtime has no valid current auth path after %s; restart with fresh operator onboarding input",
			strings.TrimSpace(*lastReason),
		)
	}

	return fmt.Errorf("runtime has no valid current auth path; restart with fresh operator onboarding input")
}

func (r *Runner) StateSnapshot() SessionStateSnapshot {
	return r.state.Snapshot()
}

func (r *Runner) ActivateTrustedSession(edgeID string, persistentSecret string) error {
	if err := r.state.ActivateTrustedSession(edgeID, persistentSecret); err != nil {
		return err
	}

	if telemetry := r.currentTelemetryPipeline(); telemetry != nil {
		telemetry.Reset()
	}

	return nil
}

func (r *Runner) MarkDisconnected(reason string) {
	r.state.MarkDisconnected(reason)
	if telemetry := r.currentTelemetryPipeline(); telemetry != nil {
		telemetry.Reset()
	}
}

func (r *Runner) MarkUntrusted(reason string, clearCredential bool) {
	r.state.MarkUntrusted(reason, clearCredential)
	if telemetry := r.currentTelemetryPipeline(); telemetry != nil {
		telemetry.Reset()
	}
}

func (r *Runner) TelemetryAllowed() bool {
	return r.state.TelemetryAllowed()
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

func (r *Runner) currentTransport() (cloud.Transport, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if r.transport == nil {
		return nil, ErrCloudTransportUnavailable
	}
	return r.transport, nil
}

func (r *Runner) currentTelemetryPipeline() *TelemetryPipeline {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return r.telemetry
}

func (r *Runner) BindTelemetryReadings(
	ctx context.Context,
	readings <-chan source.Reading,
	intervalMs int,
	maxReadings int,
) error {
	if ctx == nil {
		return errors.New("telemetry context is required")
	}
	if readings == nil {
		return errors.New("telemetry readings channel is required")
	}

	transport, err := r.currentTransport()
	if err != nil {
		return err
	}

	client, err := cloud.NewTelemetryClient(transport)
	if err != nil {
		return fmt.Errorf("create telemetry client: %w", err)
	}

	pipeline, err := NewTelemetryPipeline(TelemetryPipelineConfig{
		Readings:      readings,
		IntervalMs:    intervalMs,
		MaxReadings:   maxReadings,
		Client:        client,
		StateSnapshot: r.StateSnapshot,
	})
	if err != nil {
		return fmt.Errorf("create telemetry pipeline: %w", err)
	}

	r.mu.Lock()
	if r.telemetry != nil {
		r.mu.Unlock()
		return errors.New("runtime telemetry path is already bound")
	}
	r.telemetry = pipeline
	r.mu.Unlock()

	go pipeline.Run(ctx)

	return nil
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

	transport, err := r.currentTransport()
	if err != nil {
		return err
	}

	var (
		client       *cloud.SocketIOClient
		expectedEdge string
	)
	lifecycleEvents := make(chan string, 8)
	sessionFlow := newTrustSessionFlow(r)

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
				return NewMissingAuthPathError(r.state.Snapshot().LastReason)
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
						signalLifecycleEvent(lifecycleEvents, "activation_rejected")
						return
					}
					signalLifecycleEvent(lifecycleEvents, "activation")
				},
				OnDisconnect: func(event cloud.EdgeDisconnect) {
					if sessionFlow.HandleDisconnect(event) {
						signalLifecycleEvent(lifecycleEvents, "disconnect")
					}
				},
				OnConnectError: func(code cloud.ConnectErrorCode) {
					sessionFlow.HandleConnectError(code)
				},
				OnProtocolError: func(protocolErr cloud.ProtocolError) {
					r.MarkUntrusted(protocolErr.Event, true)
					signalLifecycleEvent(lifecycleEvents, "protocol_error")
				},
			}); err != nil {
				return fmt.Errorf("register lifecycle handlers: %w", err)
			}
		}

		if err := client.Connect(ctx, auth); err != nil {
			var connectErr cloud.ConnectError
			if errors.As(err, &connectErr) {
				continue
			}

			return fmt.Errorf("connect runtime to cloud transport: %w", err)
		}
		if err := sessionFlow.HandleSuccessfulConnect(auth); err != nil {
			return fmt.Errorf("promote runtime session after connect: %w", err)
		}

		for {
			select {
			case <-ctx.Done():
				_ = client.Disconnect()
				return nil
			case event := <-lifecycleEvents:
				if event == "activation" {
					continue
				}
				goto nextAttempt
			}
		}

	nextAttempt:
	}
}

func signalLifecycleEvent(ch chan string, event string) {
	select {
	case ch <- event:
	default:
	}
}
