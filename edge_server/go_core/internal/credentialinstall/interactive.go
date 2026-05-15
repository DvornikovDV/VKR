package credentialinstall

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

func InstallInteractively(configPath string, input io.Reader, output io.Writer, now time.Time) (InstallResult, bool, error) {
	if input == nil {
		return InstallResult{}, false, errors.New("stdin is required for interactive install")
	}
	if output == nil {
		return InstallResult{}, false, errors.New("stdout is required for interactive install")
	}

	context, err := LoadLocalInstallContext(configPath)
	if err != nil {
		return InstallResult{}, false, err
	}
	if now.IsZero() {
		now = time.Now().UTC()
	} else {
		now = now.UTC()
	}

	source := DeriveInstallSource(context)
	reader := bufio.NewReader(input)
	fmt.Fprintf(output, "interactive credential install: edgeId=%s source=%s path=%s\n", context.EdgeID, source, context.ExistingCredentialFilePath)

	secret, err := readInteractiveLine(reader, output, "credentialSecret: ")
	if err != nil {
		return InstallResult{}, false, err
	}
	if strings.TrimSpace(secret) == "" {
		return InstallResult{}, false, errors.New("credential disclosure credentialSecret is required")
	}

	versionValue, err := readInteractiveLine(reader, output, "version: ")
	if err != nil {
		return InstallResult{}, false, err
	}
	version, err := strconv.Atoi(strings.TrimSpace(versionValue))
	if err != nil {
		return InstallResult{}, false, fmt.Errorf("credential disclosure version must be an integer: %w", err)
	}
	if version <= 0 {
		return InstallResult{}, false, errors.New("credential disclosure version must be positive")
	}

	issuedAtValue, err := readInteractiveLine(reader, output, fmt.Sprintf("issuedAt RFC3339 [%s]: ", now.Format(time.RFC3339)))
	if err != nil {
		return InstallResult{}, false, err
	}
	issuedAt := now
	if strings.TrimSpace(issuedAtValue) != "" {
		issuedAt, err = parseIssuedAt(issuedAtValue)
		if err != nil {
			return InstallResult{}, false, err
		}
	}

	confirm, err := readInteractiveLine(reader, output, "write credential.json? [y/N]: ")
	if err != nil {
		return InstallResult{}, false, err
	}
	if !isInteractiveConfirmationAccepted(confirm) {
		return InstallResult{}, false, nil
	}

	result, err := InstallCredentialInput(context, NormalizedCredentialInput{
		EdgeID:           context.EdgeID,
		CredentialSecret: secret,
		Version:          version,
		IssuedAt:         issuedAt,
	}, now)
	if err != nil {
		return InstallResult{}, false, err
	}

	return result, true, nil
}

func readInteractiveLine(reader *bufio.Reader, output io.Writer, prompt string) (string, error) {
	fmt.Fprint(output, prompt)
	value, err := reader.ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return "", fmt.Errorf("read interactive input: %w", err)
	}
	value = strings.TrimRight(value, "\r\n")
	if err != nil && errors.Is(err, io.EOF) && value == "" {
		return "", io.ErrUnexpectedEOF
	}
	return value, nil
}

func isInteractiveConfirmationAccepted(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "y", "yes":
		return true
	default:
		return false
	}
}
