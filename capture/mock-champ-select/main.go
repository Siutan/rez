package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"

	"rez/internal/mockreplay"
)

type hub struct {
	mu    sync.Mutex
	conns map[*websocket.Conn]struct{}
}

func newHub() *hub {
	return &hub{conns: make(map[*websocket.Conn]struct{})}
}

func (h *hub) add(conn *websocket.Conn) {
	h.mu.Lock()
	h.conns[conn] = struct{}{}
	h.mu.Unlock()
}

func (h *hub) remove(conn *websocket.Conn) {
	h.mu.Lock()
	delete(h.conns, conn)
	h.mu.Unlock()
	conn.Close()
}

func (h *hub) broadcast(payload []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.conns {
		if err := c.WriteMessage(websocket.TextMessage, payload); err != nil {
			log.Printf("ws send failed, dropping client: %v", err)
			c.Close()
			delete(h.conns, c)
		}
	}
}

type state struct {
	steps       []mockreplay.Step
	current     int
	hub         *hub
	capturePath string
	startedAt   string
}

func main() {
	var (
		capturePath string
		addr        string
	)

	flag.StringVar(&capturePath, "capture", "", "path to a champ select capture file")
	flag.StringVar(&addr, "addr", "127.0.0.1:18080", "address for websocket + health server, e.g. 127.0.0.1:18080")
	flag.Parse()

	if capturePath == "" {
		selected, err := chooseCapture()
		if err != nil {
			fmt.Fprintf(os.Stderr, "no capture selected: %v\n", err)
			os.Exit(1)
		}
		capturePath = selected
	}

	session, steps := loadStepsOrExit(capturePath)
	st := &state{
		steps:       steps,
		current:     0,
		hub:         newHub(),
		capturePath: capturePath,
		startedAt:   session.StartTime,
	}

	fmt.Printf("Loaded %d steps from %s (start: %s)\n", len(steps), capturePath, session.StartTime)
	fmt.Printf("Websocket: ws://%s/ws | Health: http://%s/health\n", addr, addr)
	fmt.Println("Commands: next, prev, jump <n>, send <n>, reset, inspect, current, quit, help")

	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("upgrade failed: %v", err)
			return
		}
		st.hub.add(conn)
		log.Printf("client connected (%d total)", len(st.hub.conns))

		// push the current step immediately so new clients see state
		if err := st.sendCurrent(conn); err != nil {
			log.Printf("initial send failed: %v", err)
			st.hub.remove(conn)
			return
		}

		// keep connection alive; read loop just waits for closure
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				break
			}
		}
		st.hub.remove(conn)
		log.Printf("client disconnected (%d total)", len(st.hub.conns))
	})

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		current := st.steps[st.current]
		payload := struct {
			Steps       int    `json:"steps"`
			Current     int    `json:"current"`
			Summary     string `json:"summary"`
			Capture     string `json:"capture"`
			StartedAt   string `json:"started"`
			CurrentSent string `json:"currentStepTimestamp"`
		}{
			Steps:       len(st.steps),
			Current:     st.current,
			Summary:     current.Summary,
			Capture:     st.capturePath,
			StartedAt:   st.startedAt,
			CurrentSent: current.Timestamp.Format(time.RFC3339),
		}
		_ = json.NewEncoder(w).Encode(payload)
	})

	server := &http.Server{
		Addr:              addr,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Graceful shutdown on Ctrl+C
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-stop
		log.Println("Shutting down...")
		server.Close()
		os.Exit(0)
	}()

	runRepl(st)
}

func runRepl(st *state) {
	scanner := bufio.NewScanner(os.Stdin)
	for {
		fmt.Print("> ")
		if !scanner.Scan() {
			break
		}
		line := strings.TrimSpace(scanner.Text())
		switch {
		case line == "", line == "help":
			printHelp()
		case line == "next":
			st.advance(1, true)
		case line == "prev":
			st.advance(-1, true)
		case strings.HasPrefix(line, "jump "):
			st.jump(strings.TrimSpace(strings.TrimPrefix(line, "jump ")), true)
		case strings.HasPrefix(line, "send "):
			st.jump(strings.TrimSpace(strings.TrimPrefix(line, "send ")), true)
		case line == "reset":
			st.setIndex(0, false)
		case line == "inspect" || line == "current":
			st.inspect()
		case line == "quit" || line == "exit":
			return
		default:
			fmt.Println("Unknown command, type 'help'")
		}
	}
}

func printHelp() {
	fmt.Println("Commands:")
	fmt.Println("  next            advance to the next step and broadcast")
	fmt.Println("  prev            go back one step and broadcast")
	fmt.Println("  jump <n>        jump to step n (0-based) and broadcast")
	fmt.Println("  send <n>        alias for jump")
	fmt.Println("  reset           reset index to 0 (no broadcast)")
	fmt.Println("  inspect/current show current step summary")
	fmt.Println("  quit            exit")
}

func (s *state) advance(delta int, broadcast bool) {
	target := s.current + delta
	s.setIndex(target, broadcast)
}

func (s *state) jump(raw string, broadcast bool) {
	idx, err := strconv.Atoi(raw)
	if err != nil {
		fmt.Printf("invalid index %q: %v\n", raw, err)
		return
	}
	s.setIndex(idx, broadcast)
}

func (s *state) setIndex(idx int, broadcast bool) {
	if idx < 0 || idx >= len(s.steps) {
		fmt.Printf("index out of range (0-%d)\n", len(s.steps)-1)
		return
	}
	s.current = idx
	if broadcast {
		s.broadcastCurrent()
	} else {
		s.inspect()
	}
}

func (s *state) broadcastCurrent() {
	step := s.steps[s.current]
	s.hub.broadcast(step.Raw)
	fmt.Printf("sent step %d | %s\n", step.Index, step.Summary)
}

func (s *state) sendCurrent(conn *websocket.Conn) error {
	step := s.steps[s.current]
	return conn.WriteMessage(websocket.TextMessage, step.Raw)
}

func (s *state) inspect() {
	step := s.steps[s.current]
	fmt.Printf("step %d @ %s | %s\n", step.Index, step.Timestamp.Format(time.RFC3339), step.Summary)
}

func loadStepsOrExit(path string) (*mockreplay.CaptureSession, []mockreplay.Step) {
	session, err := mockreplay.LoadCapture(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load capture: %v\n", err)
		os.Exit(1)
	}
	steps, err := mockreplay.BuildSteps(session)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to build steps: %v\n", err)
		os.Exit(1)
	}
	if len(steps) == 0 {
		fmt.Fprintln(os.Stderr, "capture has no steps")
		os.Exit(1)
	}
	return session, steps
}

func chooseCapture() (string, error) {
	paths, err := discoverCaptures()
	if err != nil {
		return "", err
	}

	if len(paths) == 0 {
		return "", fmt.Errorf("no capture files found in capture/*.json or captures/*.json")
	}

	if len(paths) == 1 {
		fmt.Printf("Found capture: %s\n", paths[0])
		return paths[0], nil
	}

	fmt.Println("Select a capture to load:")
	for i, p := range paths {
		fmt.Printf("  [%d] %s\n", i+1, p)
	}
	fmt.Print("Enter number (default 1): ")

	scanner := bufio.NewScanner(os.Stdin)
	if !scanner.Scan() {
		return paths[0], nil
	}
	input := strings.TrimSpace(scanner.Text())
	if input == "" {
		return paths[0], nil
	}

	idx, err := strconv.Atoi(input)
	if err != nil || idx < 1 || idx > len(paths) {
		fmt.Printf("Invalid selection, defaulting to 1\n")
		return paths[0], nil
	}
	return paths[idx-1], nil
}

func discoverCaptures() ([]string, error) {
	patterns := []string{
		filepath.Join("capture", "captures", "*.json"), // repo root execution
		filepath.Join("capture", "*.json"),             // repo root execution (flat files)
		filepath.Join("captures", "*.json"),            // if run from capture/ dir
		filepath.Join(".", "captures", "*.json"),       // if run from capture/mock-champ-select
		filepath.Join(".", "*.json"),                   // fallback: current dir holds captures
	}

	seen := make(map[string]struct{})
	var results []string

	for _, pattern := range patterns {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			return nil, fmt.Errorf("glob %s: %w", pattern, err)
		}
		for _, m := range matches {
			if _, ok := seen[m]; ok {
				continue
			}
			seen[m] = struct{}{}
			results = append(results, m)
		}
	}

	sort.Strings(results)
	return results, nil
}
