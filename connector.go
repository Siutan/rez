package main

import (
	"bytes"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

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

type LCUConnector struct {
	dirPath         string
	lockfileWatcher *fsnotify.Watcher
	processTicker   *time.Ticker
	stopCh          chan struct{}
	mu              sync.Mutex
	OnConnect       chan ConnectionInfo
	OnDisconnect    chan struct{}
}

// -------- PUBLIC METHODS --------

func New(executablePath string) *LCUConnector {
	conn := &LCUConnector{
		OnConnect:    make(chan ConnectionInfo),
		OnDisconnect: make(chan struct{}),
		stopCh:       make(chan struct{}),
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
	select {
	case l.OnConnect <- info:
	default:
	}
}

func (l *LCUConnector) onFileRemoved() {
	select {
	case l.OnDisconnect <- struct{}{}:
	default:
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
