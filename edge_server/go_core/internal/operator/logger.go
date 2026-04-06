package operator

import (
	"encoding/json"
	"io"
	"os"
	"strings"
	"sync"
	"time"
)

type LogLevel string

const (
	LogLevelDebug LogLevel = "debug"
	LogLevelInfo  LogLevel = "info"
	LogLevelWarn  LogLevel = "warn"
	LogLevelError LogLevel = "error"
)

type SessionEpochProvider interface {
	Current() uint64
}

type JSONLoggerConfig struct {
	Writer        io.Writer
	MinLevel      LogLevel
	EpochProvider SessionEpochProvider
	Now           func() time.Time
}

type JSONLogger struct {
	writer        io.Writer
	minLevel      LogLevel
	epochProvider SessionEpochProvider
	now           func() time.Time
	mu            sync.Mutex
}

const redactedSecretValue = "[REDACTED]"

func NewJSONLogger(cfg JSONLoggerConfig) *JSONLogger {
	writer := cfg.Writer
	if writer == nil {
		writer = os.Stdout
	}

	level := cfg.MinLevel
	if level == "" {
		level = LogLevelInfo
	}

	nowFn := cfg.Now
	if nowFn == nil {
		nowFn = func() time.Time {
			return time.Now().UTC()
		}
	}

	return &JSONLogger{
		writer:        writer,
		minLevel:      level,
		epochProvider: cfg.EpochProvider,
		now:           nowFn,
	}
}

func (l *JSONLogger) Log(level LogLevel, message string, fields map[string]any) {
	if !shouldLog(level, l.minLevel) {
		return
	}

	entry := map[string]any{
		"ts":      l.now().UTC().Format(time.RFC3339Nano),
		"level":   string(level),
		"message": message,
	}
	if l.epochProvider != nil {
		entry["sessionEpoch"] = l.epochProvider.Current()
	}
	for key, value := range sanitizeFields(fields) {
		entry[key] = value
	}

	payload, err := json.Marshal(entry)
	if err != nil {
		return
	}
	payload = append(payload, '\n')

	l.mu.Lock()
	defer l.mu.Unlock()
	_, _ = l.writer.Write(payload)
}

func sanitizeFields(fields map[string]any) map[string]any {
	if len(fields) == 0 {
		return nil
	}

	sanitized := make(map[string]any, len(fields))
	for key, value := range fields {
		if isSensitiveField(key) {
			sanitized[key] = redactedSecretValue
			continue
		}
		sanitized[key] = value
	}

	return sanitized
}

func isSensitiveField(key string) bool {
	normalized := strings.ToLower(strings.TrimSpace(key))
	if normalized == "" {
		return false
	}

	if normalized == "credentialsecret" ||
		normalized == "persistentcredentialsecret" ||
		normalized == "onboardingsecret" {
		return true
	}

	return strings.Contains(normalized, "secret")
}

func shouldLog(level LogLevel, minLevel LogLevel) bool {
	return levelRank(level) >= levelRank(minLevel)
}

func levelRank(level LogLevel) int {
	switch level {
	case LogLevelDebug:
		return 10
	case LogLevelInfo:
		return 20
	case LogLevelWarn:
		return 30
	case LogLevelError:
		return 40
	default:
		return 20
	}
}
