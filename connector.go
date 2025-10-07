package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/fsnotify/fsnotify"
	"github.com/shirou/gopsutil/v3/process"
)

type ConnectionInfo struct {
	Protocol string
	Address  string
	Port     string
	Username string
	Password string
}

type ChampSelectSession struct {
	Actions [][]struct {
		ActorCellID  int    `json:"actorCellId"`
		ChampionID   int    `json:"championId"`
		Completed    bool   `json:"completed"`
		IsAllyAction bool   `json:"isAllyAction"`
		IsInProgress bool   `json:"isInProgress"`
		Type         string `json:"type"`
		PickTurn     int    `json:"pickTurn"`
		Duration     int    `json:"duration"`
		ID           int    `json:"id"`
	} `json:"actions"`
	Bans struct {
		MyTeamBans    []int `json:"myTeamBans"`
		TheirTeamBans []int `json:"theirTeamBans"`
		NumBans       int   `json:"numBans"`
	} `json:"bans"`
	MyTeam []struct {
		CellID             int    `json:"cellId"`
		AssignedPosition   string `json:"assignedPosition"`
		ChampionID         int    `json:"championId"`
		ChampionPickIntent int    `json:"championPickIntent"`
		SummonerID         int64  `json:"summonerId"`
		GameName           string `json:"gameName"`
		TagLine            string `json:"tagLine"`
		Puuid              string `json:"puuid"`
		Spell1ID           int    `json:"spell1Id"`
		Spell2ID           int    `json:"spell2Id"`
		SelectedSkinID     int    `json:"selectedSkinId"`
		Team               int    `json:"team"`
		WardSkinID         int    `json:"wardSkinId"`
		NameVisibilityType string `json:"nameVisibilityType"`
	} `json:"myTeam"`
	TheirTeam []struct {
		CellID             int    `json:"cellId"`
		AssignedPosition   string `json:"assignedPosition"`
		ChampionID         int    `json:"championId"`
		ChampionPickIntent int    `json:"championPickIntent"`
		SummonerID         int64  `json:"summonerId"`
		GameName           string `json:"gameName"`
		TagLine            string `json:"tagLine"`
		Puuid              string `json:"puuid"`
		Spell1ID           int    `json:"spell1Id"`
		Spell2ID           int    `json:"spell2Id"`
		SelectedSkinID     int    `json:"selectedSkinId"`
		Team               int    `json:"team"`
		WardSkinID         int    `json:"wardSkinId"`
		NameVisibilityType string `json:"nameVisibilityType"`
	} `json:"theirTeam"`
	LocalPlayerCellID int `json:"localPlayerCellId"`
	Timer             struct {
		Phase                   string `json:"phase"`
		AdjustedTimeLeftInPhase int    `json:"adjustedTimeLeftInPhase"`
		InternalNowInEpochMs    int64  `json:"internalNowInEpochMs"`
		TotalTimeInPhase        int    `json:"totalTimeInPhase"`
		IsInfinite              bool   `json:"isInfinite"`
	} `json:"timer"`
	GameID             int64 `json:"gameId"`
	QueueID            int   `json:"queueId"`
	IsCustomGame       bool  `json:"isCustomGame"`
	IsSpectating       bool  `json:"isSpectating"`
	Counter            int   `json:"counter"`
	AllowSkinSelection bool  `json:"allowSkinSelection"`
	AllowRerolling     bool  `json:"allowRerolling"`
	BenchEnabled       bool  `json:"benchEnabled"`
	RerollsRemaining   int   `json:"rerollsRemaining"`
}

type LCUConnector struct {
	dirPath            string
	lockfileWatcher    *fsnotify.Watcher
	processTicker      *time.Ticker
	stopCh             chan struct{}
	mu                 sync.Mutex
	OnConnect          chan ConnectionInfo
	OnDisconnect       chan struct{}
	OnChampSelect      chan ChampSelectSession
	OnChampSelectEnded chan struct{}
	wsConn             *websocket.Conn
	wsContext          context.Context
	wsCancel           context.CancelFunc
}

// -------- PUBLIC METHODS --------

func New(executablePath string) *LCUConnector {
	conn := &LCUConnector{
		OnConnect:          make(chan ConnectionInfo),
		OnDisconnect:       make(chan struct{}),
		OnChampSelect:      make(chan ChampSelectSession),
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

// -------- PRIVATE METHODS --------

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
	// Start watching directory
	watcher.Add(l.dirPath)

	// If already exists, trigger connect
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
	// Lockfile format: <name>:<PID>:<port>:<password>:<protocol>
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

	// Initialize WebSocket connection
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

	// Clear existing connection if any
	if l.wsConn != nil {
		return
	}

	// Create context for WebSocket
	l.wsContext, l.wsCancel = context.WithCancel(context.Background())

	// Build WebSocket URL
	wsURL := fmt.Sprintf("wss://%s:%s@%s:%s/", info.Username, info.Password, info.Address, info.Port)

	// Configure WebSocket dialer with TLS config
	dialer := websocket.DialOptions{
		HTTPClient: &http.Client{
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		},
	}

	// Connect to WebSocket
	conn, _, err := websocket.Dial(l.wsContext, wsURL, &dialer)
	if err != nil {
		return
	}

	l.wsConn = conn

	// Start WebSocket listener
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
	// Subscribe to champ select events
	subMsg := []any{5, "OnJsonApiEvent_lol-champ-select_v1_session"}
	msgBytes, err := json.Marshal(subMsg)
	if err != nil {
		return
	}

	if err := l.wsConn.Write(l.wsContext, websocket.MessageText, msgBytes); err != nil {
		return
	}

	// Read messages in a loop
	for {
		select {
		case <-l.wsContext.Done():
			return
		default:
			_, data, err := l.wsConn.Read(l.wsContext)
			if err != nil {
				return
			}

			// Parse WebSocket message
			var payload []any
			if err := json.Unmarshal(data, &payload); err != nil || len(payload) < 3 {
				continue
			}

			// Check if it's the event we subscribed to
			eventType, ok := payload[1].(string)
			if !ok || eventType != "OnJsonApiEvent_lol-champ-select_v1_session" {
				continue
			}

			// Parse the event data
			body, err := json.Marshal(payload[2])
			if err != nil {
				continue
			}

			var champData struct {
				EventType string             `json:"eventType"`
				Data      ChampSelectSession `json:"data"`
			}
			if err := json.Unmarshal(body, &champData); err != nil {
				continue
			}

			// Handle different event types
			if champData.EventType == "Delete" {
				// Champion select ended
				select {
				case l.OnChampSelectEnded <- struct{}{}:
				default:
				}
				continue
			}

			// Emit champ select data for Create and Update events
			select {
			case l.OnChampSelect <- champData.Data:
			default:
			}
		}
	}
}

// -------- HELPER FUNCTIONS --------

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
