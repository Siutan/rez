package main

import (
	"embed"
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	_ = godotenv.Load(".env") // optional error check
	mockEnabled := envBool("MOCK_CHAMP_SELECT")
	mockWS := os.Getenv("MOCK_WS_URL")
	if mockWS == "" {
		mockWS = "ws://127.0.0.1:18080/ws"
	}

	app := NewApp(mockEnabled, mockWS)
	log.Println("Mock enabled:", mockEnabled)

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "rez - League Overlay",
		Width:  400,
		Height: 800, // Will be resized to match LoL client height
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 0, G: 0, B: 0, A: 0},
		OnStartup:        app.startup,
		Frameless:        true, // Keep frameless for clean overlay look
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

func envBool(name string) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(name)))
	return v == "1" || v == "true" || v == "yes" || v == "on"
}
