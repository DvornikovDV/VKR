package configurator

type ConfigLoadResponse struct {
	YAML   string `json:"yaml"`
	Exists bool   `json:"exists"`
}

type HelperDataResponse struct {
	Helpers HelperData `json:"helpers"`
}

type ValidationRequest struct {
	YAML string `json:"yaml"`
}

type ValidationResponse struct {
	Valid bool   `json:"valid"`
	Error string `json:"error,omitempty"`
}

type SaveRequest struct {
	YAML string `json:"yaml"`
}

type SaveResponse struct {
	Saved      bool               `json:"saved"`
	Validation ValidationResponse `json:"validation"`
}
