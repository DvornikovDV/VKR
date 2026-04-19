package integration

import (
	"context"
	"path/filepath"
	"testing"

	"edge_server/go_core/internal/cloud"
)

func runtimeFixturePath(t *testing.T, name string) string {
	t.Helper()
	return filepath.Join("..", "..", "..", "tests", "fixtures", "runtime", name)
}

func runtimeAuthorityPath(t *testing.T, parts ...string) string {
	t.Helper()
	base := []string{"..", "..", "..", ".."}
	return filepath.Join(append(base, parts...)...)
}

type noopTransport struct{}

func (noopTransport) Connect(context.Context, cloud.HandshakeAuth) error { return nil }
func (noopTransport) Disconnect() error                                  { return nil }
func (noopTransport) Emit(string, any) error                             { return nil }
func (noopTransport) OnEdgeActivation(func(any))                         {}
func (noopTransport) OnEdgeDisconnect(func(any))                         {}
func (noopTransport) OnConnect(func() error)                             {}
func (noopTransport) OnConnectError(func(error))                         {}
func (noopTransport) OnDisconnect(func(string))                          {}
