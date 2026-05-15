package credentialinstall

import (
	"fmt"
	"path/filepath"
	"strings"

	"edge_server/go_core/internal/config"
	"edge_server/go_core/internal/state"
)

func LoadLocalInstallContext(configPath string) (LocalInstallContext, error) {
	return LoadLocalInstallContextWithOptions(configPath, LocalInstallContextOptions{})
}

func LoadLocalInstallContextWithOptions(configPath string, options LocalInstallContextOptions) (LocalInstallContext, error) {
	cfg, err := config.LoadFromFile(configPath)
	if err != nil {
		return LocalInstallContext{}, err
	}

	stateDir := strings.TrimSpace(cfg.Runtime.StateDir)
	if err := state.EnsureRuntimePersistenceBoundariesWithRepair(stateDir, options.PermissionRepair); err != nil {
		return LocalInstallContext{}, err
	}

	context := LocalInstallContext{
		EdgeID:                     strings.TrimSpace(cfg.Runtime.EdgeID),
		StateDir:                   stateDir,
		ExistingCredentialFilePath: filepath.Join(stateDir, "credential.json"),
	}

	credential, credentialExists, err := state.NewCredentialStore(stateDir).Load()
	if err != nil {
		return LocalInstallContext{}, fmt.Errorf("load existing credential.json: %w", err)
	}
	if credentialExists {
		context.ExistingCredential = &credential
	}

	runtimeState, runtimeStateExists, err := state.NewRuntimeStateStore(stateDir).Load()
	if err != nil {
		return LocalInstallContext{}, fmt.Errorf("load existing runtime-state.json: %w", err)
	}
	if runtimeStateExists {
		context.ExistingRuntimeState = &runtimeState
	}

	return context, nil
}
