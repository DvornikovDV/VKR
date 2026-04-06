package main

import (
	"context"
	"log"

	"edge_server/go_core/internal/runtime"
)

func main() {
	runner := runtime.New()
	if err := runner.Run(context.Background()); err != nil {
		log.Fatalf("edge runtime failed: %v", err)
	}
}
