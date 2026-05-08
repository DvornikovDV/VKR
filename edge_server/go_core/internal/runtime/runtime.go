package runtime

import (
	"context"
	"edge_server/go_core/internal/state"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"edge_server/go_core/internal/cloud"
	"edge_server/go_core/internal/source"
)

type runtimeStateSaver interface {
	Save(state.RuntimeState) error
}

type Runner struct {
	state       *RuntimeState
	mu          sync.RWMutex
	persistMu   sync.Mutex
	bootstrap   *BootstrapSession
	transport   cloud.Transport
	telemetry   *TelemetryPipeline
	alarm       *AlarmDetector
	bridge      *CommandBridge
	catalog     *cloud.EdgeCapabilitiesCatalog
	stateStore  runtimeStateSaver
	asyncErrors chan error
}

func New() *Runner {
	return &Runner{
		state:       NewRuntimeState(),
		asyncErrors: make(chan error, 1),
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
			"runtime has no valid current auth path after %s; install current credential.json",
			strings.TrimSpace(*lastReason),
		)
	}

	return fmt.Errorf("runtime has no valid current auth path; install current credential.json")
}

func (r *Runner) StateSnapshot() SessionStateSnapshot {
	return r.state.Snapshot()
}

func (r *Runner) ActivateTrustedSession(edgeID string, persistentSecret string) error {
	if err := r.state.ActivateTrustedSession(edgeID, persistentSecret); err != nil {
		return err
	}
	if err := r.persistRuntimeState(); err != nil {
		return fmt.Errorf("persist runtime state after trusted activation: %w", err)
	}

	if telemetry := r.currentTelemetryPipeline(); telemetry != nil {
		telemetry.Reset()
	}

	return nil
}

func (r *Runner) LoadPersistentCredential(edgeID string, version int, persistentSecret string) error {
	if err := r.state.LoadPersistentCredential(edgeID, version, persistentSecret); err != nil {
		return err
	}

	return nil
}

func (r *Runner) ConfigureRuntimeState(edgeID string, sourceConfigRevision string) error {
	if err := r.state.SetSourceSnapshot(edgeID, sourceConfigRevision); err != nil {
		return err
	}

	if err := r.persistRuntimeState(); err != nil {
		return fmt.Errorf("persist runtime state after source snapshot update: %w", err)
	}

	return nil
}

func (r *Runner) MarkConnectAttempt(edgeID string) error {
	if err := r.state.MarkConnectAttempt(edgeID); err != nil {
		return err
	}

	if err := r.persistRuntimeState(); err != nil {
		return fmt.Errorf("persist runtime state after connect attempt: %w", err)
	}

	return nil
}

func (r *Runner) MarkDisconnected(reason string) error {
	r.state.MarkDisconnected(reason)
	if err := r.persistRuntimeState(); err != nil {
		return fmt.Errorf("persist runtime state after disconnect: %w", err)
	}
	if telemetry := r.currentTelemetryPipeline(); telemetry != nil {
		telemetry.Reset()
	}

	return nil
}

func (r *Runner) MarkUntrusted(reason string, clearCredential bool) error {
	r.state.MarkUntrusted(reason, clearCredential)
	if err := r.persistRuntimeState(); err != nil {
		return fmt.Errorf("persist runtime state after trust loss: %w", err)
	}
	if telemetry := r.currentTelemetryPipeline(); telemetry != nil {
		telemetry.Reset()
	}

	return nil
}

func (r *Runner) TelemetryAllowed() bool {
	return r.state.TelemetryAllowed()
}

func (r *Runner) BindRuntimeStateStore(store runtimeStateSaver) error {
	if store == nil {
		return errors.New("runtime state store is required")
	}

	r.mu.Lock()
	r.stateStore = store
	r.mu.Unlock()

	return nil
}

func (r *Runner) RecordTelemetrySent(at time.Time) error {
	r.state.RecordTelemetrySent(at)

	if err := r.persistRuntimeState(); err != nil {
		return fmt.Errorf("persist runtime state after telemetry emit: %w", err)
	}

	return nil
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

func (r *Runner) CurrentAlarmDetector() *AlarmDetector {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return r.alarm
}

func (r *Runner) BindCapabilitiesCatalog(catalog cloud.EdgeCapabilitiesCatalog) error {
	if strings.TrimSpace(catalog.EdgeServerID) == "" {
		return errors.New("capabilities catalog edgeServerId is required")
	}

	cloned := cloneCapabilitiesCatalog(catalog)

	r.mu.Lock()
	defer r.mu.Unlock()

	r.catalog = &cloned
	return nil
}

func (r *Runner) currentCapabilitiesCatalog() (cloud.EdgeCapabilitiesCatalog, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if r.catalog == nil {
		return cloud.EdgeCapabilitiesCatalog{}, false
	}

	return cloneCapabilitiesCatalog(*r.catalog), true
}

func (r *Runner) currentRuntimeStateStore() runtimeStateSaver {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return r.stateStore
}

func (r *Runner) BindCommandBridge(bridge *CommandBridge) error {
	if bridge == nil {
		return errors.New("command bridge is required")
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if r.bridge != nil {
		return errors.New("runtime command bridge is already bound")
	}

	r.bridge = bridge
	return nil
}

func (r *Runner) CurrentCommandBridge() *CommandBridge {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return r.bridge
}

func (r *Runner) persistRuntimeState() error {
	r.persistMu.Lock()
	defer r.persistMu.Unlock()

	store := r.currentRuntimeStateStore()
	if store == nil {
		return nil
	}

	return store.Save(r.state.PersistenceSnapshot())
}

func (r *Runner) reportAsyncError(err error) {
	if err == nil || r == nil || r.asyncErrors == nil {
		return
	}

	select {
	case r.asyncErrors <- err:
	default:
	}
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
		OnEmitSuccess: r.RecordTelemetrySent,
		OnAsyncError:  r.reportAsyncError,
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

type alarmTransportEmitter struct {
	transport cloud.Transport
}

func (e alarmTransportEmitter) EmitAlarmEvent(payload cloud.AlarmPayload) error {
	if e.transport == nil {
		return ErrCloudTransportUnavailable
	}

	return e.transport.Emit(string(cloud.EdgeEventAlarmEvent), payload)
}

func (r *Runner) BindAlarmReadings(
	ctx context.Context,
	readings <-chan source.Reading,
	cfg AlarmDetectorConfig,
) (*AlarmDetector, error) {
	if ctx == nil {
		return nil, errors.New("alarm detector context is required")
	}
	if readings == nil {
		return nil, errors.New("alarm detector readings channel is required")
	}

	if cfg.Emitter == nil {
		transport, err := r.currentTransport()
		if err != nil {
			return nil, err
		}
		cfg.Emitter = alarmTransportEmitter{transport: transport}
	}
	cfg.StateSnapshot = r.StateSnapshot
	cfg.OnAsyncError = r.reportAsyncError
	cfg.Context = ctx

	detector, err := NewAlarmDetector(cfg)
	if err != nil {
		return nil, fmt.Errorf("create alarm detector: %w", err)
	}

	r.mu.Lock()
	if r.alarm != nil {
		r.mu.Unlock()
		return nil, errors.New("runtime alarm detector path is already bound")
	}
	r.alarm = detector
	r.mu.Unlock()

	go r.runAlarmReadings(ctx, readings, detector)

	return detector, nil
}

func (r *Runner) runAlarmReadings(ctx context.Context, readings <-chan source.Reading, detector *AlarmDetector) {
	for {
		select {
		case <-ctx.Done():
			return
		case reading, ok := <-readings:
			if !ok {
				return
			}
			if err := detector.Observe(reading); err != nil {
				r.reportAsyncError(fmt.Errorf("observe alarm reading: %w", err))
			}
		}
	}
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
		case err := <-r.asyncErrors:
			if client != nil {
				_ = client.Disconnect()
			}
			return err
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
				snapshot := r.state.Snapshot()
				return NewMissingAuthPathError(snapshot.LastReason)
			}

			return fmt.Errorf("build runtime handshake auth: %w", err)
		}

		if err := r.MarkConnectAttempt(auth.EdgeID); err != nil {
			return fmt.Errorf("record runtime connect attempt: %w", err)
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
				OnDisconnect: func(event cloud.EdgeDisconnect) {
					if sessionFlow.HandleDisconnect(event) {
						signalLifecycleEvent(lifecycleEvents, "disconnect")
					}
				},
				OnConnectError: func(code cloud.ConnectErrorCode) {
					sessionFlow.HandleConnectError(code)
				},
				OnProtocolError: func(protocolErr cloud.ProtocolError) {
					if err := r.MarkUntrusted(protocolErr.Event, true); err != nil {
						r.reportAsyncError(fmt.Errorf("persist runtime state after protocol error: %w", err))
					}
					signalLifecycleEvent(lifecycleEvents, "protocol_error")
				},
			}); err != nil {
				return fmt.Errorf("register lifecycle handlers: %w", err)
			}

			if bridge := r.CurrentCommandBridge(); bridge != nil {
				currentClient := client
				client.OnExecuteCommand(func(payload any) {
					bridge.HandleExecuteCommand(ctx, payload, currentClient)
				})
			}
		}

		if err := client.Connect(ctx, auth); err != nil {
			var connectErr cloud.ConnectError
			if errors.As(err, &connectErr) {
				return fmt.Errorf("cloud rejected runtime handshake: %w", connectErr)
			}

			return fmt.Errorf("connect runtime to cloud transport: %w", err)
		}
		if err := sessionFlow.HandleSuccessfulConnect(auth); err != nil {
			return fmt.Errorf("promote runtime session after connect: %w", err)
		}
		if err := r.emitCapabilitiesCatalog(client, auth.EdgeID); err != nil {
			return fmt.Errorf("emit capabilities catalog after connect: %w", err)
		}

		for {
			select {
			case err := <-r.asyncErrors:
				_ = client.Disconnect()
				return err
			case <-ctx.Done():
				_ = client.Disconnect()
				return nil
			case <-lifecycleEvents:
				_ = client.Disconnect()
				goto nextAttempt
			}
		}

	nextAttempt:
	}
}

func (r *Runner) emitCapabilitiesCatalog(client *cloud.SocketIOClient, edgeID string) error {
	catalog, ok := r.currentCapabilitiesCatalog()
	if !ok {
		return nil
	}
	if catalog.EdgeServerID != strings.TrimSpace(edgeID) {
		return fmt.Errorf("capabilities catalog edgeServerId %q does not match connected edgeId %q", catalog.EdgeServerID, edgeID)
	}

	return client.EmitCapabilitiesCatalog(catalog)
}

func cloneCapabilitiesCatalog(catalog cloud.EdgeCapabilitiesCatalog) cloud.EdgeCapabilitiesCatalog {
	cloned := cloud.EdgeCapabilitiesCatalog{
		EdgeServerID: strings.TrimSpace(catalog.EdgeServerID),
		Telemetry:    make([]cloud.EdgeCatalogTelemetryMetric, len(catalog.Telemetry)),
		Commands:     make([]cloud.EdgeCatalogCommandCapability, len(catalog.Commands)),
	}
	copy(cloned.Telemetry, catalog.Telemetry)
	copy(cloned.Commands, catalog.Commands)
	return cloned
}

func signalLifecycleEvent(ch chan string, event string) {
	select {
	case ch <- event:
	default:
	}
}
