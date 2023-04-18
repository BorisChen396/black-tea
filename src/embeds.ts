import { Colors, EmbedBuilder } from "discord.js"

export function errorEmbed(error : Error) {
    return new EmbedBuilder()
        .setTitle(error.name)
        .setDescription(error.message)
        .setColor(Colors.Red);
}