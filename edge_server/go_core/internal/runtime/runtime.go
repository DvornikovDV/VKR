package runtime

import (
	"context"
	"errors"
)

type Runner struct{}

func New() *Runner {
	return &Runner{}
}

func (r *Runner) Run(ctx context.Context) error {
	if ctx == nil {
		return errors.New("runtime context is required")
	}

	return nil
}
