package mockreplay

import (
	"encoding/json"
	"fmt"
	"os"
	"time"
)

// CapturedEvent mirrors the capture format used in capture/main.go.
type CapturedEvent struct {
	Timestamp string          `json:"timestamp"`
	RawData   json.RawMessage `json:"rawData"`
}

// CaptureSession is the full capture payload.
type CaptureSession struct {
	StartTime  string          `json:"startTime"`
	EndTime    string          `json:"endTime,omitempty"`
	EventCount int             `json:"eventCount"`
	Events     []CapturedEvent `json:"events"`
}

// Step is a replay-ready unit derived from a captured event.
type Step struct {
	Index     int
	Timestamp time.Time
	Raw       json.RawMessage
	EventType string
	Summary   string
}

// LoadCapture parses a capture file into a CaptureSession.
func LoadCapture(path string) (*CaptureSession, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read capture: %w", err)
	}

	var session CaptureSession
	if err := json.Unmarshal(data, &session); err != nil {
		return nil, fmt.Errorf("parse capture: %w", err)
	}

	return &session, nil
}

// BuildSteps converts capture events to replay steps.
func BuildSteps(session *CaptureSession) ([]Step, error) {
	steps := make([]Step, 0, len(session.Events))

	for idx, ev := range session.Events {
		ts := parseTime(ev.Timestamp)
		eventType, summary := summarize(ev.RawData)

		steps = append(steps, Step{
			Index:     idx,
			Timestamp: ts,
			Raw:       ev.RawData,
			EventType: eventType,
			Summary:   summary,
		})
	}

	return steps, nil
}

func parseTime(raw string) time.Time {
	t, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		return time.Time{}
	}
	return t
}

// summarize extracts a lightweight description for REPL printing.
func summarize(raw json.RawMessage) (string, string) {
	var arr []json.RawMessage
	if err := json.Unmarshal(raw, &arr); err == nil && len(arr) >= 3 {
		var name string
		_ = json.Unmarshal(arr[1], &name)

		var eventData map[string]any
		_ = json.Unmarshal(arr[2], &eventData)

		eventType := stringFromMap(eventData, "eventType")
		if eventType == "" {
			eventType = stringFromMap(eventData, "type")
		}
		phase := ""
		if data, ok := eventData["data"].(map[string]any); ok {
			if timer, ok := data["timer"].(map[string]any); ok {
				phase = stringFromMap(timer, "phase")
			}
		}

		summary := name
		if eventType != "" {
			summary += " | " + eventType
		}
		if phase != "" {
			summary += " | phase=" + phase
		}
		if summary == "" {
			summary = "event"
		}

		return eventType, summary
	}

	// Handle map-shaped payloads (e.g., Delete marker appended by capturer).
	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err == nil {
		eventType := stringFromMap(obj, "eventType")
		if eventType == "" {
			eventType = stringFromMap(obj, "type")
		}

		summary := eventType
		if summary == "" {
			summary = "event"
		}

		return eventType, summary
	}

	// Fallback for unexpected shapes.
	return "unknown", "event"
}

func stringFromMap(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}
