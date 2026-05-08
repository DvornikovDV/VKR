package runtime

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"edge_server/go_core/internal/source"
)

type ReadingDispatcher struct {
	input     <-chan source.Reading
	mu        sync.RWMutex
	consumers map[string]chan source.Reading
	closed    bool
}

func NewReadingDispatcher(input <-chan source.Reading) (*ReadingDispatcher, error) {
	if input == nil {
		return nil, fmt.Errorf("reading dispatcher input channel is required")
	}

	return &ReadingDispatcher{
		input:     input,
		consumers: make(map[string]chan source.Reading),
	}, nil
}

func (d *ReadingDispatcher) AddConsumer(name string, buffer int) (<-chan source.Reading, error) {
	if d == nil {
		return nil, fmt.Errorf("reading dispatcher is required")
	}
	consumerName := strings.TrimSpace(name)
	if consumerName == "" {
		return nil, fmt.Errorf("reading dispatcher consumer name is required")
	}
	if buffer < 0 {
		return nil, fmt.Errorf("reading dispatcher consumer buffer must be zero or positive")
	}

	d.mu.Lock()
	defer d.mu.Unlock()

	if d.closed {
		return nil, fmt.Errorf("reading dispatcher is closed")
	}
	if _, exists := d.consumers[consumerName]; exists {
		return nil, fmt.Errorf("reading dispatcher consumer %q is already registered", consumerName)
	}

	consumer := make(chan source.Reading, buffer)
	d.consumers[consumerName] = consumer
	return consumer, nil
}

func (d *ReadingDispatcher) Run(ctx context.Context) {
	if d == nil || ctx == nil {
		return
	}
	defer d.closeConsumers()

	for {
		select {
		case <-ctx.Done():
			return
		case reading, ok := <-d.input:
			if !ok {
				return
			}
			if !d.dispatch(ctx, reading) {
				return
			}
		}
	}
}

func (d *ReadingDispatcher) dispatch(ctx context.Context, reading source.Reading) bool {
	consumers := d.consumerSnapshot()
	for _, consumer := range consumers {
		select {
		case <-ctx.Done():
			return false
		case consumer <- reading:
		}
	}
	return true
}

func (d *ReadingDispatcher) consumerSnapshot() []chan source.Reading {
	d.mu.RLock()
	defer d.mu.RUnlock()

	consumers := make([]chan source.Reading, 0, len(d.consumers))
	for _, consumer := range d.consumers {
		consumers = append(consumers, consumer)
	}
	return consumers
}

func (d *ReadingDispatcher) closeConsumers() {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.closed {
		return
	}
	d.closed = true
	for _, consumer := range d.consumers {
		close(consumer)
	}
}
