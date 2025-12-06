package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/coder/websocket"
	"github.com/fsnotify/fsnotify"
	"github.com/shirou/gopsutil/v3/process"
)

// Types from connector.go
type ConnectionInfo struct {
	Protocol string
	Address  string
	Port     string
	Username string
	Password string
}

type LCUConnector struct {
	dirPath            string
	lockfileWatcher    *fsnotify.Watcher
	processTicker      *time.Ticker
	stopCh             chan struct{}
	mu                 sync.Mutex
	OnConnect          chan ConnectionInfo
	OnDisconnect       chan struct{}
	OnChampSelect      chan interface{} // Raw JSON data
	OnChampSelectEnded chan struct{}
	wsConn             *websocket.Conn
	wsContext          context.Context
	wsCancel           context.CancelFunc
}

// CapturedEvent represents a single captured event with timestamp and raw data
type CapturedEvent struct {
	Timestamp string      `json:"timestamp"`
	RawData   interface{} `json:"rawData"` // Raw JSON data from WebSocket
}

// CaptureSession represents a complete capture session
type CaptureSession struct {
	StartTime  string          `json:"startTime"`
	EndTime    string          `json:"endTime,omitempty"`
	EventCount int             `json:"eventCount"`
	Events     []CapturedEvent `json:"events"`
}

type ChampSelectCapturer struct {
	connector     *LCUConnector
	session       *CaptureSession
	outputFile    string
	file          *os.File
	encoder       *json.Encoder
	isCapturing   bool
	mu            sync.Mutex
	done          chan struct{}
	shouldExit    bool
	doneOnce      sync.Once
	eventCountPos int64 // Position in file where eventCount is written
}

func NewCapturer(outputFile string) *ChampSelectCapturer {
	if outputFile == "" {
		timestamp := time.Now().Format("20060102_150405")
		outputFile = fmt.Sprintf("champ-select-capture_%s.json", timestamp)
	}

	return &ChampSelectCapturer{
		connector:  NewLCUConnector(""),
		outputFile: outputFile,
		done:       make(chan struct{}),
		session: &CaptureSession{
			StartTime:  time.Now().Format(time.RFC3339),
			EventCount: 0,
			Events:     make([]CapturedEvent, 0),
		},
	}
}

func (c *ChampSelectCapturer) Start() error {
	fmt.Println("Starting champion select capture...")
	fmt.Printf("Output file: %s\n", c.outputFile)
	fmt.Println("Waiting for LCU connection and champion select...")
	fmt.Println("Press Ctrl+C to stop capturing")

	// Start the connector
	c.connector.Start()

	// Set up signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// Handle LCU connection events
	go func() {
		for {
			select {
			case <-c.done:
				return
			case info := <-c.connector.OnConnect:
				fmt.Printf("✓ Connected to LCU at %s:%s\n", info.Address, info.Port)
			case <-c.connector.OnDisconnect:
				fmt.Println("✗ Disconnected from LCU")
				if c.isCapturing {
					c.endSession()
				}
			}
		}
	}()

	// Handle champion select events
	go func() {
		for {
			select {
			case <-c.done:
				return
			case rawData := <-c.connector.OnChampSelect:
				c.handleChampSelectEvent(rawData)
			case <-c.connector.OnChampSelectEnded:
				if c.isCapturing {
					c.handleChampSelectEnded()
					// Auto-stop after champ select ends
					c.mu.Lock()
					shouldExit := c.shouldExit
					c.mu.Unlock()
					if shouldExit {
						c.signalDone()
						return
					}
				}
			}
		}
	}()

	// Wait for interrupt signal or done channel
	select {
	case <-sigChan:
		fmt.Println("\nStopping capture...")
		c.Stop()
	case <-c.done:
		fmt.Println("\nChampion select ended, stopping capture...")
		c.Stop()
	}

	return nil
}

func (c *ChampSelectCapturer) handleChampSelectEvent(rawData interface{}) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.isCapturing {
		// First event - start capturing and create file
		c.isCapturing = true
		fmt.Printf("\n=== Champion Select Started ===\n")
		fmt.Println("Capturing raw events...")

		// Create output file and write initial JSON structure
		if err := c.initOutputFile(); err != nil {
			fmt.Printf("Error initializing output file: %v\n", err)
			return
		}
	}

	// Capture raw event data
	capturedEvent := CapturedEvent{
		Timestamp: time.Now().Format(time.RFC3339Nano),
		RawData:   rawData,
	}

	c.session.Events = append(c.session.Events, capturedEvent)
	c.session.EventCount = len(c.session.Events)

	// Append event to file immediately
	if c.file != nil {
		if err := c.appendEvent(capturedEvent); err != nil {
			fmt.Printf("Error writing event to file: %v\n", err)
		}
	}

	fmt.Printf("[%s] Event #%d captured\n",
		capturedEvent.Timestamp,
		c.session.EventCount)
}

func (c *ChampSelectCapturer) handleChampSelectEnded() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.isCapturing {
		return
	}

	// Add Delete event marker
	deleteEvent := CapturedEvent{
		Timestamp: time.Now().Format(time.RFC3339Nano),
		RawData: map[string]interface{}{
			"eventType": "Delete",
		},
	}

	c.session.Events = append(c.session.Events, deleteEvent)
	c.session.EventCount = len(c.session.Events)

	// Append Delete event to file
	if c.file != nil {
		if err := c.appendEvent(deleteEvent); err != nil {
			fmt.Printf("Error writing Delete event: %v\n", err)
		}
	}

	fmt.Printf("\n=== Champion Select Ended ===\n")
	fmt.Printf("Total events captured: %d\n", c.session.EventCount)

	c.session.EndTime = time.Now().Format(time.RFC3339)
	c.isCapturing = false
	c.shouldExit = true // Signal to auto-exit
	c.mu.Unlock()

	// Finalize file outside of lock
	c.finalizeFile()
}

func (c *ChampSelectCapturer) initOutputFile() error {
	if c.file != nil {
		return nil // Already initialized
	}

	// Ensure output directory exists
	dir := filepath.Dir(c.outputFile)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("error creating output directory: %v", err)
		}
	}

	// Create file
	file, err := os.Create(c.outputFile)
	if err != nil {
		return fmt.Errorf("error creating output file: %v", err)
	}

	c.file = file
	c.encoder = json.NewEncoder(file)
	c.encoder.SetIndent("", "  ")

	// Write initial JSON structure
	// We'll update eventCount at the end
	_, err = fmt.Fprintf(c.file, "{\n")
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(c.file, "  \"startTime\": %q,\n", c.session.StartTime)
	if err != nil {
		return err
	}

	// Remember position for updating eventCount later
	c.eventCountPos, err = c.file.Seek(0, io.SeekCurrent)
	if err != nil {
		return err
	}

	_, err = fmt.Fprintf(c.file, "  \"eventCount\": 0,\n") // Placeholder, will be updated
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(c.file, "  \"events\": [\n")
	if err != nil {
		return err
	}

	return nil
}

func (c *ChampSelectCapturer) appendEvent(event CapturedEvent) error {
	if c.file == nil {
		return fmt.Errorf("output file not initialized")
	}

	// If not the first event, add comma separator
	if c.session.EventCount > 1 {
		if _, err := fmt.Fprintf(c.file, ",\n"); err != nil {
			return err
		}
	}

	// Write event JSON
	eventJSON, err := json.Marshal(event)
	if err != nil {
		return err
	}

	// Write with proper indentation (2 spaces, then 4 more for nested)
	lines := strings.Split(string(eventJSON), "\n")
	for i, line := range lines {
		if i == 0 {
			if _, err := fmt.Fprintf(c.file, "    %s", line); err != nil {
				return err
			}
		} else {
			if _, err := fmt.Fprintf(c.file, "\n    %s", line); err != nil {
				return err
			}
		}
	}

	// Flush to disk immediately
	return c.file.Sync()
}

func (c *ChampSelectCapturer) updateEventCount() error {
	if c.file == nil || c.eventCountPos == 0 {
		return nil
	}

	// Save current position
	currentPos, err := c.file.Seek(0, io.SeekCurrent)
	if err != nil {
		return err
	}

	// Seek to eventCount position
	if _, err := c.file.Seek(c.eventCountPos, io.SeekStart); err != nil {
		return err
	}

	// Write updated eventCount (overwrite the placeholder)
	countStr := fmt.Sprintf("%d", c.session.EventCount)
	if _, err := c.file.WriteString(countStr); err != nil {
		return err
	}

	// Restore position
	_, err = c.file.Seek(currentPos, io.SeekStart)
	return err
}

func (c *ChampSelectCapturer) endSession() {
	c.mu.Lock()
	if c.session.EndTime == "" {
		c.session.EndTime = time.Now().Format(time.RFC3339)
	}
	c.mu.Unlock()
	c.finalizeFile()
}

func (c *ChampSelectCapturer) finalizeFile() {
	c.mu.Lock()
	file := c.file
	endTime := c.session.EndTime
	eventCount := c.session.EventCount
	c.mu.Unlock()

	if file == nil {
		return
	}

	// Update eventCount
	if err := c.updateEventCount(); err != nil {
		fmt.Printf("Warning: failed to update event count: %v\n", err)
	}

	// Close the events array
	fmt.Fprintf(file, "\n  ],\n")
	if endTime != "" {
		fmt.Fprintf(file, "  \"endTime\": %q\n", endTime)
	}
	fmt.Fprintf(file, "}\n")

	file.Sync()
	file.Close()

	c.mu.Lock()
	c.file = nil
	c.mu.Unlock()

	fmt.Printf("\n✓ Capture saved to: %s\n", c.outputFile)
	fmt.Printf("  Events: %d\n", eventCount)
	if endTime != "" {
		fmt.Printf("  Duration: %s\n", c.getDuration())
	}
}

func (c *ChampSelectCapturer) getDuration() string {
	start, err1 := time.Parse(time.RFC3339, c.session.StartTime)
	end, err2 := time.Parse(time.RFC3339, c.session.EndTime)

	if err1 != nil || err2 != nil {
		return "unknown"
	}

	duration := end.Sub(start)
	return duration.String()
}

func (c *ChampSelectCapturer) signalDone() {
	c.doneOnce.Do(func() {
		close(c.done)
	})
}

func (c *ChampSelectCapturer) Stop() {
	// Mark session as ended if needed
	c.mu.Lock()
	if c.isCapturing && c.session.EndTime == "" {
		c.session.EndTime = time.Now().Format(time.RFC3339)
	}
	c.mu.Unlock()

	// Finalize file (this needs to happen without lock)
	c.finalizeFile()

	// Signal all goroutines to stop
	c.signalDone()

	// Stop connector
	c.connector.Stop()
}

// LCU Connector implementation (copied from connector.go)
func NewLCUConnector(executablePath string) *LCUConnector {
	conn := &LCUConnector{
		OnConnect:          make(chan ConnectionInfo),
		OnDisconnect:       make(chan struct{}),
		OnChampSelect:      make(chan interface{}), // Raw JSON data
		OnChampSelectEnded: make(chan struct{}),
		stopCh:             make(chan struct{}),
	}
	if executablePath != "" {
		conn.dirPath = filepath.Dir(executablePath)
	}
	return conn
}

func (l *LCUConnector) Start() {
	if IsValidLCUPath(l.dirPath) {
		l.initLockfileWatcher()
		return
	}
	l.initProcessWatcher()
}

func (l *LCUConnector) Stop() {
	l.clearWebSocket()
	l.clearLockfileWatcher()
	l.clearProcessWatcher()
	close(l.stopCh)
}

func (l *LCUConnector) initProcessWatcher() {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.processTicker != nil {
		return
	}
	l.processTicker = time.NewTicker(time.Second)
	go func() {
		for {
			select {
			case <-l.processTicker.C:
				path, _ := GetLCUPathFromProcess()
				if path != "" {
					l.dirPath = path
					l.clearProcessWatcher()
					l.initLockfileWatcher()
					return
				}
			case <-l.stopCh:
				return
			}
		}
	}()
}

func (l *LCUConnector) clearProcessWatcher() {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.processTicker != nil {
		l.processTicker.Stop()
		l.processTicker = nil
	}
}

func (l *LCUConnector) initLockfileWatcher() {
	if l.lockfileWatcher != nil {
		return
	}

	lockfilePath := filepath.Join(l.dirPath, "lockfile")
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return
	}
	l.lockfileWatcher = watcher
	go func() {
		defer watcher.Close()
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				if event.Op&fsnotify.Create != 0 || event.Op&fsnotify.Write != 0 {
					l.onFileCreated(lockfilePath)
				} else if event.Op&fsnotify.Remove != 0 {
					l.onFileRemoved()
				}
			case <-l.stopCh:
				return
			}
		}
	}()
	watcher.Add(l.dirPath)

	if _, err := os.Stat(lockfilePath); err == nil {
		l.onFileCreated(lockfilePath)
	}
}

func (l *LCUConnector) clearLockfileWatcher() {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.lockfileWatcher != nil {
		l.lockfileWatcher.Close()
		l.lockfileWatcher = nil
	}
}

func (l *LCUConnector) onFileCreated(lockfilePath string) {
	data, err := os.ReadFile(lockfilePath)
	if err != nil {
		return
	}
	parts := strings.Split(strings.TrimSpace(string(data)), ":")
	if len(parts) < 5 {
		return
	}
	info := ConnectionInfo{
		Protocol: parts[4],
		Address:  "127.0.0.1",
		Port:     parts[2],
		Username: "riot",
		Password: parts[3],
	}

	l.initWebSocket(info)

	select {
	case l.OnConnect <- info:
	default:
	}
}

func (l *LCUConnector) onFileRemoved() {
	l.clearWebSocket()
	select {
	case l.OnDisconnect <- struct{}{}:
	default:
	}
}

func (l *LCUConnector) initWebSocket(info ConnectionInfo) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.wsConn != nil {
		return
	}

	l.wsContext, l.wsCancel = context.WithCancel(context.Background())

	wsURL := fmt.Sprintf("wss://%s:%s@%s:%s/", info.Username, info.Password, info.Address, info.Port)

	dialer := websocket.DialOptions{
		HTTPClient: &http.Client{
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		},
	}

	conn, _, err := websocket.Dial(l.wsContext, wsURL, &dialer)
	if err != nil {
		return
	}

	l.wsConn = conn

	go l.handleWebSocket()
}

func (l *LCUConnector) clearWebSocket() {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.wsCancel != nil {
		l.wsCancel()
		l.wsCancel = nil
	}

	if l.wsConn != nil {
		l.wsConn.Close(websocket.StatusNormalClosure, "disconnecting")
		l.wsConn = nil
	}

	l.wsContext = nil
}

func (l *LCUConnector) handleWebSocket() {
	subMsg := []any{5, "OnJsonApiEvent_lol-champ-select_v1_session"}
	msgBytes, err := json.Marshal(subMsg)
	if err != nil {
		return
	}

	if err := l.wsConn.Write(l.wsContext, websocket.MessageText, msgBytes); err != nil {
		return
	}

	for {
		select {
		case <-l.wsContext.Done():
			return
		default:
			_, data, err := l.wsConn.Read(l.wsContext)
			if err != nil {
				return
			}

			var payload []any
			if err := json.Unmarshal(data, &payload); err != nil || len(payload) < 3 {
				continue
			}

			eventType, ok := payload[1].(string)
			if !ok || eventType != "OnJsonApiEvent_lol-champ-select_v1_session" {
				continue
			}

			// Capture the complete raw WebSocket payload array
			// payload structure: [messageType, eventName, eventData]
			// We capture everything as-is without any type constraints
			rawPayload := payload

			// Check if it's a Delete event to signal end (but still capture it)
			if len(payload) >= 3 {
				if eventData, ok := payload[2].(map[string]interface{}); ok {
					if eventType, ok := eventData["eventType"].(string); ok && eventType == "Delete" {
						select {
						case l.OnChampSelectEnded <- struct{}{}:
						default:
						}
					}
				}
			}

			// Emit the complete raw payload
			select {
			case l.OnChampSelect <- rawPayload:
			default:
			}
		}
	}
}

func GetLCUPathFromProcess() (string, error) {
	processes, err := process.Processes()
	if err != nil {
		return "", err
	}

	var pattern *regexp.Regexp
	if runtime.GOOS == "windows" {
		pattern = regexp.MustCompile(`"--install-directory=(.*?)"`)
	} else {
		pattern = regexp.MustCompile(`--install-directory=(.*?)( --|\n|$)`)
	}

	for _, p := range processes {
		name, _ := p.Name()
		if strings.Contains(strings.ToLower(name), "leagueclientux") {
			cmdline, _ := p.Cmdline()
			matches := pattern.FindStringSubmatch(cmdline)
			if len(matches) >= 2 {
				return normalizePath(matches[1]), nil
			}
		}
	}
	return "", errors.New("LCU not found")
}

func IsValidLCUPath(dir string) bool {
	if dir == "" {
		return false
	}
	var clientFile string
	if runtime.GOOS == "darwin" {
		clientFile = "LeagueClient.app"
	} else {
		clientFile = "LeagueClient.exe"
	}

	common := fileExists(filepath.Join(dir, clientFile)) && dirExists(filepath.Join(dir, "Config"))
	isGlobal := common && dirExists(filepath.Join(dir, "RADS"))
	isCN := common && dirExists(filepath.Join(dir, "TQM"))
	isGarena := common

	return isGlobal || isCN || isGarena
}

func normalizePath(p string) string {
	if runtime.GOOS == "linux" && strings.Contains(strings.ToLower(getOSRelease()), "microsoft") {
		p = strings.ReplaceAll(p, `\`, `/`)
		if len(p) > 1 && p[1] == ':' {
			p = "/mnt/" + strings.ToLower(string(p[0])) + p[2:]
		}
	}
	return p
}

func getOSRelease() string {
	out, _ := exec.Command("uname", "-r").Output()
	return string(bytes.TrimSpace(out))
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func main() {
	var outputFile string
	if len(os.Args) > 1 {
		outputFile = os.Args[1]
	}

	capturer := NewCapturer(outputFile)
	if err := capturer.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
