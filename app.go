package main

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"syscall"
	"time"
	"unsafe"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var (
	user32                       = syscall.NewLazyDLL("user32.dll")
	procFindWindow               = user32.NewProc("FindWindowW")
	procGetWindowRect            = user32.NewProc("GetWindowRect")
	procGetForegroundWindow      = user32.NewProc("GetForegroundWindow")
	procIsWindowVisible          = user32.NewProc("IsWindowVisible")
	procIsIconic                 = user32.NewProc("IsIconic")
	procGetWindowTextW           = user32.NewProc("GetWindowTextW")
	procSetWindowPos             = user32.NewProc("SetWindowPos")
	procGetWindowThreadProcessId = user32.NewProc("GetWindowThreadProcessId")
	procAttachThreadInput        = user32.NewProc("AttachThreadInput")
	procSetWindowLong            = user32.NewProc("SetWindowLongPtrW")
	procGetWindowLong            = user32.NewProc("GetWindowLongPtrW")
)

const (
	SWP_NOSIZE       = 0x0001
	SWP_NOMOVE       = 0x0002
	SWP_NOACTIVATE   = 0x0010
	HWND_TOPMOST     = ^uintptr(0) // -1
	HWND_NOTOPMOST   = ^uintptr(1) // -2
	WS_EX_NOACTIVATE = 0x08000000
	WS_EX_TOOLWINDOW = 0x00000080
)

const GWL_EXSTYLE = ^uintptr(19) // -20 in two's complement

type RECT struct {
	Left   int32
	Top    int32
	Right  int32
	Bottom int32
}

// App struct
type App struct {
	ctx        context.Context
	monitoring bool
	stopChan   chan bool
	connector  *LCUConnector
	lcuClient  *http.Client
	connInfo   *ConnectionInfo
}

// NewApp creates a new App application struct
func NewApp() *App {
	// Create HTTP client that ignores SSL verification (LCU uses self-signed cert)
	httpClient := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
		Timeout: 10 * time.Second,
	}

	return &App{
		stopChan:  make(chan bool),
		lcuClient: httpClient,
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Get our window handle and modify its extended styles to prevent taskbar blinking
	go func() {
		// Wait a bit for the window to be created
		time.Sleep(500 * time.Millisecond)

		ourHwnd := getOurWindowHandle()
		if ourHwnd != 0 {
			// Get current extended style
			exStyle, _, _ := procGetWindowLong.Call(ourHwnd, GWL_EXSTYLE)

			// Add WS_EX_NOACTIVATE and WS_EX_TOOLWINDOW to prevent taskbar notifications
			newExStyle := exStyle | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW

			// Set the new extended style
			procSetWindowLong.Call(ourHwnd, GWL_EXSTYLE, newExStyle)

			// Force window to update with new styles
			// Hide and show to apply the toolwindow style (removes from taskbar)
			runtime.Hide(ctx)
			time.Sleep(50 * time.Millisecond)
		}
	}()

	// Initialize LCU Connector
	a.connector = New("")
	go a.handleLCUConnection()
	a.connector.Start()

	// Start monitoring automatically on startup
	go a.StartMonitoring()
}

// handleLCUConnection handles LCU connect/disconnect events
func (a *App) handleLCUConnection() {
	for {
		select {
		case info := <-a.connector.OnConnect:
			a.connInfo = &info
			runtime.EventsEmit(a.ctx, "lcu:connected", info)
		case <-a.connector.OnDisconnect:
			a.connInfo = nil
			runtime.EventsEmit(a.ctx, "lcu:disconnected")
		case champSelect := <-a.connector.OnChampSelect:
			runtime.EventsEmit(a.ctx, "lcu:champ-select", champSelect)
		}
	}
}

// findLeagueWindow finds the League of Legends client window
func findLeagueWindow() (uintptr, error) {
	title, err := syscall.UTF16PtrFromString("League of Legends")
	if err != nil {
		return 0, err
	}

	hwnd, _, _ := procFindWindow.Call(0, uintptr(unsafe.Pointer(title)))
	if hwnd == 0 {
		return 0, fmt.Errorf("league of Legends window not found")
	}

	return hwnd, nil
}

// getWindowRect gets the position and size of a window
func getWindowRect(hwnd uintptr) (*RECT, error) {
	var rect RECT
	ret, _, _ := procGetWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&rect)))
	if ret == 0 {
		return nil, fmt.Errorf("failed to get window rect")
	}
	return &rect, nil
}

// isWindowVisible checks if a window is visible
func isWindowVisible(hwnd uintptr) bool {
	ret, _, _ := procIsWindowVisible.Call(hwnd)
	return ret != 0
}

// isWindowMinimized checks if a window is minimized
func isWindowMinimized(hwnd uintptr) bool {
	ret, _, _ := procIsIconic.Call(hwnd)
	return ret != 0
}

// getForegroundWindow gets the currently focused window
func getForegroundWindow() uintptr {
	hwnd, _, _ := procGetForegroundWindow.Call()
	return hwnd
}

// getOurWindowHandle gets our Wails window handle
func getOurWindowHandle() uintptr {
	title, _ := syscall.UTF16PtrFromString("rez - League Overlay")
	hwnd, _, _ := procFindWindow.Call(0, uintptr(unsafe.Pointer(title)))
	return hwnd
}

// setWindowPos sets the window position with z-order control
func setWindowPos(hwnd, hwndInsertAfter uintptr, x, y, width, height int, flags uint32) bool {
	ret, _, _ := procSetWindowPos.Call(
		hwnd,
		hwndInsertAfter,
		uintptr(x),
		uintptr(y),
		uintptr(width),
		uintptr(height),
		uintptr(flags),
	)
	return ret != 0
}

// isLoLInForeground checks if the LoL window is in the foreground
func isLoLInForeground(lolHwnd uintptr) bool {
	foregroundHwnd := getForegroundWindow()
	// Only return true if LoL is the actual foreground window
	return foregroundHwnd == lolHwnd
}

// PositionWindow positions the app window next to the League client
func (a *App) PositionWindow() string {
	hwnd, err := findLeagueWindow()
	if err != nil {
		return "League of Legends window not found"
	}

	rect, err := getWindowRect(hwnd)
	if err != nil {
		return "Failed to get LoL window position"
	}

	// Check if window is visible and not minimized
	if !isWindowVisible(hwnd) || isWindowMinimized(hwnd) {
		runtime.Hide(a.ctx)
		return "LoL window is hidden or minimized"
	}

	// Calculate position (300px to the left of LoL window)
	width := 300
	height := int(rect.Bottom - rect.Top)
	x := int(rect.Left) - width
	y := int(rect.Top)

	// If positioning would go off-screen to the left, position to the right instead
	if x < 0 {
		x = int(rect.Right)
	}

	// Show window if it was hidden
	runtime.Show(a.ctx)

	// Set window position and size
	runtime.WindowSetPosition(a.ctx, x, y)
	runtime.WindowSetSize(a.ctx, width, height)

	return fmt.Sprintf("Positioned at (%d, %d) with size %dx%d", x, y, width, height)
}

// StartMonitoring starts monitoring the League window position
func (a *App) StartMonitoring() string {
	if a.monitoring {
		return "Already monitoring"
	}

	a.monitoring = true
	a.stopChan = make(chan bool)

	go func() {
		ticker := time.NewTicker(16 * time.Millisecond) // Check every ~16ms (60fps)
		defer ticker.Stop()

		var lastRect *RECT
		var wasVisible bool = true
		var wasInForeground bool = true

		for {
			select {
			case <-a.stopChan:
				return
			case <-ticker.C:
				lolHwnd, err := findLeagueWindow()
				if err != nil {
					// LoL window not found, hide our window if it was visible
					if wasVisible {
						runtime.Hide(a.ctx)
						wasVisible = false
						wasInForeground = false
					}
					continue
				}

				// Check if LoL is actually in the foreground (and not minimized)
				inForeground := isLoLInForeground(lolHwnd) && !isWindowMinimized(lolHwnd)

				// Handle foreground state changes - this is the primary visibility control
				if inForeground != wasInForeground {
					if inForeground {
						// LoL came to foreground, show our window
						runtime.Show(a.ctx)
						wasVisible = true
					} else {
						// LoL lost foreground or was minimized, hide our window
						runtime.Hide(a.ctx)
						wasVisible = false
					}
					wasInForeground = inForeground
				}

				// If LoL is not in foreground, skip positioning
				if !inForeground {
					continue
				}

				// Get window position for repositioning
				rect, err := getWindowRect(lolHwnd)
				if err != nil {
					continue
				}

				// If position or size changed, reposition our window
				positionChanged := lastRect == nil ||
					lastRect.Left != rect.Left ||
					lastRect.Top != rect.Top ||
					lastRect.Right != rect.Right ||
					lastRect.Bottom != rect.Bottom

				if positionChanged {
					width := 400
					height := int(rect.Bottom - rect.Top)

					// Calculate position to the left of LoL window
					x := int(rect.Left) - width
					y := int(rect.Top)

					// If positioning would go off-screen to the left, position to the right instead
					if x < 0 {
						x = int(rect.Right)
					}

					// Use SetWindowPos for smoother, more direct positioning
					ourHwnd := getOurWindowHandle()
					if ourHwnd != 0 {
						// Position right behind the LoL window (not topmost, to avoid focus stealing)
						setWindowPos(ourHwnd, lolHwnd, x, y, width, height, SWP_NOACTIVATE)
					} else {
						// Fallback to runtime methods if we can't get our window handle
						runtime.WindowSetPosition(a.ctx, x, y)
						runtime.WindowSetSize(a.ctx, width, height)
					}

					lastRect = rect
				}
			}
		}
	}()

	return "Monitoring started"
}

// StopMonitoring stops monitoring the League window
func (a *App) StopMonitoring() string {
	if !a.monitoring {
		return "Not currently monitoring"
	}

	a.monitoring = false
	close(a.stopChan)

	return "Monitoring stopped"
}

// -------- LCU API METHODS --------

// lcuRequest makes an HTTP request to the LCU API
func (a *App) lcuRequest(method, endpoint string) (map[string]interface{}, error) {
	if a.connInfo == nil {
		return nil, fmt.Errorf("not connected to LCU")
	}

	url := fmt.Sprintf("%s://%s:%s%s", a.connInfo.Protocol, a.connInfo.Address, a.connInfo.Port, endpoint)
	req, err := http.NewRequest(method, url, nil)
	if err != nil {
		return nil, err
	}

	// Add basic auth
	auth := base64.StdEncoding.EncodeToString([]byte(a.connInfo.Username + ":" + a.connInfo.Password))
	req.Header.Add("Authorization", "Basic "+auth)

	resp, err := a.lcuClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	return result, nil
}

// GetCurrentSummoner fetches the current summoner's profile
func (a *App) GetCurrentSummoner() (map[string]interface{}, error) {
	return a.lcuRequest("GET", "/lol-summoner/v1/current-summoner")
}

// GetSummonerProfile fetches the current summoner's detailed profile
func (a *App) GetSummonerProfile() (map[string]interface{}, error) {
	return a.lcuRequest("GET", "/lol-summoner/v1/current-summoner/summoner-profile")
}

// GetChatMe fetches the current user's chat info
func (a *App) GetChatMe() (map[string]interface{}, error) {
	return a.lcuRequest("GET", "/lol-chat/v1/me")
}

// GetMatchHistory fetches the current summoner's match history
func (a *App) GetMatchHistory() (map[string]interface{}, error) {
	return a.lcuRequest("GET", "/lol-match-history/v1/products/lol/current-summoner/matches")
}

// GetFriends fetches the friends list
func (a *App) GetFriends() ([]interface{}, error) {
	result, err := a.lcuRequest("GET", "/lol-chat/v1/friends")
	if err != nil {
		return nil, err
	}

	// Convert to array if it's an array
	if arr, ok := result["friends"].([]interface{}); ok {
		return arr, nil
	}

	// If the result itself is an array (unlikely with map return type)
	return []interface{}{result}, nil
}

// GetConversations fetches active conversations
func (a *App) GetConversations() ([]interface{}, error) {
	result, err := a.lcuRequest("GET", "/lol-chat/v1/conversations")
	if err != nil {
		return nil, err
	}

	// The result might be an array directly
	if arr, ok := result["conversations"].([]interface{}); ok {
		return arr, nil
	}

	return []interface{}{result}, nil
}

// GetLobby fetches current lobby information
func (a *App) GetLobby() (map[string]interface{}, error) {
	return a.lcuRequest("GET", "/lol-lobby/v2/lobby")
}

// IsLCUConnected returns whether we're connected to the LCU
func (a *App) IsLCUConnected() bool {
	return a.connInfo != nil
}
