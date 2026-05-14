package configurator

import "edge_server/go_core/internal/config"

type ValidationService struct{}

func (ValidationService) Validate(rawYAML string) ValidationResponse {
	if _, err := config.Parse([]byte(rawYAML)); err != nil {
		return ValidationResponse{
			Valid: false,
			Error: err.Error(),
		}
	}

	return ValidationResponse{Valid: true}
}
