package main

import (
	"fmt"
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"
)

// commandHandlers maps slash command names to handler functions.
var commandHandlers = map[string]func(*App, *discordgo.Session, *discordgo.InteractionCreate) error{
	"ping":   handlePing,
	"echo":   handleEcho,
	"server": handleServer,
	"user":   handleUser,
}

func applicationCommands() []*discordgo.ApplicationCommand {
	return []*discordgo.ApplicationCommand{
		{
			Name:        "ping",
			Description: "Replies with Pong!",
		},
		{
			Name:        "echo",
			Description: "Replies with your input!",
			Options: []*discordgo.ApplicationCommandOption{
				{
					Type:        discordgo.ApplicationCommandOptionString,
					Name:        "input",
					Description: "The input to echo back",
					Required:    true,
				},
			},
		},
		{
			Name:        "server",
			Description: "Provides information about the server.",
		},
		{
			Name:        "user",
			Description: "Provides information about the user.",
		},
	}
}

func handlePing(_ *App, s *discordgo.Session, i *discordgo.InteractionCreate) error {
	if err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{Content: "Pong!"},
	}); err != nil {
		return err
	}

	if _, err := s.FollowupMessageCreate(i.Interaction, false, &discordgo.WebhookParams{Content: "Pong again!"}); err != nil {
		return err
	}

	_, err := s.FollowupMessageCreate(i.Interaction, false, &discordgo.WebhookParams{
		Content: "Secret Pong!",
		Flags:   discordgo.MessageFlagsEphemeral,
	})
	return err
}

func handleEcho(_ *App, s *discordgo.Session, i *discordgo.InteractionCreate) error {
	var input string
	for _, option := range i.ApplicationCommandData().Options {
		if option.Name == "input" {
			input = option.StringValue()
			break
		}
	}

	if input == "" {
		input = "(no input provided)"
	}

	content := fmt.Sprintf("You said \"%s\".", escapeFormatting(input))
	return s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{Content: content},
	})
}

func handleServer(_ *App, s *discordgo.Session, i *discordgo.InteractionCreate) error {
	if i.GuildID == "" {
		return s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{
				Content: "This command can only be used within a server.",
				Flags:   discordgo.MessageFlagsEphemeral,
			},
		})
	}

	guild, err := s.State.Guild(i.GuildID)
	if err != nil {
		guild, err = s.Guild(i.GuildID)
		if err != nil {
			return err
		}
	}

	message := fmt.Sprintf("This server is %s and has %d members.", guild.Name, guild.MemberCount)
	return s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{Content: message},
	})
}

func handleUser(app *App, s *discordgo.Session, i *discordgo.InteractionCreate) error {
	user := i.User
	if user == nil && i.Member != nil {
		user = i.Member.User
	}
	if user == nil {
		return s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{Content: "Could not determine who ran this command."},
		})
	}

	joinedAt := "an unknown date"
	if i.Member != nil {
		t := i.Member.JoinedAt
		if !t.IsZero() {
			joinedAt = t.In(app.location).Format(time.RFC1123)
		}
	}

	message := fmt.Sprintf("This command was run by %s, who joined on %s.", user.Username, joinedAt)
	return s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{Content: message},
	})
}

// escapeFormatting ensures user-provided text does not break Discord markdown formatting.
func escapeFormatting(input string) string {
	replacer := strings.NewReplacer(
		"*", "\\*",
		"_", "\\_",
		"~", "\\~",
		"`", "\\`",
		"|", "\\|",
	)
	return replacer.Replace(input)
}
