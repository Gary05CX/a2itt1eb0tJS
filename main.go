package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/joho/godotenv"
)

// App aggregates runtime dependencies for the bot.
type App struct {
	db            *Database
	applicationID string
	location      *time.Location
	voiceTracker  *VoiceTracker
	heartbeatQuit context.CancelFunc
	baseContext   context.Context
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("no .env file found: %v", err)
	}

	token := os.Getenv("TOKEN")
	applicationID := os.Getenv("APPLICATION_ID")
	databaseURL := os.Getenv("DATABASE_URL")
	timezoneName := os.Getenv("TIMEZONE")

	if token == "" {
		log.Fatal("TOKEN environment variable must be set")
	}
	if applicationID == "" {
		log.Fatal("APPLICATION_ID environment variable must be set")
	}

	location := time.UTC
	if timezoneName != "" {
		if loc, err := time.LoadLocation(timezoneName); err == nil {
			location = loc
		} else {
			log.Printf("failed to load TIMEZONE '%s', defaulting to UTC: %v", timezoneName, err)
		}
	}

	rootCtx := context.Background()

	db, err := NewDatabase(rootCtx, databaseURL)
	if err != nil {
		log.Fatalf("initialise database: %v", err)
	}

	app := &App{
		db:            db,
		applicationID: applicationID,
		location:      location,
		voiceTracker:  NewVoiceTracker(),
		baseContext:   rootCtx,
	}

	session, err := discordgo.New("Bot " + token)
	if err != nil {
		log.Fatalf("create Discord session: %v", err)
	}

	session.Identify.Intents = discordgo.IntentsGuilds | discordgo.IntentsGuildVoiceStates

	session.AddHandler(app.onReady)
	session.AddHandler(app.onInteractionCreate)
	session.AddHandler(app.onVoiceStateUpdate)

	if err := session.Open(); err != nil {
		log.Fatalf("open Discord session: %v", err)
	}
	log.Println("Discord session started")

	if err := app.registerCommands(session); err != nil {
		log.Fatalf("register commands: %v", err)
	}

	app.startHeartbeat()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Println("Shutting down...")

	app.stopHeartbeat()

	if err := app.cleanupCommands(session); err != nil {
		log.Printf("cleanup commands: %v", err)
	}

	if err := session.Close(); err != nil {
		log.Printf("close Discord session: %v", err)
	}

	if err := app.db.Close(); err != nil {
		log.Printf("close database: %v", err)
	}
}

func (a *App) registerCommands(s *discordgo.Session) error {
	commands := applicationCommands()
	_, err := s.ApplicationCommandBulkOverwrite(a.applicationID, "", commands)
	return err
}

func (a *App) cleanupCommands(s *discordgo.Session) error {
	// To avoid wiping out commands unintentionally, skip cleanup on shutdown.
	return nil
}

func (a *App) onReady(s *discordgo.Session, event *discordgo.Ready) {
	username := "unknown"
	if event.User != nil {
		username = event.User.String()
	}
	log.Printf("Ready! Logged in as %s", username)

	a.recordEvent("ready", map[string]any{
		"readyAt": a.nowString(),
	})
}

func (a *App) onInteractionCreate(s *discordgo.Session, i *discordgo.InteractionCreate) {
	if i.Type != discordgo.InteractionApplicationCommand {
		return
	}

	handler, ok := commandHandlers[i.ApplicationCommandData().Name]
	if !ok {
		_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{
				Content: "Command not recognised.",
				Flags:   discordgo.MessageFlagsEphemeral,
			},
		})
		return
	}

	if err := handler(a, s, i); err != nil {
		log.Printf("command %s failed: %v", i.ApplicationCommandData().Name, err)
		_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{
				Content: "There was an error while executing this command!",
				Flags:   discordgo.MessageFlagsEphemeral,
			},
		})
	}
}

func (a *App) onVoiceStateUpdate(s *discordgo.Session, update *discordgo.VoiceStateUpdate) {
	guildID := update.GuildID
	userID := update.UserID
	newChannelID := update.ChannelID

	oldChannelID, hadPrevious := a.voiceTracker.Get(guildID, userID)

	switch {
	case newChannelID != "" && !hadPrevious:
		a.voiceTracker.Set(guildID, userID, newChannelID)
		a.logVoiceEvent(s, "join", update, oldChannelID, newChannelID, "joinVoiceChannel", map[string]any{
			"Server":  guildID,
			"Channel": newChannelID,
			"User":    userID,
			"joinAt":  a.nowString(),
		})
	case newChannelID == "" && hadPrevious:
		a.voiceTracker.Delete(guildID, userID)
		a.logVoiceEvent(s, "leave", update, oldChannelID, newChannelID, "leaveVoiceChannel", map[string]any{
			"Server":  guildID,
			"Channel": oldChannelID,
			"User":    userID,
			"joinAt":  a.nowString(),
		})
	case newChannelID != "" && hadPrevious && newChannelID != oldChannelID:
		a.voiceTracker.Set(guildID, userID, newChannelID)
		a.logVoiceEvent(s, "move", update, oldChannelID, newChannelID, "moveVoiceChannel", map[string]any{
			"Server":     guildID,
			"oldChannel": oldChannelID,
			"newChannel": newChannelID,
			"User":       userID,
			"joinAt":     a.nowString(),
		})
	default:
		if newChannelID == "" {
			a.voiceTracker.Delete(guildID, userID)
		} else {
			a.voiceTracker.Set(guildID, userID, newChannelID)
		}
	}
}

func (a *App) logVoiceEvent(s *discordgo.Session, action string, update *discordgo.VoiceStateUpdate, oldChannelID, newChannelID, collection string, payload map[string]any) {
	userTag := update.UserID
	if update.Member != nil && update.Member.User != nil {
		userTag = update.Member.User.String()
	}

	guildName := "UnknownServer"
	if guild, err := s.State.Guild(update.GuildID); err == nil && guild != nil {
		guildName = guild.Name
	} else if guild, err := s.Guild(update.GuildID); err == nil && guild != nil {
		guildName = guild.Name
	}

	oldChannelName := channelNameForID(s, update.GuildID, oldChannelID)
	newChannelName := channelNameForID(s, update.GuildID, newChannelID)

	switch action {
	case "join":
		log.Printf("<join> %s %s %s %s", userTag, guildName, newChannelName, a.nowString())
	case "leave":
		log.Printf("<leave> %s %s %s %s", userTag, guildName, oldChannelName, a.nowString())
	case "move":
		log.Printf("<move> %s %s %s -> %s %s", userTag, guildName, oldChannelName, newChannelName, a.nowString())
	}

	a.recordEvent(collection, payload)
}

func channelNameForID(s *discordgo.Session, guildID, channelID string) string {
	if channelID == "" {
		return "UnknownChannel"
	}
	if channel, err := s.State.Channel(channelID); err == nil && channel != nil {
		return channel.Name
	}
	if channel, err := s.Channel(channelID); err == nil && channel != nil {
		return channel.Name
	}
	return "UnknownChannel"
}

func (a *App) startHeartbeat() {
	ctx, cancel := context.WithCancel(a.baseContext)
	a.heartbeatQuit = cancel

	ticker := time.NewTicker(10 * time.Second)

	go func() {
		for {
			select {
			case <-ticker.C:
				a.recordEvent("heartbeat", map[string]any{
					"aliveAt": a.nowString(),
				})
			case <-ctx.Done():
				ticker.Stop()
				return
			}
		}
	}()
}

func (a *App) stopHeartbeat() {
	if a.heartbeatQuit != nil {
		a.heartbeatQuit()
	}
}

func (a *App) nowString() string {
	return time.Now().In(a.location).Format(time.RFC3339)
}

func (a *App) recordEvent(collection string, payload map[string]any) {
	ctx, cancel := context.WithTimeout(a.baseContext, 5*time.Second)
	defer cancel()

	if err := a.db.InsertEvent(ctx, collection, payload); err != nil {
		log.Printf("failed to record %s event: %v", collection, err)
	}
}
